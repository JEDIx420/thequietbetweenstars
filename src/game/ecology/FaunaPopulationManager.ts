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
        }
      }
    }

    // Despawn distant cells to maintain high frame rate
    for (const [key, creatures] of this.activeCells.entries()) {
      if (!neededCellKeys.has(key)) {
        for (const c of creatures) {
          this.faunaGroup.remove(c.group);
        }
        this.activeCells.delete(key);
      }
    }

    // Kinematic updates for active creatures in streamed cells
    for (const creatures of this.activeCells.values()) {
      for (const creature of creatures) {
        creature.update(dt, getHeightAt, craftPos, craftThrottle);
      }
    }
  }

  public getActiveCreatures(): ActiveCreature[] {
    const list: ActiveCreature[] = [];
    // Include encounter site giants first
    for (const site of this.encounterSites) {
      list.push(site.giantCreature);
    }
    // Include streamed cell creatures
    for (const cell of this.activeCells.values()) {
      for (const c of cell) list.push(c);
    }
    return list;
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

    // Build anatomical geometry based on bodyPlan
    if (species.category === 'AERIAL') {
      const wingSpan = s * 3.5;
      const wingGeo = new THREE.ConeGeometry(wingSpan * 0.4, wingSpan, 4);
      wingGeo.rotateZ(Math.PI / 2);
      const leftWing = new THREE.Mesh(wingGeo, mat);
      leftWing.position.set(-wingSpan * 0.4, 0, 0);
      group.add(leftWing);

      const rightWing = new THREE.Mesh(wingGeo, mat);
      rightWing.position.set(wingSpan * 0.4, 0, 0);
      rightWing.rotation.y = Math.PI;
      group.add(rightWing);

      const bodyGeo = new THREE.CylinderGeometry(s * 0.2, s * 0.35, s * 1.8, 5);
      bodyGeo.rotateX(Math.PI / 2);
      const body = new THREE.Mesh(bodyGeo, accentMat);
      group.add(body);
    } else {
      const bodyGeo = new THREE.BoxGeometry(s * 1.2, s * 0.8, s * 2.0);
      const body = new THREE.Mesh(bodyGeo, mat);
      body.position.y = s * 0.6;
      group.add(body);

      const headGeo = new THREE.DodecahedronGeometry(s * 0.5, 0);
      const head = new THREE.Mesh(headGeo, accentMat);
      head.position.set(0, s * 0.9, s * 1.2);
      group.add(head);

      const legCount = Math.min(6, Math.max(3, this.ecology.motif.limbCount));
      const legGeo = new THREE.CylinderGeometry(s * 0.12, s * 0.08, s * 0.9, 4);
      for (let l = 0; l < legCount; l++) {
        const side = l % 2 === 0 ? 1 : -1;
        const leg = new THREE.Mesh(legGeo, mat);
        const zOff = (Math.floor(l / 2) - (legCount / 4)) * (s * 0.8);
        leg.position.set(side * s * 0.65, s * 0.4, zOff);
        group.add(leg);
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
            const fleeDir = new THREE.Vector3().subVectors(group.position, shipPos).normalize();
            headingAngle = Math.atan2(fleeDir.x, fleeDir.z);
          }
        }

        if (species.category === 'AERIAL') {
          // Aerial flight dynamics
          headingAngle += Math.sin(phase * 0.2) * 0.02;
          const forward = new THREE.Vector3(Math.sin(headingAngle), 0, Math.cos(headingAngle));
          group.position.addScaledVector(forward, reactSpeed * dt);

          const groundY = getHeightAt(group.position.x, group.position.z);
          const flightAlt = groundY + Math.max(12, s * 8) + Math.sin(phase * 0.8) * 3.0;
          group.position.y = THREE.MathUtils.lerp(group.position.y, flightAlt, dt * 1.5);
          group.rotation.y = headingAngle;
          group.rotation.z = Math.sin(phase * 1.8) * 0.2;
        } else {
          // Ground wandering dynamics
          headingAngle += Math.sin(phase * 0.15) * 0.03;
          const forward = new THREE.Vector3(Math.sin(headingAngle), 0, Math.cos(headingAngle));
          group.position.addScaledVector(forward, reactSpeed * dt);

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
          const dir = new THREE.Vector3().subVectors(shipPos, group.position);
          const targetAngle = Math.atan2(dir.x, dir.z);
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
      }
    }
    this.activeCells.clear();
    this.encounterSitesGroup.clear();
    this.encounterSites = [];
  }
}
