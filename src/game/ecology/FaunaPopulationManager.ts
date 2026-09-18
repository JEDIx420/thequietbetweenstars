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
  public sentientProfile: SentientSpeciesProfile | null;
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

    // Initialize guaranteed Sentient Encounter Sites for Land, Water, and Air Giants
    this.initEncounterSites();
  }

  private initEncounterSites(): void {
    const rng = new SeededRandom(this.region.regionSeed + 777);

    const siteConfigs = [
      {
        type: 'land' as const,
        siteName: 'Lithic Sanctuary of the Deep Mantle',
        angle: 0.5 + rng.range(-0.2, 0.2),
        dist: rng.range(210, 260),
        beaconColor: 0x38bdf8,
        defaultName: `${this.region.name} Lithic Colossus`,
        defaultTitle: 'Elder Guardian of the Deep Strata',
        personality: 'solemn' as const,
        greeting: 'I feel the tremor of your small vessel against the bedrock. The stone remembers every dawn since this world cooled. Speak, quiet voyager.',
        loreKey: 'lithic_core_resonance',
        loreTitle: 'Echoes of the Deep Mantle',
        loreText: 'The lithic colossus reveals that the planetary core pulses in ultra-low frequency harmonic waves, shielding delicate surface biospheres from cosmic solar winds.',
      },
      {
        type: 'water' as const,
        siteName: 'Abyssal Basin of the Primordial Depths',
        angle: 2.6 + rng.range(-0.2, 0.2),
        dist: rng.range(270, 340),
        beaconColor: 0x06b6d4,
        defaultName: `${this.region.name} Ocean Leviathan`,
        defaultTitle: 'Sovereign of the Primordial Depths',
        personality: 'gentle' as const,
        greeting: 'The tides carry the harmonic wake of your engines down into the deep trenches. We welcome those who glide peacefully above the water.',
        loreKey: 'abyssal_currents',
        loreTitle: 'Songs of the Submerged Trenches',
        loreText: 'The ocean leviathan explains that the world’s primordial waters conduct celestial radio emissions directly into submarine crystal beds, giving rise to living light.',
      },
      {
        type: 'air' as const,
        siteName: 'Stratospheric Sky Spire of the Zephyri',
        angle: 4.7 + rng.range(-0.2, 0.2),
        dist: rng.range(230, 290),
        beaconColor: 0xa855f7,
        defaultName: `${this.region.name} Stratospheric Sky Sovereign`,
        defaultTitle: 'Wanderer of the High Ionosphere',
        personality: 'observant' as const,
        greeting: 'Your small wings carve ribbons through our cloud decks. From the upper stratosphere, the stars look close enough to touch. What brings you to our sky?',
        loreKey: 'aurora_ribbons',
        loreTitle: 'Pathways of the High Auroras',
        loreText: 'The sky sovereign recounts navigating the global magnetic ley-lines for millennia, watching wandering asteroids brush the upper atmosphere like glowing filaments.',
      },
    ];

    for (let i = 0; i < siteConfigs.length; i++) {
      const cfg = siteConfigs[i];
      let npc: NPCIdentity;

      if (this.notableNPCs && this.notableNPCs[i]) {
        npc = {
          ...this.notableNPCs[i],
          title: cfg.defaultTitle,
          greeting: this.notableNPCs[i].greeting || cfg.greeting,
          loreFactTitle: this.notableNPCs[i].loreFactTitle || cfg.loreTitle,
          loreFactText: this.notableNPCs[i].loreFactText || cfg.loreText,
        };
      } else {
        npc = {
          npcId: `giant_${cfg.type}_${this.region.id}`,
          speciesId: `species_${cfg.type}_giant`,
          name: cfg.defaultName,
          title: cfg.defaultTitle,
          ageStage: 'elder',
          personality: cfg.personality,
          currentConcern: `Maintaining the planetary ${cfg.type} equilibrium and observing interstellar travellers.`,
          knowledgeTopics: [cfg.loreTitle, 'Planetary Harmony', 'The 1420 kHz Harmonic'],
          greeting: cfg.greeting,
          loreFactKey: cfg.loreKey,
          loreFactTitle: cfg.loreTitle,
          loreFactText: cfg.loreText,
        };
      }

      const sx = Math.cos(cfg.angle) * cfg.dist;
      const sz = Math.sin(cfg.angle) * cfg.dist;
      const initialPos = new THREE.Vector3(sx, 15, sz);

      const landmarkGroup = new THREE.Group();

      // Distinct architecture per giant domain
      const spireMat = new THREE.MeshStandardMaterial({
        color: cfg.type === 'water' ? 0x0f172a : (cfg.type === 'air' ? 0x2e1065 : 0x1e293b),
        roughness: 0.9,
        metalness: 0.2,
        flatShading: true,
      });

      const spireCount = cfg.type === 'water' ? 4 : (cfg.type === 'air' ? 3 : 6);
      for (let s = 0; s < spireCount; s++) {
        const sAngle = (s / spireCount) * Math.PI * 2;
        const sDist = cfg.type === 'air' ? 22.0 : 16.0;
        const sHeight = 14.0 + (s % 3) * 5.0;
        const spireGeo = new THREE.CylinderGeometry(0.8, 2.4, sHeight, 5);
        const spire = new THREE.Mesh(spireGeo, spireMat);
        spire.position.set(Math.cos(sAngle) * sDist, sHeight * 0.5, Math.sin(sAngle) * sDist);
        spire.rotation.y = sAngle;
        spire.rotation.z = 0.08 * (s % 2 === 0 ? 1 : -1);
        landmarkGroup.add(spire);
      }

      // Central Acoustic Resonance Beacon Tower
      const beaconMat = new THREE.MeshStandardMaterial({
        color: cfg.beaconColor,
        emissive: cfg.beaconColor,
        emissiveIntensity: 0.9,
        roughness: 0.2,
        metalness: 0.8,
      });
      const beaconGeo = cfg.type === 'air'
        ? new THREE.OctahedronGeometry(3.0, 0)
        : (cfg.type === 'water' ? new THREE.DodecahedronGeometry(2.4, 0) : new THREE.OctahedronGeometry(2.2, 0));
      const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
      beaconMesh.position.set(0, 18, 0);
      landmarkGroup.add(beaconMesh);

      const beaconLight = new THREE.PointLight(cfg.beaconColor, 4.0, 75);
      beaconLight.position.set(0, 19, 0);
      landmarkGroup.add(beaconLight);

      landmarkGroup.position.copy(initialPos);
      this.encounterSitesGroup.add(landmarkGroup);

      // Giant creature of this domain
      const giantCreature = this.buildGiant(npc, initialPos, cfg.type);
      this.encounterSitesGroup.add(giantCreature.group);

      this.encounterSites.push({
        id: `site_encounter_${cfg.type}_${npc.npcId}`,
        name: cfg.siteName,
        type: `${cfg.type.toUpperCase()}_GIANT_SANCTUARY`,
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
    this.clock += dt;

    // Anchor encounter sites on first frame when terrain heights are known
    if (!this.sitesInitializedHeight) {
      for (const site of this.encounterSites) {
        const groundY = getHeightAt(site.position.x, site.position.z);
        site.position.y = groundY;
        site.landmarkGroup.position.y = groundY;
        if (site.type.includes('AIR')) {
          site.giantCreature.group.position.y = groundY + 55;
          site.giantCreature.basePos.y = groundY + 55;
        } else {
          site.giantCreature.group.position.y = groundY;
          site.giantCreature.basePos.y = groundY;
        }
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

  public get activeCount(): number {
    return this.getActiveCreatures().length;
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
    spawnPos: THREE.Vector3,
    domain: 'land' | 'water' | 'air' = 'land'
  ): ActiveCreature {
    if (domain === 'water') {
      return this.buildWaterGiant(npc, spawnPos);
    } else if (domain === 'air') {
      return this.buildAirGiant(npc, spawnPos);
    }
    return this.buildLandGiant(npc, spawnPos);
  }

  private buildLandGiant(
    npc: NPCIdentity,
    spawnPos: THREE.Vector3
  ): ActiveCreature {
    const group = new THREE.Group();
    const h = 28.0; // Towering 28m colossus

    const giantMat = new THREE.MeshStandardMaterial({
      color: 0x334155, // Basaltic monolithic slate
      roughness: 0.85,
      metalness: 0.25,
      flatShading: true,
    });

    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.85,
    });

    // Articulated alien giant body
    // Lower robe / pedestal
    const robeGeo = new THREE.ConeGeometry(h * 0.26, h * 0.65, 8);
    const robe = new THREE.Mesh(robeGeo, giantMat);
    robe.position.y = h * 0.35;
    group.add(robe);

    // Articulated upper torso
    const upperGeo = new THREE.BoxGeometry(h * 0.34, h * 0.38, h * 0.24);
    const upper = new THREE.Mesh(upperGeo, giantMat);
    upper.position.y = h * 0.72;
    group.add(upper);

    // Crystalline shoulder spires
    for (const side of [-1, 1]) {
      const spire = new THREE.Mesh(new THREE.ConeGeometry(h * 0.08, h * 0.35, 5), crystalMat);
      spire.position.set(side * h * 0.22, h * 0.88, 0);
      spire.rotation.z = -side * 0.35;
      group.add(spire);
    }

    // Stately alien head node (for smooth look-at tracking)
    const headPivot = new THREE.Group();
    headPivot.position.y = h * 0.94;

    const headGeo = new THREE.CylinderGeometry(h * 0.09, h * 0.16, h * 0.25, 6);
    const head = new THREE.Mesh(headGeo, giantMat);
    headPivot.add(head);

    // Luminous Acoustic Crest / Halo
    const crestGeo = new THREE.TorusGeometry(h * 0.2, h * 0.03, 6, 24);
    const crest = new THREE.Mesh(crestGeo, crystalMat);
    crest.position.set(0, h * 0.15, 0);
    crest.rotation.x = Math.PI / 4;
    headPivot.add(crest);

    group.add(headPivot);

    // Standing limbs
    const legGeo = new THREE.CylinderGeometry(h * 0.08, h * 0.1, h * 0.45, 5);
    const leftLeg = new THREE.Mesh(legGeo, giantMat);
    leftLeg.position.set(-h * 0.14, h * 0.22, 0);
    const rightLeg = new THREE.Mesh(legGeo, giantMat);
    rightLeg.position.set(h * 0.14, h * 0.22, 0);
    group.add(leftLeg);
    group.add(rightLeg);

    group.position.copy(spawnPos);

    const scanInfo: CreatureScanInfo = {
      name: npc.name,
      species: 'Lithic Terrestrial Titan',
      category: 'SENTIENT',
      behaviour: 'Standing in monumental contemplation of bedrock tremors.',
      diet: 'Deep mantle mineral resonance',
      temperament: 'Venerable & ancient guardian',
      adaptation: 'Crystalline piezoelectric crust withstands cosmic radiation',
      isSentient: true,
      npcData: npc,
    };

    const dummySpecies: EcologicalSpecies = {
      id: `giant_land_${npc.npcId}`,
      name: npc.name,
      category: 'SENTIENT',
      bodyPlan: 'sentient_giant',
      scale: 1.0,
      baseSpeed: 1.0,
      temperament: 'venerable',
      diet: 'Mineral resonance',
      behaviour: 'sentient_gaze',
      rarity: 1.0,
      heightMeters: h,
      description: `Monolithic lithic titan of ${this.region.name}.`,
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
        if (distToShip < 140.0) {
          scratchGiantDir.subVectors(shipPos, group.position);
          const targetAngle = Math.atan2(scratchGiantDir.x, scratchGiantDir.z);
          group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, targetAngle, dt * 2.5);

          // Tilt head slightly toward ship elevation
          const yDiff = shipPos.y - headPivot.position.y;
          const pitchTarget = THREE.MathUtils.clamp(Math.atan2(yDiff, distToShip), -0.35, 0.45);
          headPivot.rotation.x = THREE.MathUtils.lerp(headPivot.rotation.x, pitchTarget, dt * 3.0);
        }

        // Ground anchoring
        const curY = getHeightAt(group.position.x, group.position.z);
        group.position.y = curY;
      },
    };
  }

  private buildWaterGiant(
    npc: NPCIdentity,
    spawnPos: THREE.Vector3
  ): ActiveCreature {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0f283d, // Deep abyssal navy
      roughness: 0.45,
      metalness: 0.35,
      flatShading: true,
    });

    const biolumMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x22d3ee,
      emissiveIntensity: 0.85,
      roughness: 0.2,
      metalness: 0.8,
    });

    // Articulated multi-segment serpentine spine
    const segments: THREE.Mesh[] = [];
    const segCount = 6;
    for (let i = 0; i < segCount; i++) {
      const taper = 1.0 - (i / segCount) * 0.65;
      const segGeo = new THREE.CylinderGeometry(2.4 * taper, 3.2 * taper, 7.0, 6);
      segGeo.rotateX(Math.PI / 2);
      const segMesh = new THREE.Mesh(segGeo, bodyMat);
      segMesh.position.set(0, 0, (i - segCount * 0.4) * 6.5);
      group.add(segMesh);
      segments.push(segMesh);

      // Dorsal glowing spine
      const finGeo = new THREE.ConeGeometry(0.8 * taper, 3.0 * taper, 4);
      const fin = new THREE.Mesh(finGeo, biolumMat);
      fin.position.set(0, 3.0 * taper, (i - segCount * 0.4) * 6.5);
      group.add(fin);
    }

    // Wide swimming pectoral fins on leading segment
    for (const side of [-1, 1]) {
      const finGeo = new THREE.BoxGeometry(11.0, 0.4, 4.5);
      const fin = new THREE.Mesh(finGeo, biolumMat);
      fin.position.set(side * 6.5, 0, -8.0);
      fin.rotation.z = side * 0.2;
      group.add(fin);
    }

    // Head node
    const head = new THREE.Mesh(new THREE.DodecahedronGeometry(3.6, 0), bodyMat);
    head.position.set(0, 1.0, -15.0);
    group.add(head);

    // Glowing acoustic crown
    const crown = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.4, 6, 16), biolumMat);
    crown.position.set(0, 3.2, -15.0);
    crown.rotation.x = Math.PI / 3;
    group.add(crown);

    group.position.copy(spawnPos);

    const scanInfo: CreatureScanInfo = {
      name: npc.name,
      species: 'Abyssal Ocean Leviathan',
      category: 'SENTIENT',
      behaviour: 'Gliding along submerged currents, singing in acoustic sonar frequencies.',
      diet: 'Hydrothermal particulate and bioluminescent algae',
      temperament: 'Serene & welcoming to quiet flyers',
      adaptation: 'Hydrodynamic cartilage and deep-pressure bioluminescence',
      isSentient: true,
      npcData: npc,
    };

    const dummySpecies: EcologicalSpecies = {
      id: `giant_water_${npc.npcId}`,
      name: npc.name,
      category: 'SENTIENT',
      bodyPlan: 'sentient_giant',
      scale: 1.0,
      baseSpeed: 4.0,
      temperament: 'placid',
      diet: 'Acoustic currents',
      behaviour: 'sentient_gaze',
      rarity: 1.0,
      heightMeters: 12.0,
      description: `Primordial leviathan elder inhabiting the waters of ${this.region.name}.`,
    };

    let leviathanClock = 0;
    const swimRadius = 38.0;

    return {
      id: npc.npcId,
      group,
      species: dummySpecies,
      basePos: spawnPos.clone(),
      velocity: new THREE.Vector3(),
      headingAngle: 0,
      pitchAngle: 0,
      rollAngle: 0,
      moveSpeed: 4.0,
      phase: 0,
      scanInfo,
      isGiant: true,
      npcIdentity: npc,
      update: (dt, getHeightAt, shipPos) => {
        leviathanClock += dt * 0.45;

        // Circular swimming orbit around spawn point
        const orbitAngle = leviathanClock;
        const targetX = spawnPos.x + Math.cos(orbitAngle) * swimRadius;
        const targetZ = spawnPos.z + Math.sin(orbitAngle) * swimRadius;

        // Tangent heading angle
        const heading = orbitAngle + Math.PI / 2;
        group.position.x = THREE.MathUtils.lerp(group.position.x, targetX, dt * 3.0);
        group.position.z = THREE.MathUtils.lerp(group.position.z, targetZ, dt * 3.0);
        group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, heading, dt * 3.0);

        // Undulating body segments
        for (let i = 0; i < segments.length; i++) {
          const sway = Math.sin(leviathanClock * 4.0 - i * 0.8) * 1.2;
          segments[i].position.x = sway;
        }

        // Anchor on liquid plane / lowland surface
        const groundY = getHeightAt(group.position.x, group.position.z);
        const surfaceY = Math.max(2.5, groundY) + Math.sin(leviathanClock * 3.0) * 0.7;
        group.position.y = THREE.MathUtils.lerp(group.position.y, surfaceY, dt * 4.0);

        // If ship is nearby, turn head slightly towards vessel
        const distToShip = group.position.distanceTo(shipPos);
        if (distToShip < 130.0) {
          head.rotation.y = Math.sin(leviathanClock * 2.0) * 0.2;
        }
      },
    };
  }

  private buildAirGiant(
    npc: NPCIdentity,
    spawnPos: THREE.Vector3
  ): ActiveCreature {
    const group = new THREE.Group();
    const wingSpan = 54.0; // 54m wingspan
    const bodyLen = 36.0;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1e1b4b, // Deep indigo sky aerostat
      roughness: 0.4,
      metalness: 0.3,
      flatShading: true,
    });

    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xa855f7,
      emissive: 0xc084fc,
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.8,
    });

    // Central streamlined aerostat mantle
    const aerostatGeo = new THREE.SphereGeometry(7.0, 10, 8);
    aerostatGeo.scale(1.0, 0.45, 2.2);
    const aerostat = new THREE.Mesh(aerostatGeo, bodyMat);
    group.add(aerostat);

    // Glowing atmospheric gas bladders (ventral)
    for (let b = -2; b <= 2; b++) {
      const bladderGeo = new THREE.SphereGeometry(1.6, 6, 6);
      const bladder = new THREE.Mesh(bladderGeo, glowMat);
      bladder.position.set(0, -1.8, b * 4.5);
      group.add(bladder);
    }

    // Broad sweeping manta wings
    for (const side of [-1, 1]) {
      const wingGeo = new THREE.ConeGeometry(bodyLen * 0.45, wingSpan * 0.48, 4);
      wingGeo.rotateZ(side * Math.PI / 2);
      const wing = new THREE.Mesh(wingGeo, bodyMat);
      wing.scale.set(1.0, 0.12, 0.8);
      wing.position.set(side * (wingSpan * 0.24), 0, 0);
      group.add(wing);

      // Glowing wingtip emitters
      const tipGeo = new THREE.SphereGeometry(1.2, 5, 5);
      const tip = new THREE.Mesh(tipGeo, glowMat);
      tip.position.set(side * (wingSpan * 0.46), 0, 0);
      group.add(tip);
    }

    // Trailing sensor ribbons
    for (let r = 0; r < 4; r++) {
      const ribbonGeo = new THREE.CylinderGeometry(0.12, 0.25, 18.0, 3);
      ribbonGeo.rotateX(Math.PI / 2);
      const ribbon = new THREE.Mesh(ribbonGeo, glowMat);
      const xOff = (r - 1.5) * 3.0;
      ribbon.position.set(xOff, -1.0, 18.0);
      group.add(ribbon);
    }

    group.position.copy(spawnPos);
    group.position.y += 55; // Cruise at stratospheric altitude

    const scanInfo: CreatureScanInfo = {
      name: npc.name,
      species: 'Stratospheric Zephyr Sovereign',
      category: 'SENTIENT',
      behaviour: 'Cruising along high thermal jet streams in celestial harmony.',
      diet: 'Ionized atmospheric plasma & solar wind particles',
      temperament: 'Magnificent, tranquil & observant',
      adaptation: 'Lighter-than-air bio-hydrogen mantle and geomagnetic sensory crest',
      isSentient: true,
      npcData: npc,
    };

    const dummySpecies: EcologicalSpecies = {
      id: `giant_air_${npc.npcId}`,
      name: npc.name,
      category: 'SENTIENT',
      bodyPlan: 'sentient_giant',
      scale: 1.0,
      baseSpeed: 6.0,
      temperament: 'venerable',
      diet: 'Ionized plasma',
      behaviour: 'sentient_gaze',
      rarity: 1.0,
      heightMeters: 18.0,
      description: `Stratospheric sovereign soaring through the skies of ${this.region.name}.`,
    };

    let airClock = 0;
    const soarRadius = 80.0;

    return {
      id: npc.npcId,
      group,
      species: dummySpecies,
      basePos: spawnPos.clone(),
      velocity: new THREE.Vector3(),
      headingAngle: 0,
      pitchAngle: 0,
      rollAngle: 0,
      moveSpeed: 6.0,
      phase: 0,
      scanInfo,
      isGiant: true,
      npcIdentity: npc,
      update: (dt, getHeightAt, _shipPos) => {
        airClock += dt * 0.28;

        // Wide graceful orbit in the sky
        const angle = airClock;
        const targetX = spawnPos.x + Math.cos(angle) * soarRadius;
        const targetZ = spawnPos.z + Math.sin(angle) * soarRadius;

        const heading = angle + Math.PI / 2;
        group.position.x = THREE.MathUtils.lerp(group.position.x, targetX, dt * 2.5);
        group.position.z = THREE.MathUtils.lerp(group.position.z, targetZ, dt * 2.5);
        group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, heading, dt * 2.5);

        // Gentle banking roll proportional to turn
        group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, -0.22, dt * 2.0);

        // Keep altitude high above ground with majestic breathing swell
        const groundY = getHeightAt(group.position.x, group.position.z);
        const flightAlt = groundY + 55.0 + Math.sin(airClock * 2.5) * 6.0;
        group.position.y = THREE.MathUtils.lerp(group.position.y, flightAlt, dt * 1.5);
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
