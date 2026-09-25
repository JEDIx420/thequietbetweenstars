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

    // Shared Materials for Emissive Navigation Lights and Windows
    const portMat = SpaceTrafficDirector.getSharedMat('mat_port', () => new THREE.MeshBasicMaterial({ color: 0xef4444 }));
    const starMat = SpaceTrafficDirector.getSharedMat('mat_starboard', () => new THREE.MeshBasicMaterial({ color: 0x22c55e }));
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.9 });
    const strobeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1 });
    const glowMat = SpaceTrafficDirector.getSharedMat('mat_glow', () => new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
    const windowMat = SpaceTrafficDirector.getSharedMat('mat_window', () => new THREE.MeshBasicMaterial({ color: 0xe0f2fe }));
    const warmWindowMat = SpaceTrafficDirector.getSharedMat('mat_warm_win', () => new THREE.MeshBasicMaterial({ color: 0xfef08a }));
    const sensorEmitterMat = SpaceTrafficDirector.getSharedMat('mat_sensor_emitter', () => new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
    const hazardMat = SpaceTrafficDirector.getSharedMat('mat_hazard', () => new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));

    const navLightGeo = SpaceTrafficDirector.getSharedGeo('geo_nav_light', () => new THREE.SphereGeometry(0.55, 6, 4));
    const engineGeo = SpaceTrafficDirector.getSharedGeo('geo_engine_glow', () => new THREE.SphereGeometry(1.2, 6, 6));

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
          color: 0x475569,
          roughness: 0.52,
          metalness: 0.32,
          emissive: 0x0f172a,
          emissiveIntensity: 0.35,
          flatShading: true,
        }));
        const spineMat = SpaceTrafficDirector.getSharedMat('freighter_spine_mat', () => new THREE.MeshStandardMaterial({
          color: 0x334155,
          roughness: 0.58,
          metalness: 0.38,
          emissive: 0x090d16,
          emissiveIntensity: 0.25,
        }));
        const containerMatAmber = SpaceTrafficDirector.getSharedMat('freighter_container_amber', () => new THREE.MeshStandardMaterial({
          color: 0xd97706,
          roughness: 0.45,
          metalness: 0.25,
          emissive: 0x451a03,
          emissiveIntensity: 0.35,
        }));
        const containerMatBlue = SpaceTrafficDirector.getSharedMat('freighter_container_blue', () => new THREE.MeshStandardMaterial({
          color: 0x0284c7,
          roughness: 0.45,
          metalness: 0.25,
          emissive: 0x0369a1,
          emissiveIntensity: 0.35,
        }));

        // Heavy central keel spine
        const spineGeo = SpaceTrafficDirector.getSharedGeo('freighter_spine', () => new THREE.BoxGeometry(4.2, 4.2, 54));
        const spine = new THREE.Mesh(spineGeo, spineMat);
        group.add(spine);

        // Gantry cross-ribs
        const ribGeo = SpaceTrafficDirector.getSharedGeo('freighter_rib', () => new THREE.BoxGeometry(13.5, 5.0, 1.6));
        for (let z = -20; z <= 18; z += 9) {
          const rib = new THREE.Mesh(ribGeo, hullMat);
          rib.position.set(0, 0, z);
          group.add(rib);
        }

        // Modular cargo pods with alternating colors and latch lights
        const containerGeo = SpaceTrafficDirector.getSharedGeo('freighter_container_box', () => new THREE.BoxGeometry(3.8, 3.8, 6.8));
        const latchGeo = SpaceTrafficDirector.getSharedGeo('freighter_latch_strip', () => new THREE.BoxGeometry(0.3, 0.4, 5.5));
        let podIdx = 0;
        for (let z = -18; z <= 18; z += 9) {
          for (const side of [-5.0, 5.0]) {
            const isAmber = (podIdx % 2 === 0);
            podIdx++;
            const container = new THREE.Mesh(containerGeo, isAmber ? containerMatAmber : containerMatBlue);
            container.position.set(side, 0, z);
            group.add(container);

            const latch = new THREE.Mesh(latchGeo, isAmber ? hazardMat : glowMat);
            latch.position.set(side + (side > 0 ? 2.0 : -2.0), 0, z);
            group.add(latch);
          }
        }

        // Forward command superstructure
        const bridgeGeo = SpaceTrafficDirector.getSharedGeo('freighter_bridge', () => {
          const g = new THREE.ConeGeometry(5.0, 10.0, 6);
          g.rotateX(-Math.PI / 2);
          return g;
        });
        const bridge = new THREE.Mesh(bridgeGeo, hullMat);
        bridge.position.set(0, 3.2, -28);
        group.add(bridge);

        // Bridge panoramic observation window deck
        const windowStripGeo = SpaceTrafficDirector.getSharedGeo('freighter_window', () => new THREE.BoxGeometry(4.0, 0.9, 0.8));
        const windowStrip = new THREE.Mesh(windowStripGeo, warmWindowMat);
        windowStrip.position.set(0, 4.4, -30.5);
        group.add(windowStrip);

        // Antenna comms mast
        const mastGeo = SpaceTrafficDirector.getSharedGeo('freighter_mast', () => new THREE.CylinderGeometry(0.15, 0.25, 4.5, 6));
        const mast = new THREE.Mesh(mastGeo, spineMat);
        mast.position.set(0, 7.5, -28);
        group.add(mast);

        // Heavy aft twin thruster blocks with cooling radiator panels
        const thrusterGeo = SpaceTrafficDirector.getSharedGeo('freighter_thruster', () => {
          const g = new THREE.CylinderGeometry(2.6, 3.4, 7.5, 10);
          g.rotateX(Math.PI / 2);
          return g;
        });
        const radiatorGeo = SpaceTrafficDirector.getSharedGeo('freighter_radiator', () => new THREE.BoxGeometry(0.4, 4.2, 6.0));
        const amberPlumeMat = SpaceTrafficDirector.getSharedMat('plume_amber', () => new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
        const plumeGeo = SpaceTrafficDirector.getSharedGeo('freighter_plume', () => {
          const g = new THREE.ConeGeometry(2.2, 9.0, 8);
          g.rotateX(Math.PI / 2);
          return g;
        });

        for (const x of [-4.2, 4.2]) {
          const thruster = new THREE.Mesh(thrusterGeo, hullMat);
          thruster.position.set(x, 0, 28);
          group.add(thruster);

          const rad = new THREE.Mesh(radiatorGeo, sensorEmitterMat);
          rad.position.set(x > 0 ? x + 3.0 : x - 3.0, 1.0, 27);
          group.add(rad);

          const plume = new THREE.Mesh(plumeGeo, amberPlumeMat);
          plume.position.set(x, 0, 34);
          group.add(plume);
        }

        portMesh.position.set(-8.5, 2.2, -10);
        starboardMesh.position.set(8.5, 2.2, -10);
        beaconMesh.position.set(0, 9.8, -28);
        strobeMesh.position.set(0, 5.5, 28);
        group.add(portMesh, starboardMesh, beaconMesh, strobeMesh);
        break;
      }

      case 'scout_cutter': {
        name = `SURVEY CUTTER [TALON-0${(index % 9) + 1}]`;
        commMessage = `[COMMS] ${name}: Remote probe grid nominal. Clear vector confirmed. Good hunting, traveler.`;
        speed = 40;

        const cutterMat = SpaceTrafficDirector.getSharedMat('cutter_hull', () => new THREE.MeshStandardMaterial({
          color: 0x0ea5e9,
          roughness: 0.42,
          metalness: 0.30,
          emissive: 0x0369a1,
          emissiveIntensity: 0.4,
          flatShading: true,
        }));
        const wingMat = SpaceTrafficDirector.getSharedMat('cutter_wings', () => new THREE.MeshStandardMaterial({
          color: 0xe2e8f0,
          roughness: 0.38,
          metalness: 0.25,
          emissive: 0x334155,
          emissiveIntensity: 0.25,
        }));

        // Sleek supersonic lifting body fuselage
        const hullGeo = SpaceTrafficDirector.getSharedGeo('cutter_hull', () => {
          const g = new THREE.ConeGeometry(3.2, 24.0, 6);
          g.rotateX(-Math.PI / 2);
          return g;
        });
        const hull = new THREE.Mesh(hullGeo, cutterMat);
        group.add(hull);

        // Forward sensor lance spike
        const lanceGeo = SpaceTrafficDirector.getSharedGeo('cutter_lance', () => {
          const g = new THREE.CylinderGeometry(0.08, 0.25, 7.0, 6);
          g.rotateX(-Math.PI / 2);
          return g;
        });
        const lance = new THREE.Mesh(lanceGeo, sensorEmitterMat);
        lance.position.set(0, 0, -15);
        group.add(lance);

        // Swept delta wings with angled winglets
        const wingGeo = SpaceTrafficDirector.getSharedGeo('cutter_wing', () => new THREE.BoxGeometry(18.0, 0.45, 8.0));
        const wings = new THREE.Mesh(wingGeo, wingMat);
        wings.position.set(0, 0, 4);
        group.add(wings);

        // Winglet vertical tips
        const wingletGeo = SpaceTrafficDirector.getSharedGeo('cutter_winglet', () => new THREE.BoxGeometry(0.3, 3.2, 4.0));
        for (const side of [-8.9, 8.9]) {
          const w = new THREE.Mesh(wingletGeo, cutterMat);
          w.position.set(side, 1.2, 5);
          group.add(w);
        }

        // Forward canards
        const canardGeo = SpaceTrafficDirector.getSharedGeo('cutter_canard', () => new THREE.BoxGeometry(7.0, 0.3, 3.2));
        const canards = new THREE.Mesh(canardGeo, cutterMat);
        canards.position.set(0, 0.6, -7);
        group.add(canards);

        // Glowing pilot canopy with HUD illumination
        const canopyGeo = SpaceTrafficDirector.getSharedGeo('cutter_canopy', () => new THREE.BoxGeometry(2.2, 1.3, 5.5));
        const canopy = new THREE.Mesh(canopyGeo, glowMat);
        canopy.position.set(0, 1.5, -4);
        group.add(canopy);

        // Twin ion thruster nozzles
        const cyanPlumeMat = SpaceTrafficDirector.getSharedMat('plume_cyan', () => new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
        const plumeGeo = SpaceTrafficDirector.getSharedGeo('cutter_plume', () => {
          const g = new THREE.ConeGeometry(1.4, 10.0, 8);
          g.rotateX(Math.PI / 2);
          return g;
        });

        for (const x of [-1.8, 1.8]) {
          const nozzleGeo = SpaceTrafficDirector.getSharedGeo('cutter_nozzle', () => {
            const g = new THREE.CylinderGeometry(1.1, 1.5, 3.0, 8);
            g.rotateX(Math.PI / 2);
            return g;
          });
          const nozzle = new THREE.Mesh(nozzleGeo, cutterMat);
          nozzle.position.set(x, 0.2, 11);
          group.add(nozzle);

          const plume = new THREE.Mesh(plumeGeo, cyanPlumeMat);
          plume.position.set(x, 0.2, 16);
          group.add(plume);
        }

        portMesh.position.set(-9.2, 2.5, 5);
        starboardMesh.position.set(9.2, 2.5, 5);
        beaconMesh.position.set(0, 2.8, -4);
        strobeMesh.position.set(0, 2.2, 12);
        group.add(portMesh, starboardMesh, beaconMesh, strobeMesh);
        break;
      }

      case 'science_corvette':
      default: {
        name = `RESEARCH CORVETTE [HYPATIA-0${(index % 9) + 1}]`;
        commMessage = `[COMMS] ${name}: Gravimetric anomaly sweep in progress. Broadcast beacon authenticated. Safe journey.`;
        speed = 28;

        const hullMat = SpaceTrafficDirector.getSharedMat('corvette_hull', () => new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          roughness: 0.46,
          metalness: 0.30,
          emissive: 0x075985,
          emissiveIntensity: 0.45,
          flatShading: true,
        }));
        const secondaryHullMat = SpaceTrafficDirector.getSharedMat('corvette_secondary', () => new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          roughness: 0.55,
          metalness: 0.30,
          emissive: 0x0f172a,
          emissiveIntensity: 0.35,
        }));
        const ringMat = SpaceTrafficDirector.getSharedMat('corvette_ring', () => new THREE.MeshStandardMaterial({
          color: 0x06b6d4,
          roughness: 0.35,
          metalness: 0.40,
          emissive: 0x0891b2,
          emissiveIntensity: 0.8,
        }));

        // Elongated streamlined scientific research fuselage
        const hullGeo = SpaceTrafficDirector.getSharedGeo('corvette_body', () => new THREE.CylinderGeometry(2.8, 3.6, 28, 12));
        const body = new THREE.Mesh(hullGeo, hullMat);
        body.rotation.x = Math.PI / 2;
        group.add(body);

        // Forward primary sensor saucer disc
        const discGeo = SpaceTrafficDirector.getSharedGeo('corvette_disc', () => new THREE.CylinderGeometry(9.0, 9.0, 2.2, 20));
        const disc = new THREE.Mesh(discGeo, hullMat);
        disc.position.set(0, 0, -11);
        disc.rotation.x = Math.PI / 2;
        group.add(disc);

        // Long forward deep-space resonance probe boom
        const probeBoomGeo = SpaceTrafficDirector.getSharedGeo('corvette_probe_boom', () => {
          const g = new THREE.CylinderGeometry(0.2, 0.4, 9.0, 8);
          g.rotateX(-Math.PI / 2);
          return g;
        });
        const probeBoom = new THREE.Mesh(probeBoomGeo, secondaryHullMat);
        probeBoom.position.set(0, 0, -16.5);
        group.add(probeBoom);

        const probeTip = new THREE.Mesh(navLightGeo, sensorEmitterMat);
        probeTip.position.set(0, 0, -21.2);
        group.add(probeTip);

        // Glowing panoramic observation bridges (warm research cabins)
        const warmDeckGeo = SpaceTrafficDirector.getSharedGeo('corvette_warm_bridge', () => new THREE.BoxGeometry(6.4, 0.85, 2.2));
        const warmDeck = new THREE.Mesh(warmDeckGeo, warmWindowMat);
        warmDeck.position.set(0, 2.2, -11.2);
        group.add(warmDeck);

        const labWindowGeo = SpaceTrafficDirector.getSharedGeo('corvette_lab_window', () => new THREE.BoxGeometry(5.2, 0.65, 1.8));
        const labWindow = new THREE.Mesh(labWindowGeo, windowMat);
        labWindow.position.set(0, -1.8, -11.0);
        group.add(labWindow);

        // Midship rotating graviton ring
        const ringGeo = SpaceTrafficDirector.getSharedGeo('corvette_grav_ring', () => new THREE.TorusGeometry(7.2, 0.6, 8, 28));
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(0, 0, 4);
        group.add(ring);

        // Lateral outrigger sensor nacelles on angled pylons
        const pylonGeo = SpaceTrafficDirector.getSharedGeo('corvette_pylon', () => new THREE.BoxGeometry(16.0, 0.6, 3.2));
        const pylons = new THREE.Mesh(pylonGeo, secondaryHullMat);
        pylons.position.set(0, 0.5, 6);
        group.add(pylons);

        const nacelleGeo = SpaceTrafficDirector.getSharedGeo('corvette_nacelle', () => {
          const g = new THREE.CylinderGeometry(1.3, 1.6, 12.0, 8);
          g.rotateX(Math.PI / 2);
          return g;
        });
        const nacelleRadiatorGeo = SpaceTrafficDirector.getSharedGeo('corvette_nacelle_rad', () => new THREE.BoxGeometry(0.3, 2.2, 8.0));

        for (const x of [-8.0, 8.0]) {
          const nacelle = new THREE.Mesh(nacelleGeo, hullMat);
          nacelle.position.set(x, 0.5, 6);
          group.add(nacelle);

          const rad = new THREE.Mesh(nacelleRadiatorGeo, sensorEmitterMat);
          rad.position.set(x > 0 ? x + 1.2 : x - 1.2, 0.5, 6);
          group.add(rad);
        }

        // Upper communications dome
        const domeGeo = SpaceTrafficDirector.getSharedGeo('corvette_dome', () => new THREE.SphereGeometry(2.4, 12, 8));
        const bridge = new THREE.Mesh(domeGeo, glowMat);
        bridge.position.set(0, 2.4, -4);
        group.add(bridge);

        // Triple aft ion thruster exhaust plumes
        const whitePlumeMat = SpaceTrafficDirector.getSharedMat('plume_white', () => new THREE.MeshBasicMaterial({ color: 0x7dd3fc }));
        const plumeGeo = SpaceTrafficDirector.getSharedGeo('corvette_plume', () => {
          const g = new THREE.ConeGeometry(1.6, 8.5, 8);
          g.rotateX(Math.PI / 2);
          return g;
        });

        const mainPlume = new THREE.Mesh(plumeGeo, whitePlumeMat);
        mainPlume.position.set(0, 0, 18);
        group.add(mainPlume);

        for (const x of [-8.0, 8.0]) {
          const nacellePlume = new THREE.Mesh(plumeGeo, whitePlumeMat);
          nacellePlume.scale.set(0.7, 0.7, 0.7);
          nacellePlume.position.set(x, 0.5, 14);
          group.add(nacellePlume);
        }

        portMesh.position.set(-9.4, 0.6, -11);
        starboardMesh.position.set(9.4, 0.6, -11);
        beaconMesh.position.set(0, 4.4, -11);
        strobeMesh.position.set(0, 4.5, 4);
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
