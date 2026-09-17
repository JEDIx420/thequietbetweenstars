import * as THREE from 'three';
import { SeededRandom } from '../universe/SeededRandom';
import { PerformanceMonitor } from '../performance/PerformanceMonitor';

export type TrafficVesselType = 'cargo_freighter' | 'scout_cutter' | 'science_corvette';

export interface TrafficVessel {
  id: string;
  type: TrafficVesselType;
  name: string;
  group: THREE.Group;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  forward: THREE.Vector3;
  speed: number;
  rotationSpeed: number;
  commMessage: string;
  hasHailed: boolean;
  beaconLight: THREE.PointLight | null;
  portLight: THREE.PointLight | null;
  starboardLight: THREE.PointLight | null;
  strobeLight: THREE.PointLight | null;
  beaconMesh: THREE.Mesh;
  portMesh: THREE.Mesh;
  starboardMesh: THREE.Mesh;
  strobeMesh: THREE.Mesh;
  engineGlow: THREE.Mesh;
  strobeFlashTimer: number;
  lastDistanceToPlayer: number;
  simLODCounter: number;
  accumulatedDt: number;
  update: (dt: number, shipPos: THREE.Vector3, clock: number) => string | null;
}

export class SpaceTrafficDirector {
  public vessels: TrafficVessel[] = [];
  public group = new THREE.Group();
  private clock = 0;
  private encounterTimer = 15;
  private nextVesselIndex = 0;
  private sunPos: THREE.Vector3;
  private planetPositions: THREE.Vector3[];
  private rng: SeededRandom;

  // Dynamic PointLight Pool: only 2-4 real lights for closest vessels
  private lightPool: THREE.PointLight[] = [];
  public maxRealLights = 3;

  // Shared Asset Cache for Geometries & Materials across vessel archetypes
  private static sharedGeos: Map<string, THREE.BufferGeometry> = new Map();
  private static sharedMats: Map<string, THREE.Material> = new Map();

  constructor(systemSeed: number, sunPos: THREE.Vector3, planetPositions: THREE.Vector3[]) {
    this.sunPos = sunPos.clone();
    this.planetPositions = planetPositions.map(p => p.clone());
    this.rng = new SeededRandom(systemSeed + 404);

    this.initLightPool();
    this.initVessels();
  }

  public get activeCount(): number {
    return this.vessels.length;
  }

  private initLightPool(): void {
    for (let i = 0; i < 4; i++) {
      const light = new THREE.PointLight(0xfacc15, 0, 80);
      light.visible = false;
      this.lightPool.push(light);
      this.group.add(light);
    }
  }

  private static getSharedGeo(key: string, creator: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let geo = SpaceTrafficDirector.sharedGeos.get(key);
    if (!geo) {
      geo = creator();
      SpaceTrafficDirector.sharedGeos.set(key, geo);
    }
    return geo;
  }

  private static getSharedMat(key: string, creator: () => THREE.Material): THREE.Material {
    let mat = SpaceTrafficDirector.sharedMats.get(key);
    if (!mat) {
      mat = creator();
      SpaceTrafficDirector.sharedMats.set(key, mat);
    }
    return mat;
  }

  private initVessels(): void {
    const vesselCount = 8 + this.rng.rangeInt(0, 6);
    const vesselPool: TrafficVesselType[] = [
      'cargo_freighter',
      'scout_cutter',
      'science_corvette',
    ];

    for (let i = 0; i < vesselCount; i++) {
      const type = vesselPool[i % vesselPool.length];
      const startPlanet = this.planetPositions.length > 0
        ? this.rng.pick(this.planetPositions)
        : this.sunPos.clone().add(new THREE.Vector3(this.rng.range(-800, 800), this.rng.range(-200, 200), this.rng.range(-800, 800)));

      const angle = (i / vesselCount) * Math.PI * 2 + this.rng.range(-0.5, 0.5);
      const dist = this.rng.range(200, 850);
      const spawnPos = new THREE.Vector3(
        startPlanet.x + Math.cos(angle) * dist,
        startPlanet.y + this.rng.range(-100, 100),
        startPlanet.z + Math.sin(angle) * dist
      );

      const targetPos = this.planetPositions.length > 1
        ? this.rng.pick(this.planetPositions.filter(p => p !== startPlanet))
        : this.sunPos.clone().add(new THREE.Vector3(this.rng.range(-400, 400), 0, this.rng.range(-400, 400)));

      const travelDir = new THREE.Vector3().subVectors(targetPos, spawnPos).normalize();
      if (travelDir.lengthSq() < 0.1) travelDir.set(1, 0, 0);

      const vessel = this.buildVessel(type, spawnPos, travelDir, this.nextVesselIndex++);
      this.vessels.push(vessel);
      this.group.add(vessel.group);
    }
  }

  public spawnDynamicEncounter(playerPos: THREE.Vector3): void {
    if (this.vessels.length >= 18) return;

    const vesselPool: TrafficVesselType[] = ['scout_cutter', 'cargo_freighter', 'science_corvette'];
    const type = vesselPool[this.rng.rangeInt(0, vesselPool.length - 1)];

    const azimuth = this.rng.range(0, Math.PI * 2);
    const elevation = this.rng.range(-0.3, 0.3);
    const spawnDist = this.rng.range(180, 260);

    const spawnOffset = new THREE.Vector3(
      Math.cos(azimuth) * Math.cos(elevation) * spawnDist,
      Math.sin(elevation) * spawnDist,
      Math.sin(azimuth) * Math.cos(elevation) * spawnDist
    );

    const spawnPos = playerPos.clone().add(spawnOffset);
    const aimTarget = playerPos.clone().add(new THREE.Vector3(
      this.rng.range(-90, 90),
      this.rng.range(-40, 40),
      this.rng.range(-90, 90)
    ));

    const heading = new THREE.Vector3().subVectors(aimTarget, spawnPos).normalize();
    const vessel = this.buildVessel(type, spawnPos, heading, this.nextVesselIndex++);
    this.vessels.push(vessel);
    this.group.add(vessel.group);
  }

  private buildVessel(
    type: TrafficVesselType,
    spawnPos: THREE.Vector3,
    heading: THREE.Vector3,
    index: number
  ): TrafficVessel {
    const group = new THREE.Group();
    let speed = 26;
    let name = '';
    let commMessage = '';

    // Shared Materials for Emissive Navigation Lights
    const portMat = SpaceTrafficDirector.getSharedMat('mat_port', () => new THREE.MeshBasicMaterial({ color: 0xef4444 }));
    const starMat = SpaceTrafficDirector.getSharedMat('mat_starboard', () => new THREE.MeshBasicMaterial({ color: 0x22c55e }));
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.9 });
    const strobeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1 });
    const glowMat = SpaceTrafficDirector.getSharedMat('mat_glow', () => new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
    const windowMat = SpaceTrafficDirector.getSharedMat('mat_window', () => new THREE.MeshBasicMaterial({ color: 0xe0f2fe }));

    const navLightGeo = SpaceTrafficDirector.getSharedGeo('geo_nav_light', () => new THREE.SphereGeometry(0.5, 6, 4));
    const engineGeo = SpaceTrafficDirector.getSharedGeo('geo_engine_glow', () => new THREE.SphereGeometry(1.0, 6, 6));

    const portMesh = new THREE.Mesh(navLightGeo, portMat);
    const starboardMesh = new THREE.Mesh(navLightGeo, starMat);
    const beaconMesh = new THREE.Mesh(navLightGeo, beaconMat);
    const strobeMesh = new THREE.Mesh(navLightGeo, strobeMat);
    const engineGlow = new THREE.Mesh(engineGeo, glowMat);

    switch (type) {
      case 'cargo_freighter': {
        name = `HEAVY FREIGHTER [ATLAS-0${(index % 9) + 1}]`;
        commMessage = `[COMMS] ${name}: Sub-space convoy in transit to planetary depot. Clear vector confirmed.`;
        speed = 20;

        const hullMat = SpaceTrafficDirector.getSharedMat('freighter_hull', () => new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          roughness: 0.35,
          metalness: 0.85,
          flatShading: true,
        }));
        const containerMat = SpaceTrafficDirector.getSharedMat('freighter_container', () => new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          roughness: 0.4,
          metalness: 0.5,
        }));

        const spineGeo = SpaceTrafficDirector.getSharedGeo('freighter_spine', () => new THREE.BoxGeometry(4.8, 4.8, 52));
        const spine = new THREE.Mesh(spineGeo, hullMat);
        group.add(spine);

        const containerGeo = SpaceTrafficDirector.getSharedGeo('freighter_container_box', () => new THREE.BoxGeometry(3.8, 3.8, 6.2));
        for (let z = -18; z <= 18; z += 9) {
          for (let side of [-4.8, 4.8]) {
            const container = new THREE.Mesh(containerGeo, containerMat);
            container.position.set(side, 0, z);
            group.add(container);
          }
        }

        const bridgeGeo = SpaceTrafficDirector.getSharedGeo('freighter_bridge', () => {
          const g = new THREE.ConeGeometry(4.2, 8.5, 4);
          g.rotateX(-Math.PI / 2);
          return g;
        });
        const bridge = new THREE.Mesh(bridgeGeo, hullMat);
        bridge.position.set(0, 3.8, -27);
        group.add(bridge);

        const windowStripGeo = SpaceTrafficDirector.getSharedGeo('freighter_window', () => new THREE.BoxGeometry(3.2, 0.8, 0.4));
        const windowStrip = new THREE.Mesh(windowStripGeo, windowMat);
        windowStrip.position.set(0, 4.2, -29);
        group.add(windowStrip);

        const thrusterGeo = SpaceTrafficDirector.getSharedGeo('freighter_thruster', () => {
          const g = new THREE.CylinderGeometry(2.4, 3.0, 6.5, 8);
          g.rotateX(Math.PI / 2);
          return g;
        });
        const amberPlumeMat = SpaceTrafficDirector.getSharedMat('plume_amber', () => new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
        const plumeGeo = SpaceTrafficDirector.getSharedGeo('freighter_plume', () => {
          const g = new THREE.ConeGeometry(2.0, 7.0, 8);
          g.rotateX(Math.PI / 2);
          return g;
        });

        for (let x of [-3.8, 3.8]) {
          const thruster = new THREE.Mesh(thrusterGeo, hullMat);
          thruster.position.set(x, 0, 27);
          group.add(thruster);

          const plume = new THREE.Mesh(plumeGeo, amberPlumeMat);
          plume.position.set(x, 0, 32);
          group.add(plume);
        }

        portMesh.position.set(-7, 2, -10);
        starboardMesh.position.set(7, 2, -10);
        beaconMesh.position.set(0, 6.5, -27);
        strobeMesh.position.set(0, 6.5, 27);
        group.add(portMesh, starboardMesh, beaconMesh, strobeMesh);
        break;
      }

      case 'scout_cutter': {
        name = `SURVEY CUTTER [TALON-0${(index % 9) + 1}]`;
        commMessage = `[COMMS] ${name}: Remote probe grid nominal. Clear vector confirmed. Good hunting, traveler.`;
        speed = 40;

        const cutterMat = SpaceTrafficDirector.getSharedMat('cutter_hull', () => new THREE.MeshStandardMaterial({
          color: 0x06b6d4,
          roughness: 0.25,
          metalness: 0.9,
          flatShading: true,
        }));
        const wingMat = SpaceTrafficDirector.getSharedMat('cutter_wings', () => new THREE.MeshStandardMaterial({
          color: 0xf8fafc,
          roughness: 0.3,
          metalness: 0.7,
        }));

        const hullGeo = SpaceTrafficDirector.getSharedGeo('cutter_hull', () => {
          const g = new THREE.ConeGeometry(3.4, 22.0, 4);
          g.rotateX(-Math.PI / 2);
          return g;
        });
        const hull = new THREE.Mesh(hullGeo, cutterMat);
        group.add(hull);

        const wingGeo = SpaceTrafficDirector.getSharedGeo('cutter_wing', () => new THREE.BoxGeometry(16.0, 0.4, 7.0));
        const wings = new THREE.Mesh(wingGeo, wingMat);
        wings.position.set(0, 0, 3);
        group.add(wings);

        const canardGeo = SpaceTrafficDirector.getSharedGeo('cutter_canard', () => new THREE.BoxGeometry(6.5, 0.25, 2.8));
        const canards = new THREE.Mesh(canardGeo, cutterMat);
        canards.position.set(0, 0.6, -7);
        group.add(canards);

        const canopyGeo = SpaceTrafficDirector.getSharedGeo('cutter_canopy', () => new THREE.BoxGeometry(2.0, 1.2, 5.0));
        const canopy = new THREE.Mesh(canopyGeo, windowMat);
        canopy.position.set(0, 1.4, -4);
        group.add(canopy);

        const cyanPlumeMat = SpaceTrafficDirector.getSharedMat('plume_cyan', () => new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
        const plumeGeo = SpaceTrafficDirector.getSharedGeo('cutter_plume', () => {
          const g = new THREE.ConeGeometry(1.6, 9.0, 8);
          g.rotateX(Math.PI / 2);
          return g;
        });
        const plume = new THREE.Mesh(plumeGeo, cyanPlumeMat);
        plume.position.set(0, 0, 14);
        group.add(plume);

        portMesh.position.set(-8.2, 0.4, 4);
        starboardMesh.position.set(8.2, 0.4, 4);
        beaconMesh.position.set(0, 2.2, -4);
        strobeMesh.position.set(0, 1.2, 11);
        group.add(portMesh, starboardMesh, beaconMesh, strobeMesh);
        break;
      }

      case 'science_corvette':
      default: {
        name = `RESEARCH CORVETTE [HYPATIA-0${(index % 9) + 1}]`;
        commMessage = `[COMMS] ${name}: Gravimetric anomaly sweep in progress. Broadcast beacon authenticated. Safe journey.`;
        speed = 28;

        const hullMat = SpaceTrafficDirector.getSharedMat('corvette_hull', () => new THREE.MeshStandardMaterial({
          color: 0x3b82f6,
          roughness: 0.3,
          metalness: 0.8,
          flatShading: true,
        }));
        const ringMat = SpaceTrafficDirector.getSharedMat('corvette_ring', () => new THREE.MeshStandardMaterial({
          color: 0x67e8f9,
          roughness: 0.2,
          metalness: 0.9,
        }));

        const hullGeo = SpaceTrafficDirector.getSharedGeo('corvette_body', () => new THREE.CylinderGeometry(2.8, 3.2, 28, 8));
        const body = new THREE.Mesh(hullGeo, hullMat);
        body.rotation.x = Math.PI / 2;
        group.add(body);

        const discGeo = SpaceTrafficDirector.getSharedGeo('corvette_disc', () => new THREE.CylinderGeometry(8.5, 8.5, 1.8, 16));
        const disc = new THREE.Mesh(discGeo, hullMat);
        disc.position.set(0, 0, -10);
        disc.rotation.x = Math.PI / 2;
        group.add(disc);

        const ringGeo = SpaceTrafficDirector.getSharedGeo('corvette_grav_ring', () => new THREE.TorusGeometry(6.5, 0.45, 6, 24));
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(0, 0, 4);
        group.add(ring);

        const domeGeo = SpaceTrafficDirector.getSharedGeo('corvette_dome', () => new THREE.SphereGeometry(3.2, 12, 8));
        const bridge = new THREE.Mesh(domeGeo, windowMat);
        bridge.position.set(0, 1.6, -11);
        group.add(bridge);

        const whitePlumeMat = SpaceTrafficDirector.getSharedMat('plume_white', () => new THREE.MeshBasicMaterial({ color: 0xe0f2fe }));
        const plumeGeo = SpaceTrafficDirector.getSharedGeo('corvette_plume', () => {
          const g = new THREE.ConeGeometry(1.8, 7.5, 8);
          g.rotateX(Math.PI / 2);
          return g;
        });
        const plume = new THREE.Mesh(plumeGeo, whitePlumeMat);
        plume.position.set(0, 0, 17);
        group.add(plume);

        portMesh.position.set(-8.6, 0, -10);
        starboardMesh.position.set(8.6, 0, -10);
        beaconMesh.position.set(0, 3.8, -10);
        strobeMesh.position.set(0, 4.2, 4);
        group.add(portMesh, starboardMesh, beaconMesh, strobeMesh);
        break;
      }
    }

    group.position.copy(spawnPos);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), heading);

    const vessel: TrafficVessel = {
      id: `vessel_${index}`,
      type,
      name,
      group,
      position: spawnPos.clone(),
      velocity: heading.clone().multiplyScalar(speed),
      forward: heading.clone(),
      speed,
      rotationSpeed: 0.15,
      commMessage,
      hasHailed: false,
      beaconLight: null,
      portLight: null,
      starboardLight: null,
      strobeLight: null,
      beaconMesh,
      portMesh,
      starboardMesh,
      strobeMesh,
      engineGlow,
      strobeFlashTimer: 0,
      lastDistanceToPlayer: 9999,
      simLODCounter: index % 8,
      accumulatedDt: 0,
      update: (dt, _shipPos, directorClock) => {
        // Linear kinematic motion
        vessel.position.addScaledVector(vessel.velocity, dt);
        vessel.group.position.copy(vessel.position);

        // Visual flash modulation using director's clock (no Date.now() in inner loop)
        const strobeMatInst = vessel.strobeMesh.material as THREE.MeshBasicMaterial;
        const beaconMatInst = vessel.beaconMesh.material as THREE.MeshBasicMaterial;

        if (vessel.strobeFlashTimer > 0) {
          vessel.strobeFlashTimer -= dt;
          const flash = Math.sin(directorClock * 35.0) > 0.0 ? 0.95 : 0.05;
          strobeMatInst.opacity = flash;
          beaconMatInst.opacity = flash;
        } else {
          // Standard rhythmic navigational strobe (sharp flash every 1.2s)
          const cycle = (directorClock % 1.2) / 1.2;
          strobeMatInst.opacity = cycle < 0.12 ? 1.0 : 0.08;
          beaconMatInst.opacity = 0.5 + Math.sin(directorClock * 4.0) * 0.45;
        }

        // Proximity Comms Hail Check (within 180m)
        const dist = vessel.lastDistanceToPlayer;
        if (dist < 180 && !vessel.hasHailed) {
          vessel.hasHailed = true;
          return vessel.commMessage;
        } else if (dist > 400) {
          vessel.hasHailed = false;
        }

        return null;
      },
    };

    return vessel;
  }

  public onRebase(offset: THREE.Vector3): void {
    for (const v of this.vessels) {
      v.position.add(offset);
      v.group.position.add(offset);
    }
  }

  public update(dt: number, shipPos: THREE.Vector3): string | null {
    this.clock += dt;
    this.encounterTimer += dt;

    if (this.encounterTimer >= 36) {
      this.encounterTimer = 0;
      this.spawnDynamicEncounter(shipPos);
    }

    let hailMessage: string | null = null;

    // 1. Calculate distances and assign pooled real lights to closest vessels
    for (let i = 0; i < this.vessels.length; i++) {
      this.vessels[i].lastDistanceToPlayer = this.vessels[i].position.distanceTo(shipPos);
    }

    // Sort vessels by distance to prioritize lights and LOD
    this.vessels.sort((a, b) => a.lastDistanceToPlayer - b.lastDistanceToPlayer);

    // Assign pooled PointLights to closest N vessels (under 250m)
    let assignedLights = 0;
    const lightBudget = Math.min(this.maxRealLights, this.lightPool.length);

    for (let i = 0; i < this.vessels.length; i++) {
      const v = this.vessels[i];
      if (assignedLights < lightBudget && v.lastDistanceToPlayer < 250) {
        const light = this.lightPool[assignedLights];
        light.visible = true;
        light.position.set(v.position.x, v.position.y + 3, v.position.z);
        light.intensity = v.strobeFlashTimer > 0 ? 3.5 : 1.8;
        assignedLights++;
      }
    }

    // Hide unassigned pooled lights
    for (let i = assignedLights; i < this.lightPool.length; i++) {
      this.lightPool[i].visible = false;
    }

    // 2. Update vessels with Simulation LOD
    for (let i = this.vessels.length - 1; i >= 0; i--) {
      const v = this.vessels[i];
      const dist = v.lastDistanceToPlayer;

      v.accumulatedDt += dt;
      v.simLODCounter++;

      // LOD policy:
      // Near (< 300m): update every frame
      // Mid (300m-800m): update every 3rd frame
      // Far (> 800m): update every 8th frame
      const shouldTick = dist < 300 || (dist < 800 && v.simLODCounter % 3 === 0) || v.simLODCounter % 8 === 0;

      if (shouldTick) {
        const stepDt = v.accumulatedDt;
        v.accumulatedDt = 0;
        const msg = v.update(stepDt, shipPos, this.clock);
        if (msg && !hailMessage) {
          hailMessage = msg;
        }
      } else {
        // Advance linear position smoothly between sim ticks
        v.position.addScaledVector(v.velocity, dt);
        v.group.position.copy(v.position);
      }

      // Despawn distant encounter vessels (> 1600m)
      if (dist > 1600 && this.vessels.length > 8) {
        this.group.remove(v.group);
        this.vessels.splice(i, 1);
      }
    }

    PerformanceMonitor.getInstance().setCounters({
      trafficCount: this.vessels.length,
      realLights: assignedLights,
    });

    return hailMessage;
  }

  public dispose(): void {
    for (const v of this.vessels) {
      this.group.remove(v.group);
    }
    this.vessels = [];

    for (const light of this.lightPool) {
      this.group.remove(light);
      light.dispose();
    }
    this.lightPool = [];
  }
}
