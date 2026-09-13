import * as THREE from 'three';
import { SeededRandom } from '../universe/SeededRandom';
import type { PlanetDescriptor } from '../systems/PlanetDescriptor';
import type { AtmosphereProfile } from '../planets/PlanetEnvironmentProfile';
import type { LandingSite } from '../systems/LandingSiteGenerator';
import { SurveyCraft } from '../scenes/spaceCraft';
import type { NormalizedInputState } from '../input/InputSource';
import { ProceduralSky } from './ProceduralSky';
import { LandmarkGenerator } from './LandmarkGenerator';

export class SurfaceScene {
  public scene: THREE.Scene;
  public shipGroup: THREE.Group;
  public surveyCraft: SurveyCraft;
  public planet: PlanetDescriptor;
  public site: LandingSite;

  // Surface flight dynamics
  public shipPosition = new THREE.Vector3(0, 18, 0);
  public shipVelocity = new THREE.Vector3(0, 0, 0);
  public shipYaw = 0;
  public shipPitch = 0;
  public shipRoll = 0;

  // Atmospheric sky and lighting
  private proceduralSky: ProceduralSky;
  private particlePoints: THREE.Points | null = null;

  // Terrain streaming
  private terrainGroup = new THREE.Group();
  private activeChunks: Map<string, THREE.Mesh> = new Map();
  private chunkSize = 200;
  private chunkSegments = 32;

  // Ocean / liquid plane
  private liquidGroup = new THREE.Group();
  private activeLiquidChunks: Map<string, THREE.Mesh> = new Map();

  // Environmental props & landmarks
  private propsGroup = new THREE.Group();
  private scannableProps: Array<{ mesh: THREE.Object3D; name: string; info: string }> = [];

  constructor(planet: PlanetDescriptor, site: LandingSite) {
    this.planet = planet;
    this.site = site;
    const profile = planet.profile;

    this.scene = new THREE.Scene();

    // 1. Procedural Atmospheric Sky Dome & Volumetric Fog
    this.proceduralSky = new ProceduralSky(profile.atmosphere);
    this.scene.add(this.proceduralSky.mesh);

    this.scene.fog = new THREE.FogExp2(
      new THREE.Color(profile.atmosphere.fogColor),
      profile.atmosphere.fogDensity
    );

    // 2. Star Lighting (Derived directly from system stellar class)
    const hemiLight = new THREE.HemisphereLight(
      new THREE.Color(profile.atmosphere.skyHorizon),
      new THREE.Color(profile.palette.surfaceLowland),
      profile.atmosphere.hasAtmosphere ? 1.6 : 0.6
    );
    this.scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(
      profile.palette.sunLightColor,
      profile.atmosphere.hasAtmosphere ? 2.8 : 3.6
    );
    sunLight.position.set(400, 600, 300);
    this.scene.add(sunLight);

    // 3. Environmental Atmosphere Particles (Snow, ash, dust, mist)
    if (profile.atmosphere.particleType !== 'none') {
      this.particlePoints = this.createAtmosphericParticles(profile.atmosphere);
      this.scene.add(this.particlePoints);
    }

    // 4. Groups for Terrain, Liquid, and Landmarks
    this.scene.add(this.terrainGroup);
    this.scene.add(this.liquidGroup);
    this.scene.add(this.propsGroup);

    // 5. Survey Craft
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
    this.shipYaw += -input.axes.x * clampedDt * 1.8;
    this.shipPitch = input.axes.y * 0.45;
    this.shipRoll = -input.axes.x * 0.35;

    this.shipGroup.rotation.set(0, 0, 0);
    this.shipGroup.rotateY(this.shipYaw);
    this.shipGroup.rotateX(this.shipPitch);
    this.shipGroup.rotateZ(this.shipRoll);

    // Forward propulsion
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.shipYaw);
    const speed = input.throttle * 65;
    const targetVel = forward.multiplyScalar(speed);

    this.shipVelocity.lerp(targetVel, clampedDt * 3.5);
    this.shipPosition.addScaledVector(this.shipVelocity, clampedDt);

    // Altitude floor relative to procedural terrain
    const groundHeight = this.getTerrainHeight(this.shipPosition.x, this.shipPosition.z);
    const minHoverAltitude = groundHeight + 8.5;
    if (this.shipPosition.y < minHoverAltitude) {
      this.shipPosition.y += (minHoverAltitude - this.shipPosition.y) * clampedDt * 6.0;
    } else {
      this.shipPosition.y = THREE.MathUtils.lerp(this.shipPosition.y, minHoverAltitude + 3, clampedDt * 2.0);
    }

    this.shipGroup.position.copy(this.shipPosition);
    this.surveyCraft.update(clampedDt, input.throttle, input.axes.x, input.axes.y);

    // 2. Camera follow and Sky follow
    const camOffset = new THREE.Vector3(0, 5.5, 14).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.shipYaw);
    const targetCamPos = this.shipPosition.clone().add(camOffset);
    camera.position.lerp(targetCamPos, clampedDt * 4.5);

    const lookAhead = this.shipPosition.clone().add(forward.clone().multiplyScalar(15));
    camera.lookAt(lookAhead);

    this.proceduralSky.update(camera.position);

    // Follow camera with atmospheric particles
    if (this.particlePoints) {
      this.particlePoints.position.copy(this.shipPosition);
    }

    // 3. Terrain and liquid streaming updates
    this.updateTerrain(this.shipPosition);

    // 4. Check for nearby scannable landmark
    let scanTarget: { name: string; info: string } | null = null;
    let minDist = 48;

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
    const profile = this.planet.profile;
    const s = this.planet.seed;
    const morph = profile.terrain.morphology;
    const hScale = profile.terrain.heightScale * this.site.localHeightScale;
    const rough = profile.terrain.roughness * this.site.localRoughness;
    const warp = profile.terrain.domainWarp;

    // Domain warping
    const wx = x + Math.sin(z * 0.02 + s) * 25 * warp;
    const wz = z + Math.cos(x * 0.02 + s) * 25 * warp;

    let elevation = 0;

    switch (morph) {
      case 'craters': {
        // Lunar regolith with sharp crater basins and rims
        const f1 = Math.sin(wx * 0.012) * Math.cos(wz * 0.012);
        const craterNoise = Math.sin(wx * 0.035 + s) * Math.sin(wz * 0.035 + s);
        const rim = Math.abs(craterNoise) > 0.6 ? 12 : 0;
        const basin = craterNoise < -0.3 ? -10 : 0;
        elevation = f1 * 12 + rim + basin;
        break;
      }

      case 'dunes': {
        // Sweeping wind-blown sand dunes with directional crests
        const wave = Math.sin(wx * 0.028 + wz * 0.014);
        const sharpCrest = Math.pow(Math.abs(wave), 1.6) * Math.sign(wave);
        const mesa = Math.cos(wx * 0.008) * Math.sin(wz * 0.008) * 14;
        elevation = sharpCrest * 10 + mesa;
        break;
      }

      case 'volcanic_rift': {
        // Jagged basalt plateaus with deep fissure canyons
        const plateau = Math.sin(wx * 0.018) * Math.cos(wz * 0.018);
        const stepped = Math.floor(plateau * 4) * 3.5;
        const fissure = Math.abs(Math.sin(wx * 0.03 + wz * 0.02)) < 0.15 ? -14 : 0;
        elevation = stepped + fissure;
        break;
      }

      case 'glacier_fissures': {
        // Glacial shelves and sharp cryo-crevasses
        const glacier = Math.sin(wx * 0.015) * 14 + Math.cos(wz * 0.015) * 14;
        const crevasse = Math.abs(Math.cos(wx * 0.04 - wz * 0.04)) < 0.12 ? -12 : 0;
        elevation = glacier + crevasse;
        break;
      }

      case 'archipelago_shallows': {
        // Island mounds rising from ocean shallows
        const island = Math.sin(wx * 0.02) * Math.sin(wz * 0.02);
        elevation = Math.max(-4, Math.pow(Math.max(0, island), 1.4) * 22 - 3);
        break;
      }

      case 'faceted_crystals': {
        // Angular faceted mineral terraces
        const q1 = Math.abs(Math.sin(wx * 0.022)) * 16;
        const q2 = Math.abs(Math.cos(wz * 0.022)) * 16;
        elevation = Math.max(q1, q2);
        break;
      }

      default: {
        // Rolling plains & mountain ridges
        const e1 = Math.sin(wx * 0.015) * Math.cos(wz * 0.015) * 16;
        const e2 = Math.sin(wx * 0.04 + s) * Math.sin(wz * 0.04 + s) * 6;
        elevation = e1 + e2;
        break;
      }
    }

    // High frequency micro-roughness
    const micro = Math.sin(x * 0.12) * Math.cos(z * 0.12) * 2.2 * rough;

    return Math.max(0, (elevation * (hScale / 25)) + micro + 6);
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
          const chunkX = cx + dx;
          const chunkZ = cz + dz;
          const mesh = this.createTerrainChunk(chunkX, chunkZ);
          this.terrainGroup.add(mesh);
          this.activeChunks.set(key, mesh);

          // Liquid plane chunk if applicable
          if (this.planet.profile.terrain.hasLiquid) {
            const liquidMesh = this.createLiquidChunk(chunkX, chunkZ);
            this.liquidGroup.add(liquidMesh);
            this.activeLiquidChunks.set(key, liquidMesh);
          }

          // Spawn procedural landmark props
          this.spawnChunkProps(chunkX, chunkZ);
        }
      }
    }

    // Unload distant chunks
    for (const [key, mesh] of this.activeChunks) {
      if (!activeKeys.has(key)) {
        this.terrainGroup.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.activeChunks.delete(key);

        const lMesh = this.activeLiquidChunks.get(key);
        if (lMesh) {
          this.liquidGroup.remove(lMesh);
          lMesh.geometry.dispose();
          (lMesh.material as THREE.Material).dispose();
          this.activeLiquidChunks.delete(key);
        }
      }
    }
  }

  /**
   * Multi-material surface chunk with dynamic vertex colors based on height, slope, and biome moisture
   */
  private createTerrainChunk(cx: number, cz: number): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(
      this.chunkSize,
      this.chunkSize,
      this.chunkSegments,
      this.chunkSegments
    );
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const palette = this.planet.profile.palette;

    const colLow = new THREE.Color(palette.surfaceLowland);
    const colMid = new THREE.Color(palette.surfaceMidland);
    const colHigh = new THREE.Color(palette.surfaceHighland);
    const colPeak = new THREE.Color(palette.surfacePeak);

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i) + cx * this.chunkSize;
      const vz = pos.getZ(i) + cz * this.chunkSize;
      const vy = this.getTerrainHeight(vx, vz);
      pos.setY(i, vy);

      // Multi-material vertex color blending:
      // vy < 8 -> lowland, 8..18 -> midland, 18..28 -> highland, >28 -> peak
      let vertexColor: THREE.Color;
      if (vy < 8.5) {
        const t = Math.max(0, vy / 8.5);
        vertexColor = colLow.clone().lerp(colMid, t);
      } else if (vy < 20.0) {
        const t = (vy - 8.5) / 11.5;
        vertexColor = colMid.clone().lerp(colHigh, t);
      } else {
        const t = Math.min(1.0, (vy - 20.0) / 12.0);
        vertexColor = colHigh.clone().lerp(colPeak, t);
      }

      colors[i * 3] = vertexColor.r;
      colors[i * 3 + 1] = vertexColor.g;
      colors[i * 3 + 2] = vertexColor.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: this.planet.profile.family === 'metallic-iron' ? 0.6 : 0.1,
      flatShading: true,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx * this.chunkSize, 0, cz * this.chunkSize);
    return mesh;
  }

  private createLiquidChunk(cx: number, cz: number): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(this.chunkSize, this.chunkSize, 8, 8);
    geo.rotateX(-Math.PI / 2);

    const terrain = this.planet.profile.terrain;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(terrain.liquidColor),
      roughness: 0.15,
      metalness: 0.2,
      transparent: true,
      opacity: 0.82,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx * this.chunkSize, terrain.seaLevel, cz * this.chunkSize);
    return mesh;
  }

  private spawnChunkProps(cx: number, cz: number): void {
    const chunkSeed = SeededRandom.hashCoords(this.planet.seed, cx, 0, cz);
    const rng = new SeededRandom(chunkSeed);
    const profile = this.planet.profile;

    // Spawn 1-2 landmarks from planet's specific landmark family
    const count = rng.rangeInt(1, 2);
    for (let i = 0; i < count; i++) {
      const px = cx * this.chunkSize + rng.range(-this.chunkSize * 0.4, this.chunkSize * 0.4);
      const pz = cz * this.chunkSize + rng.range(-this.chunkSize * 0.4, this.chunkSize * 0.4);
      const py = this.getTerrainHeight(px, pz);

      // Do not place landmarks underwater
      if (profile.terrain.hasLiquid && py < profile.terrain.seaLevel + 0.5) {
        continue;
      }

      const landmark = LandmarkGenerator.createLandmark(
        profile.landmark,
        profile.palette,
        rng,
        this.site.biome
      );

      landmark.mesh.position.set(px, py, pz);
      this.propsGroup.add(landmark.mesh);

      this.scannableProps.push({
        mesh: landmark.mesh,
        name: landmark.name,
        info: landmark.info,
      });
    }
  }

  private createAtmosphericParticles(atmosphere: AtmosphereProfile): THREE.Points {
    const count = 600;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const box = 180;

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * box;
      positions[i * 3 + 1] = Math.random() * 50;
      positions[i * 3 + 2] = (Math.random() - 0.5) * box;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: new THREE.Color(atmosphere.particleColor || atmosphere.fogColor),
      size: atmosphere.particleType === 'snow' ? 2.5 : 1.8,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
    });

    return new THREE.Points(geo, mat);
  }

  public dispose(): void {
    this.proceduralSky.dispose();
    for (const [, mesh] of this.activeChunks) {
      mesh.geometry.dispose();
    }
    for (const [, mesh] of this.activeLiquidChunks) {
      mesh.geometry.dispose();
    }
    this.terrainGroup.clear();
    this.liquidGroup.clear();
    this.propsGroup.clear();
  }
}
