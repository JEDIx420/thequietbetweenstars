import * as THREE from 'three';
import { SeededRandom } from '../universe/SeededRandom';

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
  beaconLight: THREE.PointLight;
  portLight: THREE.PointLight;
  starboardLight: THREE.PointLight;
  strobeLight: THREE.PointLight;
  engineGlow: THREE.Mesh;
  strobeFlashTimer: number;
  update: (dt: number, shipPos: THREE.Vector3) => string | null;
}

export class SpaceTrafficDirector {
  public vessels: TrafficVessel[] = [];
  public group = new THREE.Group();
  private clock = 0;
  private encounterTimer = 15; // First dynamic encounter shortly after launch
  private nextVesselIndex = 0;
  private sunPos: THREE.Vector3;
  private planetPositions: THREE.Vector3[];
  private rng: SeededRandom;

  constructor(systemSeed: number, sunPos: THREE.Vector3, planetPositions: THREE.Vector3[]) {
    this.sunPos = sunPos.clone();
    this.planetPositions = planetPositions.map(p => p.clone());
    this.rng = new SeededRandom(systemSeed + 404);
    this.initVessels();
  }

  private initVessels(): void {
    // 8 to 14 ambient vessels per system for vibrant, populated space lanes
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

      // Spawn along interplanetary transit corridors
      const angle = (i / vesselCount) * Math.PI * 2 + this.rng.range(-0.5, 0.5);
      const dist = this.rng.range(200, 850);
      const spawnPos = new THREE.Vector3(
        startPlanet.x + Math.cos(angle) * dist,
        startPlanet.y + this.rng.range(-100, 100),
        startPlanet.z + Math.sin(angle) * dist
      );

      // Target direction towards another celestial body or trade corridor
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

  /**
   * Spawn a dynamic passing encounter vessel near the player's flight trajectory
   */
  public spawnDynamicEncounter(playerPos: THREE.Vector3): void {
    if (this.vessels.length >= 18) return;

    const vesselPool: TrafficVesselType[] = ['scout_cutter', 'cargo_freighter', 'science_corvette'];
    const type = vesselPool[this.rng.rangeInt(0, vesselPool.length - 1)];

    // Spawn 160m to 260m away, oriented to fly across or alongside player path
    const azimuth = this.rng.range(0, Math.PI * 2);
    const elevation = this.rng.range(-0.3, 0.3);
    const spawnDist = this.rng.range(180, 260);

    const spawnOffset = new THREE.Vector3(
      Math.cos(azimuth) * Math.cos(elevation) * spawnDist,
      Math.sin(elevation) * spawnDist,
      Math.sin(azimuth) * Math.cos(elevation) * spawnDist
    );

    const spawnPos = playerPos.clone().add(spawnOffset);

    // Heading passes near the player (offset by 80-120m)
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

    // Vibrant Materials
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const windowMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe });

    let beaconLight = new THREE.PointLight(0xfacc15, 2.5, 60);
    let portLight = new THREE.PointLight(0xef4444, 2.0, 35);      // Red port running light
    let starboardLight = new THREE.PointLight(0x22c55e, 2.0, 35); // Green starboard running light
    let strobeLight = new THREE.PointLight(0xffffff, 3.5, 70);    // High-visibility strobe

    let engineGlow = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 6), glowMat);

    switch (type) {
      case 'cargo_freighter': {
        name = `HEAVY FREIGHTER [ATLAS-0${(index % 9) + 1}]`;
        commMessage = `[COMMS] ${name}: Sub-space convoy in transit to planetary depot. Clear vector confirmed.`;
        speed = 20;

        // Solar Orange & Dark Charcoal armor
        const hullMat = new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          roughness: 0.35,
          metalness: 0.85,
          flatShading: true,
        });
        const containerMat = new THREE.MeshStandardMaterial({
          color: 0xf59e0b, // Radiant Solar Amber
          roughness: 0.4,
          metalness: 0.5,
        });

        // Long modular spine (58m)
        const spine = new THREE.Mesh(new THREE.BoxGeometry(4.8, 4.8, 52), hullMat);
        group.add(spine);

        // Modular cargo container pods
        const containerGeo = new THREE.BoxGeometry(3.8, 3.8, 6.2);
        for (let z = -18; z <= 18; z += 9) {
          for (let side of [-4.8, 4.8]) {
            const container = new THREE.Mesh(containerGeo, containerMat);
            container.position.set(side, 0, z);
            group.add(container);
          }
        }

        // Forward Bridge Tower
        const bridge = new THREE.Mesh(new THREE.ConeGeometry(4.2, 8.5, 4), hullMat);
        bridge.position.set(0, 3.8, -27);
        bridge.rotation.x = -Math.PI / 2;
        group.add(bridge);

        // Illuminated Bridge Viewports
        const windowStrip = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.8, 0.4), windowMat);
        windowStrip.position.set(0, 4.2, -29);
        group.add(windowStrip);

        // Aft Heavy Ion Thrusters with amber plumes
        const thrusterGeo = new THREE.CylinderGeometry(2.4, 3.0, 6.5, 8);
        thrusterGeo.rotateX(Math.PI / 2);
        const amberPlumeMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });

        for (let x of [-3.8, 3.8]) {
          const thruster = new THREE.Mesh(thrusterGeo, hullMat);
          thruster.position.set(x, 0, 27);
          group.add(thruster);

          const plume = new THREE.Mesh(new THREE.ConeGeometry(2.0, 7.0, 8), amberPlumeMat);
          plume.position.set(x, 0, 32);
          plume.rotation.x = Math.PI / 2;
          group.add(plume);
        }

        // Running lights
        portLight = new THREE.PointLight(0xef4444, 2.5, 45);
        portLight.position.set(-7, 2, -10);
        group.add(portLight);

        starboardLight = new THREE.PointLight(0x22c55e, 2.5, 45);
        starboardLight.position.set(7, 2, -10);
        group.add(starboardLight);

        beaconLight = new THREE.PointLight(0xfacc15, 3.5, 90);
        beaconLight.position.set(0, 6.5, -27);
        group.add(beaconLight);

        strobeLight = new THREE.PointLight(0xffffff, 4.0, 100);
        strobeLight.position.set(0, 6.5, 27);
        group.add(strobeLight);
        break;
      }

      case 'scout_cutter': {
        name = `SURVEY CUTTER [TALON-0${(index % 9) + 1}]`;
        commMessage = `[COMMS] ${name}: Remote probe grid nominal. Clear vector confirmed. Good hunting, traveler.`;
        speed = 40;

        // Brilliant Electric Cyan & Pearl White racing hull
        const cutterMat = new THREE.MeshStandardMaterial({
          color: 0x06b6d4,
          roughness: 0.25,
          metalness: 0.9,
          flatShading: true,
        });
        const wingMat = new THREE.MeshStandardMaterial({
          color: 0xf8fafc,
          roughness: 0.3,
          metalness: 0.7,
        });

        // Aerodynamic wedge forward hull (24m)
        const hull = new THREE.Mesh(new THREE.ConeGeometry(3.4, 22.0, 4), cutterMat);
        hull.position.set(0, 0, 0);
        hull.rotation.x = -Math.PI / 2;
        hull.scale.set(1.4, 0.45, 1.0);
        group.add(hull);

        // Forward cockpit canopy glow
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.0, 4.0), windowMat);
        canopy.position.set(0, 1.0, -3);
        group.add(canopy);

        // Angled swept wings
        const wingGeo = new THREE.BoxGeometry(18, 0.4, 6.5);
        const wings = new THREE.Mesh(wingGeo, wingMat);
        wings.position.set(0, 0, 3);
        group.add(wings);

        // Twin Emerald vector thrusters
        const scoutGlowMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
        engineGlow = new THREE.Mesh(new THREE.SphereGeometry(1.6, 6, 6), scoutGlowMat);
        engineGlow.position.set(0, 0, 11);
        group.add(engineGlow);

        // Running lights on wingtips
        portLight = new THREE.PointLight(0xef4444, 2.5, 45);
        portLight.position.set(-9.2, 0.5, 3);
        group.add(portLight);

        starboardLight = new THREE.PointLight(0x22c55e, 2.5, 45);
        starboardLight.position.set(9.2, 0.5, 3);
        group.add(starboardLight);

        beaconLight = new THREE.PointLight(0x10b981, 3.0, 60);
        beaconLight.position.set(0, 2.0, 0);
        group.add(beaconLight);

        strobeLight = new THREE.PointLight(0x38bdf8, 4.0, 80);
        strobeLight.position.set(0, 2.5, -4);
        group.add(strobeLight);
        break;
      }

      case 'science_corvette':
      default: {
        name = `RESEARCH CORVETTE [HYPATIA-0${(index % 9) + 1}]`;
        commMessage = `[COMMS] ${name}: Gravimetric anomaly sweep in progress. Broadcast beacon authenticated. Safe journey.`;
        speed = 25;

        // Pearlescent Deep Violet & Amethyst hull
        const scienceMat = new THREE.MeshStandardMaterial({
          color: 0x7c3aed,
          roughness: 0.3,
          metalness: 0.85,
          flatShading: true,
        });
        const ringMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          roughness: 0.2,
          metalness: 0.6,
        });

        // Central cylindrical hull (38m)
        const mainHull = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.9, 38, 8), scienceMat);
        mainHull.rotation.x = Math.PI / 2;
        group.add(mainHull);

        // Rotating Centrifuge Ring with illuminated observation pods
        const ringGeo = new THREE.TorusGeometry(9.0, 0.7, 8, 28);
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(0, 0, -2);
        group.add(ring);

        // Sensor Array Dish
        const dish = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.8, 8), glowMat);
        dish.position.set(0, 0, -20);
        dish.rotation.x = -Math.PI / 2;
        group.add(dish);

        // Blue/Violet Aft Thruster
        const sciencePlume = new THREE.Mesh(new THREE.ConeGeometry(2.2, 7.5, 8), glowMat);
        sciencePlume.position.set(0, 0, 22);
        sciencePlume.rotation.x = Math.PI / 2;
        group.add(sciencePlume);

        portLight = new THREE.PointLight(0xef4444, 2.5, 45);
        portLight.position.set(-9.5, 0, -2);
        group.add(portLight);

        starboardLight = new THREE.PointLight(0x22c55e, 2.5, 45);
        starboardLight.position.set(9.5, 0, -2);
        group.add(starboardLight);

        beaconLight = new THREE.PointLight(0x818cf8, 3.0, 75);
        beaconLight.position.set(0, 4, -2);
        group.add(beaconLight);

        strobeLight = new THREE.PointLight(0xa5f3fc, 4.0, 90);
        strobeLight.position.set(0, 4, -18);
        group.add(strobeLight);
        break;
      }
    }

    group.position.copy(spawnPos);

    // Orient group along heading
    const lookTarget = spawnPos.clone().add(heading);
    group.lookAt(lookTarget);

    const vessel: TrafficVessel = {
      id: `traffic_${type}_${index}`,
      type,
      name,
      group,
      position: spawnPos.clone(),
      velocity: heading.clone().multiplyScalar(speed),
      forward: heading.clone(),
      speed,
      rotationSpeed: type === 'science_corvette' ? 0.8 : 0.0,
      commMessage,
      hasHailed: false,
      beaconLight,
      portLight,
      starboardLight,
      strobeLight,
      engineGlow,
      strobeFlashTimer: 0,
      update: (dt: number, shipPos: THREE.Vector3) => {
        // Advance forward
        vessel.position.addScaledVector(vessel.velocity, dt);
        group.position.copy(vessel.position);

        // Science centrifuge rotation
        if (type === 'science_corvette') {
          group.rotateZ(dt * 0.4);
        }

        // Dynamic Strobe & Beacon illumination
        if (vessel.strobeFlashTimer > 0) {
          vessel.strobeFlashTimer -= dt;
          // Fast celebration blink (8 Hz)
          const flash = Math.sin(Date.now() * 0.05) > 0 ? 5.5 : 0.2;
          strobeLight.intensity = flash;
          beaconLight.intensity = flash;
        } else {
          // Standard rhythmic navigational strobe (sharp flash every 1.2s)
          const cycle = (Date.now() % 1200) / 1200;
          strobeLight.intensity = cycle < 0.12 ? 4.5 : 0.1;
          beaconLight.intensity = 2.0 + Math.sin(Date.now() * 0.006) * 1.0;
        }

        // Port & Starboard running lights stay solidly illuminated
        portLight.intensity = 2.2;
        starboardLight.intensity = 2.2;

        // Proximity Comms Hail Check (within 180m)
        const dist = vessel.position.distanceTo(shipPos);
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

    // Periodic dynamic passing encounter every 32 to 45 seconds
    if (this.encounterTimer >= 36) {
      this.encounterTimer = 0;
      this.spawnDynamicEncounter(shipPos);
    }

    let hailMessage: string | null = null;
    for (let i = this.vessels.length - 1; i >= 0; i--) {
      const v = this.vessels[i];
      const msg = v.update(dt, shipPos);
      if (msg && !hailMessage) {
        hailMessage = msg;
      }

      // Despawn temporary encounter vessels if they fly too far away (> 1600m)
      const dist = v.position.distanceTo(shipPos);
      if (dist > 1600 && this.vessels.length > 8) {
        this.group.remove(v.group);
        this.vessels.splice(i, 1);
      }
    }

    return hailMessage;
  }

  public dispose(): void {
    for (const v of this.vessels) {
      this.group.remove(v.group);
    }
    this.vessels = [];
  }
}
