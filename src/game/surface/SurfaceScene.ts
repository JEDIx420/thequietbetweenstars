import * as THREE from 'three';
import { SeededRandom } from '../universe/SeededRandom';
import type { PlanetDescriptor } from '../systems/PlanetDescriptor';
import type { LandingSite } from '../systems/LandingSiteGenerator';
import { SurveyCraft } from '../scenes/spaceCraft';
import type { NormalizedInputState } from '../input/InputSource';

export class SurfaceScene {
  public scene: THREE.Scene;
  public shipGroup: THREE.Group;
  public surveyCraft: SurveyCraft;
  public planet: PlanetDescriptor;
  public site: LandingSite;

  // Surface flight dynamics
  public shipPosition = new THREE.Vector3(0, 18, 0); // Ship coordinates relative to terrain origin
  public shipVelocity = new THREE.Vector3(0, 0, 0);
  public shipYaw = 0;
  public shipPitch = 0;
  public shipRoll = 0;

  // Terrain streaming
  private terrainGroup = new THREE.Group();
  private activeChunks: Map<string, THREE.Mesh> = new Map();
  private chunkSize = 200;
  private chunkSegments = 28;

  // Environmental props
  private propsGroup = new THREE.Group();
  private scannableProps: Array<{ mesh: THREE.Mesh; name: string; info: string }> = [];

  constructor(planet: PlanetDescriptor, site: LandingSite) {
    this.planet = planet;
    this.site = site;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(new THREE.Color(planet.palette.atmosphereGlow), 0.0035);

    // Sky dome & ambient light
    const hemiLight = new THREE.HemisphereLight(
      new THREE.Color(planet.palette.atmosphereGlow),
      new THREE.Color(planet.palette.primary),
      1.5
    );
    this.scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfffaed, 2.5);
    sunLight.position.set(300, 500, 200);
    this.scene.add(sunLight);

    this.scene.add(this.terrainGroup);
    this.scene.add(this.propsGroup);

    // Survey Craft
    this.surveyCraft = new SurveyCraft();
    this.shipGroup = this.surveyCraft.group;
    this.shipGroup.position.copy(this.shipPosition);
    this.scene.add(this.shipGroup);

    // Initial terrain generation
    this.updateTerrain(this.shipPosition);
  }

  public update(
    input: NormalizedInputState,
    dt: number,
    camera: THREE.PerspectiveCamera
  ): { activeScanTarget: { name: string; info: string } | null } {
    const clampedDt = Math.min(dt, 0.06);

    // 1. Hover-Stabilized Surface Movement Model
    // Turning
    this.shipYaw += -input.axes.x * clampedDt * 1.8;
    this.shipPitch = input.axes.y * 0.45;
    this.shipRoll = -input.axes.x * 0.35;

    this.shipGroup.rotation.set(0, 0, 0);
    this.shipGroup.rotateY(this.shipYaw);
    this.shipGroup.rotateX(this.shipPitch);
    this.shipGroup.rotateZ(this.shipRoll);

    // Forward propulsion (throttle)
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.shipYaw);
    const speed = input.throttle * 65; // Max 65 units/sec on surface
    const targetVel = forward.multiplyScalar(speed);

    this.shipVelocity.lerp(targetVel, clampedDt * 3.5);
    this.shipPosition.addScaledVector(this.shipVelocity, clampedDt);

    // Ground clearance & hover assistance
    const groundHeight = this.getTerrainHeight(this.shipPosition.x, this.shipPosition.z);
    const minHoverAltitude = groundHeight + 8.5; // Always hover safely above rocks/ridges
    if (this.shipPosition.y < minHoverAltitude) {
      this.shipPosition.y += (minHoverAltitude - this.shipPosition.y) * clampedDt * 6.0;
    } else {
      // Gentle natural altitude float
      this.shipPosition.y = THREE.MathUtils.lerp(this.shipPosition.y, minHoverAltitude + 3, clampedDt * 2.0);
    }

    this.shipGroup.position.copy(this.shipPosition);

    // Survey Craft animation
    this.surveyCraft.update(clampedDt, input.throttle, input.axes.x, input.axes.y);

    // 2. Dynamic Third-Person Surface Camera
    const camOffset = new THREE.Vector3(0, 5.5, 14).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.shipYaw);
    const targetCamPos = this.shipPosition.clone().add(camOffset);
    camera.position.lerp(targetCamPos, clampedDt * 4.5);

    const lookAhead = this.shipPosition.clone().add(forward.clone().multiplyScalar(15));
    camera.lookAt(lookAhead);

    // 3. Terrain streaming updates
    this.updateTerrain(this.shipPosition);

    // 4. Check for nearby scannable surface entity
    let scanTarget: { name: string; info: string } | null = null;
    let minDist = 45;

    for (const prop of this.scannableProps) {
      const dist = this.shipPosition.distanceTo(prop.mesh.position);
      if (dist < minDist) {
        minDist = dist;
        scanTarget = { name: prop.name, info: prop.info };
      }
    }

    return { activeScanTarget: scanTarget };
  }

  public getTerrainHeight(x: number, z: number): number {
    const s = this.planet.seed;
    // Multi-octave sinusoidal terrain noise
    const h1 = Math.sin((x + s) * 0.015) * Math.cos((z + s) * 0.015) * 16;
    const h2 = Math.sin((x * 0.04) + s * 2) * Math.sin((z * 0.04) + s * 2) * 6;
    const h3 = Math.cos((x * 0.08) - s) * 2;
    return Math.max(0, h1 + h2 + h3);
  }

  private updateTerrain(center: THREE.Vector3): void {
    const cx = Math.floor(center.x / this.chunkSize);
    const cz = Math.floor(center.z / this.chunkSize);
    const radius = 1; // 3x3 chunks around ship
    const activeKeys = new Set<string>();

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const key = `${cx + dx},${cz + dz}`;
        activeKeys.add(key);

        if (!this.activeChunks.has(key)) {
          const mesh = this.createTerrainChunk(cx + dx, cz + dz);
          this.terrainGroup.add(mesh);
          this.activeChunks.set(key, mesh);

          // Add procedural features
          this.spawnChunkProps(cx + dx, cz + dz);
        }
      }
    }

    // Unload distant chunks
    for (const [key, mesh] of this.activeChunks) {
      if (!activeKeys.has(key)) {
        this.terrainGroup.remove(mesh);
        mesh.geometry.dispose();
        this.activeChunks.delete(key);
      }
    }
  }

  private createTerrainChunk(cx: number, cz: number): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(
      this.chunkSize,
      this.chunkSize,
      this.chunkSegments,
      this.chunkSegments
    );
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i) + cx * this.chunkSize;
      const vz = pos.getZ(i) + cz * this.chunkSize;
      const vy = this.getTerrainHeight(vx, vz);
      pos.setY(i, vy);
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.planet.palette.primary),
      roughness: 0.85,
      metalness: 0.15,
      flatShading: true,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx * this.chunkSize, 0, cz * this.chunkSize);
    return mesh;
  }

  private spawnChunkProps(cx: number, cz: number): void {
    const chunkSeed = SeededRandom.hashCoords(this.planet.seed, cx, 0, cz);
    const rng = new SeededRandom(chunkSeed);

    // Spawn 1-2 crystalline spires or geological monuments per chunk
    const count = rng.rangeInt(1, 2);
    for (let i = 0; i < count; i++) {
      const px = cx * this.chunkSize + rng.range(-this.chunkSize * 0.4, this.chunkSize * 0.4);
      const pz = cz * this.chunkSize + rng.range(-this.chunkSize * 0.4, this.chunkSize * 0.4);
      const py = this.getTerrainHeight(px, pz);

      const height = rng.range(8, 22);
      const spireGeo = new THREE.ConeGeometry(rng.range(2, 4.5), height, 5);
      const spireMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(this.planet.palette.secondary),
        roughness: 0.3,
        metalness: 0.7,
        emissive: new THREE.Color(this.planet.palette.atmosphereGlow),
        emissiveIntensity: 0.25,
      });

      const mesh = new THREE.Mesh(spireGeo, spireMat);
      mesh.position.set(px, py + height / 2, pz);
      this.propsGroup.add(mesh);

      this.scannableProps.push({
        mesh,
        name: `${this.site.biome} Geological Monolith`,
        info: `Harmonic crystal lattice. High mineral density. Stable energy resonance.`,
      });
    }
  }

  public dispose(): void {
    for (const [, mesh] of this.activeChunks) {
      mesh.geometry.dispose();
    }
    this.terrainGroup.clear();
    this.propsGroup.clear();
  }
}
