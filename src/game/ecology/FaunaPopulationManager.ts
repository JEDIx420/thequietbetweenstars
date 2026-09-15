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
  update: (
    dt: number,
    getHeightAt: (x: number, z: number) => number,
    shipPos: THREE.Vector3,
    shipThrottle: number
  ) => void;
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

  // Reusable materials cache
  private materialsCache: Map<string, THREE.Material> = new Map();

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
  }

  public update(
    craftPos: THREE.Vector3,
    craftThrottle: number,
    dt: number,
    getHeightAt: (x: number, z: number) => number
  ): void {
    if (this.ecology.tier === 'BARREN') return;

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

    // Kinematic updates for active creatures
    for (const creatures of this.activeCells.values()) {
      for (const creature of creatures) {
        creature.update(dt, getHeightAt, craftPos, craftThrottle);
      }
    }
  }

  public getActiveCreatures(): ActiveCreature[] {
    const list: ActiveCreature[] = [];
    for (const cell of this.activeCells.values()) {
      for (const c of cell) list.push(c);
    }
    return list;
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

    // 1. Check for Sentient Giant in this cell (rare / deterministic per region)
    if (this.ecology.tier === 'SENTIENT_BIOSPHERE' && this.sentientProfile && (cx + cz) % 3 === 0) {
      const npc = this.notableNPCs[(Math.abs(cx * 7 + cz * 13)) % Math.max(1, this.notableNPCs.length)];
      const gx = cellOriginX + rng.range(20, this.cellSize - 20);
      const gz = cellOriginZ + rng.range(20, this.cellSize - 20);
      const gy = getHeightAt(gx, gz);

      const giantCreature = this.buildGiant(npc, new THREE.Vector3(gx, gy, gz));
      creatures.push(giantCreature);
      targetCount--;
    }

    // 2. Spawn biological species (Ground, Aerial, Megafauna)
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

      // Avoid water for non-amphibious
      if (ly < 2.0 && species.category !== 'AMPHIBIOUS' && species.category !== 'AERIAL') {
        continue;
      }

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
    const motif = this.ecology.motif;

    // Body Material derived from planetary motif
    const matKey = `mat_${species.bodyPlan}_${motif.name}`;
    let bodyMat = this.materialsCache.get(matKey) as THREE.MeshStandardMaterial;
    if (!bodyMat) {
      bodyMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(motif.primaryColor).offsetHSL(rng.range(-0.05, 0.05), 0.1, 0.05),
        roughness: motif.integument === 'chitin' || motif.integument === 'crystalline_plates' ? 0.3 : 0.7,
        metalness: motif.integument === 'crystalline_plates' ? 0.4 : 0.05,
        flatShading: true,
      });
      this.materialsCache.set(matKey, bodyMat);
    }

    const eyeMat = new THREE.MeshBasicMaterial({
      color: motif.bioluminescence ? 0x38bdf8 : 0xf97316,
    });

    const h = species.heightMeters;

    // Geometric construction based on body plan
    switch (species.bodyPlan) {
      case 'colossus': {
        // Towering Megafauna (12-16m)
        const torso = new THREE.Mesh(new THREE.BoxGeometry(4.5, 3.5, 7.0), bodyMat);
        torso.position.y = h * 0.6;
        group.add(torso);

        const neck = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 6.0, 6), bodyMat);
        neck.position.set(0, h * 0.8, -3.2);
        neck.rotation.x = -Math.PI / 4;
        group.add(neck);

        const head = new THREE.Mesh(new THREE.SphereGeometry(1.4, 6, 6), bodyMat);
        head.position.set(0, h * 1.05, -5.2);
        group.add(head);

        // 4 massive pillar legs
        const legGeo = new THREE.CylinderGeometry(0.8, 1.1, h * 0.6, 6);
        for (const [lx, lz] of [[-1.8, -2.2], [1.8, -2.2], [-1.8, 2.2], [1.8, 2.2]]) {
          const leg = new THREE.Mesh(legGeo, bodyMat);
          leg.position.set(lx, (h * 0.6) / 2, lz);
          group.add(leg);
        }
        break;
      }

      case 'ray':
      case 'glider': {
        // Aerial soaring manta/glider
        const wingWidth = h * 2.6;
        const wingLength = h * 1.8;
        const rayBody = new THREE.Mesh(new THREE.ConeGeometry(wingWidth * 0.45, wingLength, 4), bodyMat);
        rayBody.rotation.x = Math.PI / 2;
        rayBody.scale.set(2.2, 0.22, 1.0);
        group.add(rayBody);

        const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, wingLength * 1.5, 3), bodyMat);
        tail.position.set(0, 0, wingLength * 0.8);
        tail.rotation.x = Math.PI / 2;
        group.add(tail);
        break;
      }

      case 'jelly':
      case 'balloon': {
        // Floating atmospheric siphon
        const dome = new THREE.Mesh(new THREE.SphereGeometry(h * 0.6, 8, 8, 0, Math.PI * 2, 0, Math.PI * 0.7), bodyMat);
        dome.rotation.x = Math.PI;
        group.add(dome);

        const tentacleGeo = new THREE.CylinderGeometry(0.08, 0.12, h * 0.9, 4);
        for (let t = 0; t < 6; t++) {
          const ang = (t * Math.PI * 2) / 6;
          const tent = new THREE.Mesh(tentacleGeo, bodyMat);
          tent.position.set(Math.cos(ang) * (h * 0.35), -h * 0.5, Math.sin(ang) * (h * 0.35));
          group.add(tent);
        }
        break;
      }

      case 'six_legged': {
        // Hexapod grazer
        const torso = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.2, 3.8), bodyMat);
        torso.position.y = 1.6;
        group.add(torso);

        const legGeo = new THREE.CylinderGeometry(0.18, 0.22, 1.6, 4);
        for (const [lx, lz] of [[-1.1, -1.3], [1.1, -1.3], [-1.2, 0], [1.2, 0], [-1.1, 1.3], [1.1, 1.3]]) {
          const leg = new THREE.Mesh(legGeo, bodyMat);
          leg.position.set(lx, 0.8, lz);
          group.add(leg);
        }
        break;
      }

      case 'tripod': {
        const shell = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2, 0), bodyMat);
        shell.position.y = 3.2;
        group.add(shell);

        const legGeo = new THREE.CylinderGeometry(0.12, 0.16, 3.2, 3);
        for (let a = 0; a < 3; a++) {
          const ang = (a * Math.PI * 2) / 3;
          const leg = new THREE.Mesh(legGeo, bodyMat);
          leg.position.set(Math.cos(ang) * 1.1, 1.6, Math.sin(ang) * 1.1);
          group.add(leg);
        }
        break;
      }

      default: {
        // Default quad/crawler
        const torso = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 2.6), bodyMat);
        torso.position.y = 1.2;
        group.add(torso);

        const legGeo = new THREE.CylinderGeometry(0.16, 0.18, 1.2, 4);
        for (const [lx, lz] of [[-0.8, -0.9], [0.8, -0.9], [-0.8, 0.9], [0.8, 0.9]]) {
          const leg = new THREE.Mesh(legGeo, bodyMat);
          leg.position.set(lx, 0.6, lz);
          group.add(leg);
        }
        break;
      }
    }

    // Add eyes based on motif
    for (let e = 0; e < motif.eyeCount; e++) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12 * species.scale, 4, 4), eyeMat);
      const xOff = (e - (motif.eyeCount - 1) / 2) * 0.25;
      eye.position.set(xOff, species.heightMeters * 0.75, -species.heightMeters * 0.4);
      group.add(eye);
    }

    group.position.copy(spawnPos);

    let headingAngle = rng.range(0, Math.PI * 2);
    let phase = rng.range(0, Math.PI * 2);

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

        // Ship reaction
        const distToShip = group.position.distanceTo(shipPos);
        let reactSpeed = species.baseSpeed;

        if (distToShip < 40 && shipThrottle > 0.3) {
          // Thruster wash scares timid/small creatures
          if (species.temperament === 'timid' || species.category === 'GROUND') {
            const awayDir = new THREE.Vector2(group.position.x - shipPos.x, group.position.z - shipPos.z).normalize();
            headingAngle = Math.atan2(awayDir.y, awayDir.x);
            reactSpeed *= 1.8;
          }
        }

        if (species.category === 'AERIAL') {
          // 3D aerial flight: circle/soar
          headingAngle += dt * 0.25;
          group.position.x += Math.cos(headingAngle) * reactSpeed * dt;
          group.position.z += Math.sin(headingAngle) * reactSpeed * dt;
          const terrainY = getHeightAt(group.position.x, group.position.z);
          group.position.y = terrainY + species.heightMeters * 3.5 + Math.sin(phase) * 1.5;

          // Banking into turn
          group.rotation.y = -headingAngle + Math.PI / 2;
          group.rotation.z = Math.sin(headingAngle) * 0.25;
        } else {
          // Ground locomotion with terrain sampling
          group.position.x += Math.cos(headingAngle) * reactSpeed * dt;
          group.position.z += Math.sin(headingAngle) * reactSpeed * dt;

          const curY = getHeightAt(group.position.x, group.position.z);
          // Ground alignment
          group.position.y = curY;
          group.rotation.y = -headingAngle - Math.PI / 2;

          // Boundary wander reversal
          if (group.position.distanceTo(spawnPos) > 55) {
            headingAngle += Math.PI * 0.75;
          }
        }
      },
    };
  }

  private buildGiant(
    npc: NPCIdentity,
    spawnPos: THREE.Vector3
  ): ActiveCreature {
    const group = new THREE.Group();
    const h = (this.sentientProfile?.averageHeightMeters || 18) * 1.2;

    const giantMat = new THREE.MeshStandardMaterial({
      color: 0x334155, // Basaltic monolithic slate
      roughness: 0.8,
      metalness: 0.2,
      flatShading: true,
    });

    const lumMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8, // Luminous celestial cyan
    });

    // Tall slender alien silhouette
    // Torso / robe
    const robeGeo = new THREE.ConeGeometry(h * 0.22, h * 0.65, 7);
    const robe = new THREE.Mesh(robeGeo, giantMat);
    robe.position.y = h * 0.35;
    group.add(robe);

    // Upper Torso
    const upperGeo = new THREE.BoxGeometry(h * 0.28, h * 0.35, h * 0.18);
    const upper = new THREE.Mesh(upperGeo, giantMat);
    upper.position.y = h * 0.72;
    group.add(upper);

    // Stately Alien Head / Crest
    const headGeo = new THREE.CylinderGeometry(h * 0.08, h * 0.14, h * 0.22, 5);
    const head = new THREE.Mesh(headGeo, giantMat);
    head.position.y = h * 0.95;
    group.add(head);

    // Luminous Acoustic Crest
    const crestGeo = new THREE.TorusGeometry(h * 0.16, h * 0.02, 4, 16);
    const crest = new THREE.Mesh(crestGeo, lumMat);
    crest.position.set(0, h * 1.05, 0);
    crest.rotation.x = Math.PI / 4;
    group.add(crest);

    // Walking limbs
    const legGeo = new THREE.CylinderGeometry(h * 0.06, h * 0.08, h * 0.45, 5);
    const leftLeg = new THREE.Mesh(legGeo, giantMat);
    leftLeg.position.set(-h * 0.12, h * 0.22, 0);
    const rightLeg = new THREE.Mesh(legGeo, giantMat);
    rightLeg.position.set(h * 0.12, h * 0.22, 0);
    group.add(leftLeg);
    group.add(rightLeg);

    group.position.copy(spawnPos);

    const scanInfo: CreatureScanInfo = {
      name: npc.name,
      species: this.sentientProfile?.name || 'Sentient Giant',
      category: 'SENTIENT',
      behaviour: 'Observing the vessel in peaceful stillness.',
      diet: 'Acoustic / Mineral sifting',
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
      baseSpeed: 1.2,
      temperament: 'venerable',
      diet: 'Acoustic harmonics',
      behaviour: 'sentient_gaze',
      rarity: 1.0,
      heightMeters: h,
      description: `Individual representative of ${this.sentientProfile?.name}.`,
    };

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
        // The Giant gently tracks the player's craft with its torso/head
        const dirToShip = new THREE.Vector3().subVectors(shipPos, group.position);
        const targetAngle = Math.atan2(dirToShip.x, dirToShip.z);

        // Smooth rotation towards ship
        group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, targetAngle, dt * 2.0);

        // Ground anchor
        const curY = getHeightAt(group.position.x, group.position.z);
        group.position.y = curY;
      },
    };
  }
}
