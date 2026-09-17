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
  engineGlow: THREE.Mesh;
  update: (dt: number, shipPos: THREE.Vector3) => string | null;
}

export class SpaceTrafficDirector {
  public vessels: TrafficVessel[] = [];
  public group = new THREE.Group();
  private clock = 0;

  constructor(systemSeed: number, sunPos: THREE.Vector3, planetPositions: THREE.Vector3[]) {
    this.initVessels(systemSeed, sunPos, planetPositions);
  }

  private initVessels(seed: number, sunPos: THREE.Vector3, planetPositions: THREE.Vector3[]): void {
    const rng = new SeededRandom(seed + 404);
    const vesselCount = 3 + (rng.rangeInt(0, 3)); // 3 to 6 ambient vessels per system

    const vesselPool: TrafficVesselType[] = [
      'cargo_freighter',
      'scout_cutter',
      'science_corvette',
    ];

    for (let i = 0; i < vesselCount; i++) {
      const type = vesselPool[i % vesselPool.length];
      const startPlanet = planetPositions.length > 0
        ? rng.pick(planetPositions)
        : sunPos.clone().add(new THREE.Vector3(rng.range(-800, 800), rng.range(-200, 200), rng.range(-800, 800)));

      // Spawn in transit lane between planets or orbiting sun
      const angle = (i / vesselCount) * Math.PI * 2 + rng.range(-0.5, 0.5);
      const dist = rng.range(250, 950);
      const spawnPos = new THREE.Vector3(
        startPlanet.x + Math.cos(angle) * dist,
        startPlanet.y + rng.range(-120, 120),
        startPlanet.z + Math.sin(angle) * dist
      );

      // Target direction towards another planetary sector
      const targetPos = planetPositions.length > 1
        ? rng.pick(planetPositions.filter(p => p !== startPlanet))
        : sunPos.clone().add(new THREE.Vector3(rng.range(-400, 400), 0, rng.range(-400, 400)));

      const travelDir = new THREE.Vector3().subVectors(targetPos, spawnPos).normalize();
      if (travelDir.lengthSq() < 0.1) travelDir.set(1, 0, 0);

      const vessel = this.buildVessel(type, spawnPos, travelDir, i);
      this.vessels.push(vessel);
      this.group.add(vessel.group);
    }
  }

  private buildVessel(
    type: TrafficVesselType,
    spawnPos: THREE.Vector3,
    heading: THREE.Vector3,
    index: number
  ): TrafficVessel {
    const group = new THREE.Group();
    let speed = 25;
    let name = '';
    let commMessage = '';

    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.4,
      metalness: 0.8,
      flatShading: true,
    });
    const cargoMat = new THREE.MeshStandardMaterial({
      color: 0xd97706, // Amber cargo containers
      roughness: 0.5,
      metalness: 0.4,
    });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    let beaconLight = new THREE.PointLight(0x38bdf8, 2.0, 40);
    let engineGlow = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 6), glowMat);

    switch (type) {
      case 'cargo_freighter': {
        name = `HEAVY FREIGHTER [ATLAS-0${index + 1}]`;
        commMessage = `[COMMS] ${name}: Sub-space convoy in transit to planetary depot. Maintain 100m clearance, pilot.`;
        speed = 18;

        // Long modular spine (60m)
        const spine = new THREE.Mesh(new THREE.BoxGeometry(4.5, 4.5, 52), hullMat);
        group.add(spine);

        // Modular cargo container pods
        const containerGeo = new THREE.BoxGeometry(3.6, 3.6, 6.0);
        for (let z = -18; z <= 18; z += 9) {
          for (let side of [-4.5, 4.5]) {
            const container = new THREE.Mesh(containerGeo, cargoMat);
            container.position.set(side, 0, z);
            group.add(container);
          }
        }

        // Forward Bridge Tower
        const bridge = new THREE.Mesh(new THREE.ConeGeometry(3.8, 8.0, 4), hullMat);
        bridge.position.set(0, 3.5, -27);
        bridge.rotation.x = -Math.PI / 2;
        group.add(bridge);

        // Aft Heavy Ion Thrusters
        const thrusterGeo = new THREE.CylinderGeometry(2.2, 2.8, 6.0, 6);
        thrusterGeo.rotateX(Math.PI / 2);
        for (let x of [-3.5, 3.5]) {
          const thruster = new THREE.Mesh(thrusterGeo, hullMat);
          thruster.position.set(x, 0, 27);
          group.add(thruster);

          const plume = new THREE.Mesh(new THREE.ConeGeometry(1.8, 6.0, 6), glowMat);
          plume.position.set(x, 0, 31);
          plume.rotation.x = Math.PI / 2;
          group.add(plume);
        }

        beaconLight = new THREE.PointLight(0xfacc15, 3.0, 80);
        beaconLight.position.set(0, 5, -27);
        group.add(beaconLight);
        break;
      }

      case 'scout_cutter': {
        name = `SURVEY CUTTER [TALON-0${index + 1}]`;
        commMessage = `[COMMS] ${name}: Remote probe grid nominal. Clear vector confirmed. Good hunting, traveler.`;
        speed = 38;

        // Aerodynamic wedge forward hull (22m)
        const hull = new THREE.Mesh(new THREE.ConeGeometry(3.2, 20.0, 4), hullMat);
        hull.position.set(0, 0, 0);
        hull.rotation.x = -Math.PI / 2;
        hull.scale.set(1.4, 0.4, 1.0);
        group.add(hull);

        // Angled wings
        const wingGeo = new THREE.BoxGeometry(16, 0.4, 6);
        const wings = new THREE.Mesh(wingGeo, hullMat);
        wings.position.set(0, 0, 3);
        group.add(wings);

        // Green vector thruster
        const scoutGlowMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
        engineGlow = new THREE.Mesh(new THREE.SphereGeometry(1.4, 6, 6), scoutGlowMat);
        engineGlow.position.set(0, 0, 10.5);
        group.add(engineGlow);

        beaconLight = new THREE.PointLight(0x34d399, 2.5, 50);
        beaconLight.position.set(0, 1.5, 0);
        group.add(beaconLight);
        break;
      }

      case 'science_corvette':
      default: {
        name = `RESEARCH CORVETTE [HYPATIA-0${index + 1}]`;
        commMessage = `[COMMS] ${name}: Gravimetric anomaly sweep in progress. Broadcast beacon authenticated. Safe journey.`;
        speed = 24;

        // Central cylindrical research hull (38m)
        const mainHull = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.8, 36, 8), hullMat);
        mainHull.rotation.x = Math.PI / 2;
        group.add(mainHull);

        // Rotating Centrifuge Ring
        const ringGeo = new THREE.TorusGeometry(8.5, 0.6, 6, 24);
        const ring = new THREE.Mesh(ringGeo, cargoMat);
        ring.position.set(0, 0, -2);
        group.add(ring);

        // Sensor Array Dish
        const dish = new THREE.Mesh(new THREE.ConeGeometry(3.0, 1.5, 8), glowMat);
        dish.position.set(0, 0, -19);
        dish.rotation.x = -Math.PI / 2;
        group.add(dish);

        beaconLight = new THREE.PointLight(0x60a5fa, 2.5, 60);
        beaconLight.position.set(0, 3, -2);
        group.add(beaconLight);
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
      engineGlow,
      update: (dt: number, shipPos: THREE.Vector3) => {
        // Move forward along velocity
        vessel.position.addScaledVector(vessel.velocity, dt);
        group.position.copy(vessel.position);

        // Subtle rotation for science vessel centrifuge
        if (type === 'science_corvette') {
          group.rotateZ(dt * 0.4);
        }

        // Beacon blink
        beaconLight.intensity = 1.8 + Math.sin(Date.now() * 0.008) * 1.2;

        // Proximity Comms Hail Check (within 160m)
        const dist = vessel.position.distanceTo(shipPos);
        if (dist < 160 && !vessel.hasHailed) {
          vessel.hasHailed = true;
          return vessel.commMessage;
        } else if (dist > 350) {
          // Reset hail when far away so they can hail again later
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
    let hailMessage: string | null = null;
    for (const v of this.vessels) {
      const msg = v.update(dt, shipPos);
      if (msg && !hailMessage) {
        hailMessage = msg;
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
