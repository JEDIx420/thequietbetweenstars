import * as THREE from 'three';
import { SeededRandom } from '../universe/SeededRandom';
import type { PlanetEcologyProfile, EcologicalSpecies } from './PlanetEcologyProfile';
import type { SentientSpeciesProfile, NPCIdentity } from './SentientSpeciesProfile';
import type { LandingRegionProfile } from '../planets/LandingRegionProfile';

export interface CreatureScanInfo {
  name: string;
  species: string;
  category: EcologicalSpecies['category'];
  behaviour: string;
  diet: string;
  temperament: string;
  adaptation: string;
  isSentient?: boolean;
  npcData?: NPCIdentity;
}

export interface ActiveCreature {
  id: string;
  group: THREE.Group;
  species: EcologicalSpecies;
  basePos: THREE.Vector3;
  velocity: THREE.Vector3;
  headingAngle: number;
  pitchAngle: number;
  rollAngle: number;
  moveSpeed: number;
  phase: number;
  scanInfo: CreatureScanInfo;
  isGiant?: boolean;
  npcIdentity?: NPCIdentity;
  update: (dt: number, getHeightAt: (x: number, z: number) => number, shipPos: THREE.Vector3, shipThrottle: number) => void;
}

export interface SentientEncounterSite {
  id: string;
  name: string;
  type: string;
  position: THREE.Vector3;
  giantNPC: NPCIdentity;
  giantCreature: ActiveCreature;
  landmarkGroup: THREE.Group;
  beaconLight: THREE.PointLight;
}

// Reusable scratch vectors to eliminate hot-loop per-creature allocations
const scratchFleeDir = new THREE.Vector3();
const scratchForward = new THREE.Vector3();
const scratchGiantDir = new THREE.Vector3();

export class FaunaPopulationManager {
  private ecology: PlanetEcologyProfile;
  private region: LandingRegionProfile;
  private sentientProfile: SentientSpeciesProfile | null;
  private notableNPCs: NPCIdentity[] = [];

  // Spatial ecological cells
  private activeCells: Map<string, ActiveCreature[]> = new Map();
  private cellSize = 180; // Meters per spatial cell
  private activationRadius = 2; // Cells around craft
  public faunaGroup = new THREE.Group();

  // Guaranteed Sentient Encounter Sites (do NOT despawn on cell unloading)
  public encounterSites: SentientEncounterSite[] = [];
  public encounterSitesGroup = new THREE.Group();
  private sitesInitializedHeight = false;

  // Reusable materials cache
  private materialsCache: Map<string, THREE.Material> = new Map();
  private clock = 0;
  private simFrame = 0;
  private lastCellX: number | null = null;
  private lastCellZ: number | null = null;
  private activeCreaturesCache: ActiveCreature[] = [];
  private cacheDirty = true;

  constructor(
    ecology: PlanetEcologyProfile,
    region: LandingRegionProfile,
    sentientProfile: SentientSpeciesProfile | null,
    notableNPCs: NPCIdentity[] = []
  ) {
    this.ecology = ecology;
    this.region = region;
    this.sentientProfile = sentientProfile;
    this.notableNPCs = notableNPCs;

    this.faunaGroup.add(this.encounterSitesGroup);

    // Initialize guaranteed Sentient Encounter Site if world is sentient
    if (this.ecology.tier === 'SENTIENT_BIOSPHERE' && this.sentientProfile && this.notableNPCs.length > 0) {
      this.initEncounterSites();
    }
  }

  private initEncounterSites(): void {
    const rng = new SeededRandom(this.region.regionSeed + 777);
    const siteCount = Math.min(2, Math.max(1, this.notableNPCs.length));

    for (let i = 0; i < siteCount; i++) {
      const npc = this.notableNPCs[i % this.notableNPCs.length];
      const angle = (i / siteCount) * Math.PI * 2 + rng.range(0.2, 0.8);
      const dist = rng.range(190, 360); // Guaranteed within 190–360m of landing
      const sx = Math.cos(angle) * dist;
      const sz = Math.sin(angle) * dist;
      const initialPos = new THREE.Vector3(sx, 15, sz);

      const landmarkGroup = new THREE.Group();

      // Basaltic sanctuary spires ring
      const spireMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.9,
        metalness: 0.2,
        flatShading: true,
      });

      const spireCount = 6;
      for (let s = 0; s < spireCount; s++) {
        const sAngle = (s / spireCount) * Math.PI * 2;
        const sDist = 16.0;
        const sHeight = 12.0 + (s % 3) * 4.0;
        const spireGeo = new THREE.CylinderGeometry(0.8, 2.2, sHeight, 5);
        const spire = new THREE.Mesh(spireGeo, spireMat);
        spire.position.set(Math.cos(sAngle) * sDist, sHeight * 0.5, Math.sin(sAngle) * sDist);
        spire.rotation.y = sAngle;
        spire.rotation.z = 0.08 * (s % 2 === 0 ? 1 : -1);
        landmarkGroup.add(spire);
      }

      // Central Acoustic Resonance Beacon Tower
      const beaconMat = new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.9,
        roughness: 0.2,
        metalness: 0.8,
      });
      const beaconGeo = new THREE.OctahedronGeometry(2.2, 0);
      const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
      beaconMesh.position.set(0, 18, 0);
      landmarkGroup.add(beaconMesh);

      const beaconLight = new THREE.PointLight(0x38bdf8, 3.5, 60);
      beaconLight.position.set(0, 19, 0);
      landmarkGroup.add(beaconLight);

      landmarkGroup.position.copy(initialPos);
      this.encounterSitesGroup.add(landmarkGroup);

      // Giant creature standing at sanctuary center
      const giantCreature = this.buildGiant(npc, initialPos);
      this.encounterSitesGroup.add(giantCreature.group);

      this.encounterSites.push({
        id: `site_encounter_${npc.npcId}`,
        name: `Sanctuary of ${npc.name}`,
        type: 'Acoustic Resonance Sanctuary',
        position: initialPos,
        giantNPC: npc,
        giantCreature,
        landmarkGroup,
        beaconLight,
      });
    }
  }

  public update(
    craftPos: THREE.Vector3,
    craftThrottle: number,
    dt: number,
    getHeightAt: (x: number, z: number) => number
  ): void {
    if (this.ecology.tier === 'BARREN') return;
    this.clock += dt;

    // Anchor encounter sites on first frame when terrain heights are known
    if (!this.sitesInitializedHeight) {
      for (const site of this.encounterSites) {
        const groundY = getHeightAt(site.position.x, site.position.z);
        site.position.y = groundY;
        site.landmarkGroup.position.y = groundY;
        site.giantCreature.group.position.y = groundY;
        site.giantCreature.basePos.y = groundY;
      }
      this.sitesInitializedHeight = true;
    }

    // Update encounter sites & giant look-at behavior
    for (const site of this.encounterSites) {
      // Pulse resonance beacon
      const pulse = 2.2 + Math.sin(this.clock * 2.8) * 1.4;
      site.beaconLight.intensity = pulse;

      // Update giant kinematics
      site.giantCreature.update(dt, getHeightAt, craftPos, craftThrottle);
    }

    const centerCellX = Math.floor(craftPos.x / this.cellSize);
    const centerCellZ = Math.floor(craftPos.z / this.cellSize);

    if (centerCellX !== this.lastCellX || centerCellZ !== this.lastCellZ) {
      this.lastCellX = centerCellX;
      this.lastCellZ = centerCellZ;
      const neededCellKeys = new Set<string>();

      for (let dx = -this.activationRadius; dx <= this.activationRadius; dx++) {
        for (let dz = -this.activationRadius; dz <= this.activationRadius; dz++) {
          const cx = centerCellX + dx;
          const cz = centerCellZ + dz;
          const key = `${cx},${cz}`;
          neededCellKeys.add(key);

          if (!this.activeCells.has(key)) {
            const spawned = this.spawnCell(cx, cz, getHeightAt);
            this.activeCells.set(key, spawned);
            for (const c of spawned) {
              this.faunaGroup.add(c.group);
            }
            this.cacheDirty = true;
          }
        }
      }

      // Despawn distant cells to maintain high frame rate
      for (const [key, creatures] of this.activeCells.entries()) {
        if (!neededCellKeys.has(key)) {
          for (const c of creatures) {
            this.faunaGroup.remove(c.group);
            c.group.traverse((obj) => {
              if (obj instanceof THREE.Mesh) {
                obj.geometry?.dispose();
              }
            });
          }
          this.activeCells.delete(key);
          this.cacheDirty = true;
        }
      }
    }

    // Kinematic updates for active creatures in streamed cells with distance-based simulation LOD
    this.simFrame++;
    for (const creatures of this.activeCells.values()) {
      for (const creature of creatures) {
        const dist = creature.group.position.distanceTo(craftPos);
        if (dist < 120) {
          // Near: update every frame
          creature.update(dt, getHeightAt, craftPos, craftThrottle);
        } else if (dist < 260) {
          // Mid: update every 2nd frame
          if (this.simFrame % 2 === 0) {
            creature.update(dt * 2, getHeightAt, craftPos, craftThrottle);
          }
        } else {
          // Far: update every 5th frame
          if (this.simFrame % 5 === 0) {
            creature.update(dt * 5, getHeightAt, craftPos, craftThrottle);
          }
        }
      }
    }
  }

  public getActiveCreatures(): ActiveCreature[] {
    if (this.cacheDirty) {
      this.activeCreaturesCache.length = 0;
      // Include encounter site giants first
      for (const site of this.encounterSites) {
        this.activeCreaturesCache.push(site.giantCreature);
      }
      // Include streamed cell creatures
      for (const cell of this.activeCells.values()) {
        for (const c of cell) {
          this.activeCreaturesCache.push(c);
        }
      }
      this.cacheDirty = false;
    }
    return this.activeCreaturesCache;
  }

  public getEncounterSites(): SentientEncounterSite[] {
    return this.encounterSites;
  }

  private spawnCell(
    cx: number,
    cz: number,
    getHeightAt: (x: number, z: number) => number
  ): ActiveCreature[] {
    const cellSeed = SeededRandom.hashCoords(this.ecology.seed, cx, 0, cz);
    const rng = new SeededRandom(cellSeed);

    const creatures: ActiveCreature[] = [];
    const cellOriginX = cx * this.cellSize;
    const cellOriginZ = cz * this.cellSize;

    // Density modulation by ecology tier
    let targetCount = 0;
    if (this.ecology.tier === 'MICROBIAL') targetCount = rng.rangeInt(1, 2);
    else if (this.ecology.tier === 'SIMPLE_BIOSPHERE') targetCount = rng.rangeInt(2, 4);
    else if (this.ecology.tier === 'COMPLEX_BIOSPHERE') targetCount = rng.rangeInt(4, 7);
    else if (this.ecology.tier === 'SENTIENT_BIOSPHERE') targetCount = rng.rangeInt(4, 8);

    // Spawn biological species (Ground, Aerial, Amphibious, Megafauna)
    for (let i = 0; i < targetCount; i++) {
      const speciesPool = [
        ...this.ecology.groundSpecies,
        ...this.ecology.aerialSpecies,
        ...this.ecology.amphibiousSpecies,
        ...this.ecology.megafaunaSpecies,
      ];
      if (speciesPool.length === 0) break;

      const species = rng.pick(speciesPool);
      const lx = cellOriginX + rng.range(15, this.cellSize - 15);
      const lz = cellOriginZ + rng.range(15, this.cellSize - 15);
      const ly = getHeightAt(lx, lz);

      if (ly < 2.0 && species.category !== 'AMPHIBIOUS') continue;

      const creature = this.buildCreature(species, new THREE.Vector3(lx, ly, lz), rng);
      creatures.push(creature);
    }

    return creatures;
  }

  private buildCreature(
    species: EcologicalSpecies,
    spawnPos: THREE.Vector3,
    rng: SeededRandom
  ): ActiveCreature {
    const group = new THREE.Group();
    const s = species.scale;

    const baseColor = new THREE.Color(this.ecology.motif.primaryColor || 0x38bdf8);
    const accentColor = new THREE.Color(this.ecology.motif.accentColor || 0x60a5fa);

    const matKey = `${species.id}_mat`;
    let mat = this.materialsCache.get(matKey);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: 0.6,
        metalness: 0.2,
        flatShading: true,
      });
      this.materialsCache.set(matKey, mat);
    }

    const accentMatKey = `${species.id}_accent`;
    let accentMat = this.materialsCache.get(accentMatKey);
    if (!accentMat) {
      accentMat = new THREE.MeshStandardMaterial({
        color: accentColor,
        roughness: 0.4,
        metalness: 0.4,
      });
      this.materialsCache.set(accentMatKey, accentMat);
    }

    // Glowing sensory/eye material
    const glowMatKey = `${species.id}_glow`;
    let glowMat = this.materialsCache.get(glowMatKey);
    if (!glowMat) {
      glowMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(this.ecology.motif.accentColor || 0x38bdf8),
      });
      this.materialsCache.set(glowMatKey, glowMat);
    }

    // Build rich anatomical procedural geometry based on species.bodyPlan & category
    switch (species.bodyPlan) {
      case 'balloon': {
        // Enormous atmospheric aerostat / sky whale
        const balloonGeo = new THREE.SphereGeometry(s * 2.2, 10, 8);
        balloonGeo.scale(1.0, 0.75, 1.8);
        const balloonMesh = new THREE.Mesh(balloonGeo, mat);
        balloonMesh.position.y = s * 3.5;
        group.add(balloonMesh);

        // Ventral fins
        const finGeo = new THREE.BoxGeometry(s * 4.5, s * 0.2, s * 1.5);
        const fin = new THREE.Mesh(finGeo, accentMat);
        fin.position.set(0, s * 3.0, 0);
        group.add(fin);

        // Bioluminescent ventral nodes
        for (let i = -2; i <= 2; i++) {
          const node = new THREE.Mesh(new THREE.SphereGeometry(s * 0.25, 6, 6), glowMat);
          node.position.set(0, s * 1.8, i * s * 0.9);
          group.add(node);
        }
        break;
      }

      case 'glider':
      case 'ray': {
        // Broad aerodynamic gliding wings
        const wingSpan = s * 4.2;
        const wingGeo = new THREE.ConeGeometry(wingSpan * 0.35, wingSpan, 4);
        wingGeo.rotateZ(Math.PI / 2);
        const wing = new THREE.Mesh(wingGeo, mat);
        wing.scale.set(1.0, 0.15, 0.8);
        wing.position.y = s * 1.5;
        group.add(wing);

        // Dorsal ridge
        const ridge = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.15, s * 0.3, s * 2.2, 5), accentMat);
        ridge.rotateX(Math.PI / 2);
        ridge.position.y = s * 1.6;
        group.add(ridge);

        // Trailing rudder filament
        const tail = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.05, s * 0.1, s * 2.8, 3), glowMat);
        tail.rotateX(Math.PI / 2);
        tail.position.set(0, s * 1.5, s * 2.0);
        group.add(tail);
        break;
      }

      case 'jelly': {
        // Floating luminescent bell
        const bellGeo = new THREE.SphereGeometry(s * 1.6, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.65);
        const bell = new THREE.Mesh(bellGeo, mat);
        bell.rotation.x = Math.PI;
        bell.position.y = s * 3.0;
        group.add(bell);

        const bellCore = new THREE.Mesh(new THREE.SphereGeometry(s * 0.6, 6, 6), glowMat);
        bellCore.position.y = s * 2.6;
        group.add(bellCore);

        // Tentacles
        const tentGeo = new THREE.CylinderGeometry(s * 0.04, s * 0.07, s * 2.6, 3);
        for (let t = 0; t < 6; t++) {
          const tAng = (t * Math.PI * 2) / 6;
          const tent = new THREE.Mesh(tentGeo, accentMat);
          tent.position.set(Math.cos(tAng) * s * 0.9, s * 1.3, Math.sin(tAng) * s * 0.9);
          group.add(tent);
        }
        break;
      }

      case 'swarm': {
        // Clustered swift flyers
        for (let f = 0; f < 5; f++) {
          const m = new THREE.Mesh(new THREE.ConeGeometry(s * 0.4, s * 1.2, 3), accentMat);
          m.rotation.x = Math.PI / 2;
          const fAng = (f * Math.PI * 2) / 5;
          m.position.set(Math.cos(fAng) * s * 1.6, s * 2.5 + (f % 2) * s * 0.5, Math.sin(fAng) * s * 1.6);
          group.add(m);
        }
        break;
      }

      case 'tripod': {
        // Spherical shell with 3 tall stilt legs
        const shell = new THREE.Mesh(new THREE.DodecahedronGeometry(s * 1.2, 0), mat);
        shell.position.y = s * 3.2;
        group.add(shell);

        const crest = new THREE.Mesh(new THREE.ConeGeometry(s * 0.4, s * 1.5, 4), glowMat);
        crest.position.set(0, s * 4.4, 0);
        group.add(crest);

        const legGeo = new THREE.CylinderGeometry(s * 0.1, s * 0.14, s * 3.2, 3);
        for (let a = 0; a < 3; a++) {
          const legAng = (a * Math.PI * 2) / 3;
          const leg = new THREE.Mesh(legGeo, accentMat);
          leg.position.set(Math.cos(legAng) * s * 1.1, s * 1.6, Math.sin(legAng) * s * 1.1);
          leg.rotation.z = Math.cos(legAng) * 0.25;
          leg.rotation.x = Math.sin(legAng) * 0.25;
          group.add(leg);
        }
        break;
      }

      case 'colossus':
      case 'shoreline_grazer': {
        // Heavy monolithic titan
        const torso = new THREE.Mesh(new THREE.BoxGeometry(s * 2.4, s * 1.8, s * 4.0), mat);
        torso.position.y = s * 3.5;
        group.add(torso);

        const dorsalCrest = new THREE.Mesh(new THREE.ConeGeometry(s * 0.8, s * 2.5, 4), accentMat);
        dorsalCrest.position.set(0, s * 5.2, -s * 0.5);
        group.add(dorsalCrest);

        const legGeo = new THREE.CylinderGeometry(s * 0.35, s * 0.45, s * 3.2, 5);
        for (const [lx, lz] of [
          [-s * 1.1, -s * 1.4], [s * 1.1, -s * 1.4],
          [-s * 1.1, s * 1.4], [s * 1.1, s * 1.4],
        ]) {
          const leg = new THREE.Mesh(legGeo, accentMat);
          leg.position.set(lx, s * 1.6, lz);
          group.add(leg);
        }
        break;
      }

      case 'segmented': {
        // Multi-segmented serpent / myriapod
        const segGeo = new THREE.SphereGeometry(s * 0.8, 6, 5);
        for (let segIdx = 0; segIdx < 6; segIdx++) {
          const segMesh = new THREE.Mesh(segGeo, segIdx % 2 === 0 ? mat : accentMat);
          segMesh.position.set(0, s * 0.7, (segIdx - 2.5) * s * 1.2);
          group.add(segMesh);
        }
        const eyeNode = new THREE.Mesh(new THREE.ConeGeometry(s * 0.3, s * 0.8, 4), glowMat);
        eyeNode.position.set(0, s * 1.3, -s * 3.4);
        eyeNode.rotation.x = -Math.PI / 3;
        group.add(eyeNode);
        break;
      }

      case 'six_legged': {
        // Hexapod mantis / crystal scuttler
        const thorax = new THREE.Mesh(new THREE.ConeGeometry(s * 1.1, s * 2.6, 6), mat);
        thorax.rotateX(Math.PI / 2);
        thorax.position.y = s * 1.1;
        group.add(thorax);

        const horn = new THREE.Mesh(new THREE.ConeGeometry(s * 0.25, s * 1.2, 4), glowMat);
        horn.position.set(0, s * 1.6, -s * 1.3);
        horn.rotation.x = -0.5;
        group.add(horn);

        const legGeo = new THREE.CylinderGeometry(s * 0.08, s * 0.12, s * 1.4, 3);
        for (let l = 0; l < 6; l++) {
          const side = l % 2 === 0 ? 1 : -1;
          const zOff = (Math.floor(l / 2) - 1) * s * 0.9;
          const leg = new THREE.Mesh(legGeo, accentMat);
          leg.position.set(side * s * 1.0, s * 0.6, zOff);
          leg.rotation.z = side * 0.35;
          group.add(leg);
        }
        break;
      }

      case 'hopper': {
        // Round pod body with coiled bipedal spring legs
        const pod = new THREE.Mesh(new THREE.IcosahedronGeometry(s * 1.0, 0), mat);
        pod.position.y = s * 1.5;
        group.add(pod);

        const eye = new THREE.Mesh(new THREE.SphereGeometry(s * 0.25, 4, 4), glowMat);
        eye.position.set(0, s * 1.8, -s * 0.8);
        group.add(eye);

        const legGeo = new THREE.CylinderGeometry(s * 0.12, s * 0.16, s * 1.6, 4);
        for (const side of [-1, 1]) {
          const leg = new THREE.Mesh(legGeo, accentMat);
          leg.position.set(side * s * 0.7, s * 0.8, 0);
          leg.rotation.x = 0.3;
          group.add(leg);
        }
        break;
      }

      case 'quadruped':
      default: {
        if (species.category === 'AERIAL') {
          // Swift aerial flyer
          const wingSpan = s * 3.5;
          const wingGeo = new THREE.ConeGeometry(wingSpan * 0.4, wingSpan, 4);
          wingGeo.rotateZ(Math.PI / 2);
          const leftWing = new THREE.Mesh(wingGeo, mat);
          leftWing.position.set(-wingSpan * 0.4, s * 1.5, 0);
          group.add(leftWing);

          const rightWing = new THREE.Mesh(wingGeo, mat);
          rightWing.position.set(wingSpan * 0.4, s * 1.5, 0);
          rightWing.rotation.y = Math.PI;
          group.add(rightWing);

          const bodyGeo = new THREE.CylinderGeometry(s * 0.2, s * 0.35, s * 1.8, 5);
          bodyGeo.rotateX(Math.PI / 2);
          const body = new THREE.Mesh(bodyGeo, accentMat);
          body.position.y = s * 1.5;
          group.add(body);
        } else {
          // Quadruped / crawler
          const bodyGeo = new THREE.BoxGeometry(s * 1.3, s * 0.9, s * 2.2);
          const body = new THREE.Mesh(bodyGeo, mat);
          body.position.y = s * 0.8;
          group.add(body);

          const headGeo = new THREE.DodecahedronGeometry(s * 0.55, 0);
          const head = new THREE.Mesh(headGeo, accentMat);
          head.position.set(0, s * 1.2, -s * 1.2);
          group.add(head);

          const legCount = Math.min(6, Math.max(4, this.ecology.motif.limbCount));
          const legGeo = new THREE.CylinderGeometry(s * 0.12, s * 0.09, s * 1.0, 4);
          for (let l = 0; l < legCount; l++) {
            const side = l % 2 === 0 ? 1 : -1;
            const leg = new THREE.Mesh(legGeo, accentMat);
            const zOff = (Math.floor(l / 2) - (legCount / 4)) * (s * 0.9);
            leg.position.set(side * s * 0.7, s * 0.5, zOff);
            group.add(leg);
          }
        }
        break;
      }
    }

    group.position.copy(spawnPos);

    let phase = rng.range(0, Math.PI * 2);
    let headingAngle = rng.range(0, Math.PI * 2);

    const scanInfo: CreatureScanInfo = {
      name: species.name,
      species: `${this.region.id.toUpperCase()}-${species.bodyPlan.toUpperCase()}`,
      category: species.category,
      behaviour: species.behaviour,
      diet: species.diet,
      temperament: species.temperament,
      adaptation: species.description,
    };

    return {
      id: `fauna_${rng.rangeInt(1000, 9999)}`,
      group,
      species,
      basePos: spawnPos.clone(),
      velocity: new THREE.Vector3(),
      headingAngle,
      pitchAngle: 0,
      rollAngle: 0,
      moveSpeed: species.baseSpeed,
      phase,
      scanInfo,
      update: (dt, getHeightAt, shipPos, shipThrottle) => {
        phase += dt * 2.5;

        // Ship reaction: thruster wash scares timid/ground creatures
        const distToShip = group.position.distanceTo(shipPos);
        let reactSpeed = species.baseSpeed;

        if (distToShip < 40 && shipThrottle > 0.3) {
          if (species.temperament === 'timid' || species.category === 'GROUND') {
            reactSpeed *= 2.2;
            scratchFleeDir.subVectors(group.position, shipPos).normalize();
            headingAngle = Math.atan2(scratchFleeDir.x, scratchFleeDir.z);
          }
        }

        if (species.category === 'AERIAL') {
          // Aerial flight dynamics
          headingAngle += Math.sin(phase * 0.2) * 0.02;
          scratchForward.set(Math.sin(headingAngle), 0, Math.cos(headingAngle));
          group.position.addScaledVector(scratchForward, reactSpeed * dt);

          const groundY = getHeightAt(group.position.x, group.position.z);
          const flightAlt = groundY + Math.max(12, s * 8) + Math.sin(phase * 0.8) * 3.0;
          group.position.y = THREE.MathUtils.lerp(group.position.y, flightAlt, dt * 1.5);
          group.rotation.y = headingAngle;
          group.rotation.z = Math.sin(phase * 1.8) * 0.2;
        } else {
          // Ground wandering dynamics
          headingAngle += Math.sin(phase * 0.15) * 0.03;
          scratchForward.set(Math.sin(headingAngle), 0, Math.cos(headingAngle));
          group.position.addScaledVector(scratchForward, reactSpeed * dt);

          const groundY = getHeightAt(group.position.x, group.position.z);
          group.position.y = THREE.MathUtils.lerp(group.position.y, groundY, dt * 8.0);
          group.rotation.y = headingAngle;
          group.position.y += Math.abs(Math.sin(phase * 3.0)) * (s * 0.15); // Step bob
        }
      },
    };
  }

  private buildGiant(
    npc: NPCIdentity,
    spawnPos: THREE.Vector3
  ): ActiveCreature {
    const group = new THREE.Group();
    const h = (this.sentientProfile?.averageHeightMeters || 20) * 1.25; // 20–25m height

    const giantMat = new THREE.MeshStandardMaterial({
      color: 0x334155, // Basaltic monolithic slate
      roughness: 0.8,
      metalness: 0.2,
      flatShading: true,
    });

    const lumMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.8,
    });

    // Articulated alien giant body
    // Lower robe
    const robeGeo = new THREE.ConeGeometry(h * 0.24, h * 0.65, 7);
    const robe = new THREE.Mesh(robeGeo, giantMat);
    robe.position.y = h * 0.35;
    group.add(robe);

    // Articulated upper torso
    const upperGeo = new THREE.BoxGeometry(h * 0.3, h * 0.36, h * 0.2);
    const upper = new THREE.Mesh(upperGeo, giantMat);
    upper.position.y = h * 0.72;
    group.add(upper);

    // Stately alien head node (for smooth look-at tracking)
    const headPivot = new THREE.Group();
    headPivot.position.y = h * 0.94;

    const headGeo = new THREE.CylinderGeometry(h * 0.08, h * 0.15, h * 0.24, 6);
    const head = new THREE.Mesh(headGeo, giantMat);
    headPivot.add(head);

    // Luminous Acoustic Crest / Halo
    const crestGeo = new THREE.TorusGeometry(h * 0.18, h * 0.025, 6, 24);
    const crest = new THREE.Mesh(crestGeo, lumMat);
    crest.position.set(0, h * 0.14, 0);
    crest.rotation.x = Math.PI / 4;
    headPivot.add(crest);

    group.add(headPivot);

    // Standing limbs
    const legGeo = new THREE.CylinderGeometry(h * 0.07, h * 0.09, h * 0.45, 5);
    const leftLeg = new THREE.Mesh(legGeo, giantMat);
    leftLeg.position.set(-h * 0.13, h * 0.22, 0);
    const rightLeg = new THREE.Mesh(legGeo, giantMat);
    rightLeg.position.set(h * 0.13, h * 0.22, 0);
    group.add(leftLeg);
    group.add(rightLeg);

    group.position.copy(spawnPos);

    const scanInfo: CreatureScanInfo = {
      name: npc.name,
      species: this.sentientProfile?.name || 'Sentient Giant',
      category: 'SENTIENT',
      behaviour: 'Observing the vessel in peaceful stillness.',
      diet: 'Acoustic / Mineral resonance',
      temperament: 'Venerable & receptive to peaceful communication',
      adaptation: this.sentientProfile?.worldview || 'Acoustic harmonic philosophy',
      isSentient: true,
      npcData: npc,
    };

    const dummySpecies: EcologicalSpecies = {
      id: `giant_${npc.npcId}`,
      name: npc.name,
      category: 'SENTIENT',
      bodyPlan: 'sentient_giant',
      scale: 1.0,
      baseSpeed: 1.0,
      temperament: 'venerable',
      diet: 'Acoustic harmonics',
      behaviour: 'sentient_gaze',
      rarity: 1.0,
      heightMeters: h,
      description: `Individual representative of ${this.sentientProfile?.name}.`,
    };

    let giantClock = 0;

    return {
      id: npc.npcId,
      group,
      species: dummySpecies,
      basePos: spawnPos.clone(),
      velocity: new THREE.Vector3(),
      headingAngle: 0,
      pitchAngle: 0,
      rollAngle: 0,
      moveSpeed: 1.0,
      phase: 0,
      scanInfo,
      isGiant: true,
      npcIdentity: npc,
      update: (dt, getHeightAt, shipPos) => {
        giantClock += dt;

        // Idle breathing sway
        const breathingSway = Math.sin(giantClock * 1.5) * 0.25;
        upper.position.y = h * 0.72 + breathingSway * 0.3;
        headPivot.position.y = h * 0.94 + breathingSway * 0.4;

        // Look-at tracking: head and upper body smoothly turn toward ship
        const distToShip = group.position.distanceTo(shipPos);
        if (distToShip < 90.0) {
          scratchGiantDir.subVectors(shipPos, group.position);
          const targetAngle = Math.atan2(scratchGiantDir.x, scratchGiantDir.z);
          group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, targetAngle, dt * 2.5);

          // Tilt head slightly toward ship elevation
          const yDiff = shipPos.y - headPivot.position.y;
          const pitchTarget = THREE.MathUtils.clamp(Math.atan2(yDiff, distToShip), -0.3, 0.4);
          headPivot.rotation.x = THREE.MathUtils.lerp(headPivot.rotation.x, pitchTarget, dt * 3.0);
        }

        // Ground anchoring
        const curY = getHeightAt(group.position.x, group.position.z);
        group.position.y = curY;
      },
    };
  }

  public dispose(): void {
    for (const cell of this.activeCells.values()) {
      for (const c of cell) {
        this.faunaGroup.remove(c.group);
        c.group.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry?.dispose();
          }
        });
      }
    }
    this.activeCells.clear();
    this.activeCreaturesCache = [];
    this.cacheDirty = true;

    for (const site of this.encounterSites) {
      site.landmarkGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
        }
      });
      site.giantCreature.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
        }
      });
      site.beaconLight.dispose();
    }
    this.encounterSites = [];
    this.encounterSitesGroup.clear();
    this.faunaGroup.clear();

    for (const mat of this.materialsCache.values()) {
      mat.dispose();
    }
    this.materialsCache.clear();
  }
}
