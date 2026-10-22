import * as THREE from 'three';
import { SeededRandom } from '../universe/SeededRandom';
import type { PlanetDescriptor } from '../systems/PlanetDescriptor';

export interface AlienCityInfo {
  id: string;
  name: string;
  archetype: 'CRYSTAL_SPIRE' | 'BIODOME_HAVEN' | 'NEON_CITADEL' | 'SUBTERRANEAN_ARCHIVE';
  position: THREE.Vector3; // World position on terrain
  landingPadPos: THREE.Vector3;
  radius: number;
  speciesName: string;
  populationEstimate: number;
  description: string;
}

export class AlienCitySettlementManager {
  public group: THREE.Group;
  public cities: AlienCityInfo[] = [];
  private planet: PlanetDescriptor;
  private landingPadMeshes: THREE.Mesh[] = [];
  private beaconBeams: THREE.Mesh[] = [];
  private rotatingMasts: THREE.Group[] = [];
  private trafficDrones: Array<{ group: THREE.Group; center: THREE.Vector3; radius: number; speed: number; angle: number }> = [];

  constructor(planet: PlanetDescriptor, getTerrainHeight: (x: number, z: number) => number) {
    this.planet = planet;
    this.group = new THREE.Group();
    this.group.name = 'AlienCitySettlements';

    this.generateCities(getTerrainHeight);
  }

  private generateCities(getTerrainHeight: (x: number, z: number) => number): void {
    const isSentient =
      this.planet.profile.biosignature === 'anomalous' ||
      this.planet.profile.biosignature === 'complex-ecosystem' ||
      this.planet.profile.family === 'high-biosignature' ||
      this.planet.profile.family === 'temperate-terrestrial' ||
      this.planet.profile.family === 'crystalline-mineral';

    // Even if not high-biosignature, generate at least 1-2 remote alien outposts
    const cityCount = isSentient ? 3 : 1;
    const rng = new SeededRandom(this.planet.seed + 8841);

    const cityPrefixes = ['Kael-Varn', 'Orosen', 'Xeno-Prime', 'Aethel', 'Zephyri', 'Nyx', 'Sol-Ark'];
    const citySuffixes = ['Spire City', 'Acoustic Citadel', 'Star-Haven', 'Concourse', 'Biosphere Prime', 'Archon Reach'];
    const archetypes: AlienCityInfo['archetype'][] = [
      'CRYSTAL_SPIRE',
      'BIODOME_HAVEN',
      'NEON_CITADEL',
      'SUBTERRANEAN_ARCHIVE',
    ];

    const baseDistance = 380;

    for (let i = 0; i < cityCount; i++) {
      const angle = (i * ((Math.PI * 2) / cityCount)) + rng.range(-0.35, 0.35);
      const dist = baseDistance + (i * 220) + rng.range(-60, 60);

      const cx = Math.cos(angle) * dist;
      const cz = Math.sin(angle) * dist;
      const groundY = getTerrainHeight(cx, cz);

      const name = `${rng.pick(cityPrefixes)} ${rng.pick(citySuffixes)}`;
      const archetype = archetypes[i % archetypes.length];

      const cityPos = new THREE.Vector3(cx, groundY, cz);
      const padPos = new THREE.Vector3(cx, groundY + 4.5, cz);

      const cityInfo: AlienCityInfo = {
        id: `city_${this.planet.id}_${i}`,
        name,
        archetype,
        position: cityPos,
        landingPadPos: padPos,
        radius: 120,
        speciesName: `${this.planet.name} Synthetics & Sentients`,
        populationEstimate: rng.rangeInt(14000, 480000),
        description: `Thriving planetary metropolis featuring an active starport, cantina concourse, and bio-tech laboratories.`,
      };

      this.cities.push(cityInfo);
      this.buildCityMesh(cityInfo, rng);
    }
  }

  private buildCityMesh(city: AlienCityInfo, rng: SeededRandom): void {
    const cityGroup = new THREE.Group();
    cityGroup.position.copy(city.position);

    const primaryColor = new THREE.Color(
      this.planet.palette?.atmosphereGlow || this.planet.palette?.secondary || 0x38bdf8
    );
    const structureMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.25,
      flatShading: true,
    });

    const glowNeonMat = new THREE.MeshStandardMaterial({
      color: primaryColor,
      emissive: primaryColor,
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.8,
    });

    const domeMat = new THREE.MeshPhysicalMaterial({
      color: primaryColor,
      transmission: 0.75,
      opacity: 0.85,
      transparent: true,
      roughness: 0.15,
      ior: 1.4,
    });

    // 1. Central Elevated Landing Pad
    const padBaseGeo = new THREE.CylinderGeometry(18, 22, 6, 16);
    const padBase = new THREE.Mesh(padBaseGeo, structureMat);
    padBase.position.y = 3;
    cityGroup.add(padBase);

    const padSurfaceGeo = new THREE.CylinderGeometry(17.8, 17.8, 0.4, 16);
    const padSurfaceMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.6,
      metalness: 0.4,
    });
    const padSurface = new THREE.Mesh(padSurfaceGeo, padSurfaceMat);
    padSurface.position.y = 6.1;
    cityGroup.add(padSurface);
    this.landingPadMeshes.push(padSurface);

    // Glowing Landing Pad Ring & Chevron Decals
    const padRingGeo = new THREE.RingGeometry(14, 15.5, 32);
    padRingGeo.rotateX(-Math.PI / 2);
    const padRing = new THREE.Mesh(padRingGeo, glowNeonMat);
    padRing.position.y = 6.35;
    cityGroup.add(padRing);

    // Vertical Homing Beacon Beam (extends 120m into sky)
    const beamGeo = new THREE.CylinderGeometry(0.35, 1.8, 140, 8);
    const beamMat = new THREE.MeshBasicMaterial({
      color: primaryColor,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const beacon = new THREE.Mesh(beamGeo, beamMat);
    beacon.position.y = 76;
    cityGroup.add(beacon);
    this.beaconBeams.push(beacon);

    // 2. Surrounding Architectural Spires
    const spireCount = rng.rangeInt(7, 12);
    for (let s = 0; s < spireCount; s++) {
      const angle = (s * (Math.PI * 2 / spireCount)) + rng.range(-0.15, 0.15);
      const rad = rng.range(38, 95);
      const sx = Math.cos(angle) * rad;
      const sz = Math.sin(angle) * rad;
      const h = rng.range(45, 110);
      const w = rng.range(6, 14);

      // Angled titanium monolith spire
      const spireGeo = new THREE.ConeGeometry(w, h, 6);
      const spireMesh = new THREE.Mesh(spireGeo, structureMat);
      spireMesh.position.set(sx, h / 2, sz);
      cityGroup.add(spireMesh);

      // Glowing Neon Ribbons across spire
      const ribCount = rng.rangeInt(3, 6);
      for (let r = 0; r < ribCount; r++) {
        const ringH = (r + 1) * (h / (ribCount + 1));
        const ringR = w * (1 - (ringH / h)) * 1.05;
        const ribGeo = new THREE.TorusGeometry(ringR, 0.35, 4, 12);
        ribGeo.rotateX(Math.PI / 2);
        const rib = new THREE.Mesh(ribGeo, glowNeonMat);
        rib.position.set(sx, ringH, sz);
        cityGroup.add(rib);
      }
    }

    // 3. Geodesic Energy Domes
    const domeCount = rng.rangeInt(2, 4);
    for (let d = 0; d < domeCount; d++) {
      const dAngle = d * 1.8 + rng.range(-0.2, 0.2);
      const dDist = rng.range(42, 70);
      const dx = Math.cos(dAngle) * dDist;
      const dz = Math.sin(dAngle) * dDist;
      const dRadius = rng.range(14, 22);

      const domeGeo = new THREE.SphereGeometry(dRadius, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      const domeMesh = new THREE.Mesh(domeGeo, domeMat);
      domeMesh.position.set(dx, 0, dz);
      cityGroup.add(domeMesh);
    }

    // 4. Rotating Comms & Sensor Mast
    const mastGroup = new THREE.Group();
    mastGroup.position.set(-28, 0, 24);
    const mastPole = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 35, 6), structureMat);
    mastPole.position.y = 17.5;
    mastGroup.add(mastPole);

    const dishMesh = new THREE.Mesh(new THREE.ConeGeometry(4.5, 2.2, 12), glowNeonMat);
    dishMesh.rotation.x = Math.PI / 3;
    dishMesh.position.y = 35;
    mastGroup.add(dishMesh);
    cityGroup.add(mastGroup);
    this.rotatingMasts.push(mastGroup);

    // 5. Orbiting City Traffic Drones
    for (let t = 0; t < 3; t++) {
      const droneGroup = new THREE.Group();
      const droneBody = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2.8), structureMat);
      droneGroup.add(droneBody);

      const droneLight = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 6), glowNeonMat);
      droneLight.position.set(0, 0, -1.5);
      droneGroup.add(droneLight);

      cityGroup.add(droneGroup);
      this.trafficDrones.push({
        group: droneGroup,
        center: new THREE.Vector3(0, rng.range(25, 45), 0),
        radius: rng.range(30, 80),
        speed: rng.range(0.4, 0.9) * (t % 2 === 0 ? 1 : -1),
        angle: rng.range(0, Math.PI * 2),
      });
    }

    this.group.add(cityGroup);
  }

  public update(dt: number, shipPos?: THREE.Vector3): {
    nearestCity: AlienCityInfo | null;
    isOverLandingPad: boolean;
    padDistance: number;
  } {
    // 1. Animate rotating masts
    for (const mast of this.rotatingMasts) {
      mast.rotation.y += dt * 0.45;
    }

    // 2. Pulse beacon beams
    const time = performance.now() * 0.003;
    for (const beacon of this.beaconBeams) {
      (beacon.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(time) * 0.15;
    }

    // 3. Update traffic drones
    for (const drone of this.trafficDrones) {
      drone.angle += drone.speed * dt;
      drone.group.position.set(
        drone.center.x + Math.cos(drone.angle) * drone.radius,
        drone.center.y + Math.sin(drone.angle * 2) * 3,
        drone.center.z + Math.sin(drone.angle) * drone.radius
      );
      drone.group.rotation.y = -drone.angle + Math.PI / 2;
    }

    // 4. Proximity & Landing pad detection
    let nearest: AlienCityInfo | null = null;
    let minDist = Infinity;
    let isOverLandingPad = false;

    if (shipPos) {
      for (const c of this.cities) {
        const d = shipPos.distanceTo(c.landingPadPos);
        if (d < minDist) {
          minDist = d;
          nearest = c;
        }
      }

      if (nearest) {
        const horizontalDist = Math.hypot(shipPos.x - nearest.landingPadPos.x, shipPos.z - nearest.landingPadPos.z);
        const verticalDist = Math.abs(shipPos.y - nearest.landingPadPos.y);
        if (horizontalDist <= 28.0 && verticalDist <= 22.0) {
          isOverLandingPad = true;
        }
      }
    }

    return {
      nearestCity: nearest,
      isOverLandingPad,
      padDistance: minDist,
    };
  }

  public dispose(): void {
    this.group.clear();
    this.cities = [];
    this.landingPadMeshes = [];
    this.beaconBeams = [];
    this.rotatingMasts = [];
    this.trafficDrones = [];
  }
}
