import * as THREE from 'three';
import { SeededRandom } from '../universe/SeededRandom';
import type { LandingRegionProfile, FaunaArchetype } from '../planets/LandingRegionProfile';

export interface CreatureScanInfo {
  name: string;
  species: string;
  behaviour: string;
  diet: string;
  temperament: string;
  adaptation: string;
}

export interface ActiveCreature {
  group: THREE.Group;
  archetype: FaunaArchetype;
  basePos: THREE.Vector3;
  velocity: THREE.Vector3;
  behaviour: 'wander' | 'graze' | 'hover' | 'circle';
  moveSpeed: number;
  phase: number;
  scanInfo: CreatureScanInfo;
  update: (dt: number, getHeightAt: (x: number, z: number) => number) => void;
}

export class FaunaGenerator {
  public static createFauna(
    region: LandingRegionProfile,
    centerPos: THREE.Vector3,
    getHeightAt: (x: number, z: number) => number
  ): ActiveCreature[] {
    if (region.faunaDensity <= 0.05 || region.faunaArchetypes.length === 0) {
      return [];
    }

    const rng = new SeededRandom(region.regionSeed + 777);
    const count = Math.min(6, Math.max(1, Math.floor(region.faunaDensity * 5)));
    const creatures: ActiveCreature[] = [];

    for (let i = 0; i < count; i++) {
      const arch = rng.pick(region.faunaArchetypes);
      const angle = (i / count) * Math.PI * 2 + rng.range(-0.4, 0.4);
      const dist = rng.range(25, 75);
      const wx = centerPos.x + Math.cos(angle) * dist;
      const wz = centerPos.z + Math.sin(angle) * dist;
      const wy = getHeightAt(wx, wz);

      const creature = this.buildCreature(arch, region, rng, new THREE.Vector3(wx, wy, wz));
      creatures.push(creature);
    }

    return creatures;
  }

  private static buildCreature(
    archetype: FaunaArchetype,
    region: LandingRegionProfile,
    rng: SeededRandom,
    spawnPos: THREE.Vector3
  ): ActiveCreature {
    const group = new THREE.Group();
    const baseColor = new THREE.Color(region.localSurfacePalette.accent).offsetHSL(rng.range(-0.1, 0.1), 0.2, 0.1);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.6,
      flatShading: true,
    });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9 });

    let behaviour: ActiveCreature['behaviour'] = 'wander';
    let moveSpeed = rng.range(2.5, 6.0);
    const scale = rng.range(0.8, 1.5);

    // Geometry construction per body-plan archetype
    switch (archetype) {
      case 'quadruped': {
        // Body
        const torso = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 3.2), bodyMat);
        torso.position.y = 1.6;
        group.add(torso);

        // Head
        const head = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.4, 5), bodyMat);
        head.position.set(0, 2.2, -1.8);
        head.rotation.x = -Math.PI / 2;
        group.add(head);

        // 4 Legs
        const legGeo = new THREE.CylinderGeometry(0.2, 0.2, 1.6, 4);
        for (const [lx, lz] of [[-0.9, -1.1], [0.9, -1.1], [-0.9, 1.1], [0.9, 1.1]]) {
          const leg = new THREE.Mesh(legGeo, bodyMat);
          leg.position.set(lx, 0.8, lz);
          group.add(leg);
        }
        behaviour = rng.pick(['graze', 'wander']);
        break;
      }

      case 'tripod': {
        // Spherical shell with 3 tall spindly legs
        const shell = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4, 0), bodyMat);
        shell.position.y = 3.6;
        group.add(shell);

        const legGeo = new THREE.CylinderGeometry(0.12, 0.15, 3.6, 3);
        for (let a = 0; a < 3; a++) {
          const legAng = (a * Math.PI * 2) / 3;
          const leg = new THREE.Mesh(legGeo, bodyMat);
          leg.position.set(Math.cos(legAng) * 1.2, 1.8, Math.sin(legAng) * 1.2);
          leg.rotation.z = Math.cos(legAng) * 0.25;
          leg.rotation.x = Math.sin(legAng) * 0.25;
          group.add(leg);
        }
        behaviour = 'wander';
        moveSpeed = rng.range(3.5, 7.0);
        break;
      }

      case 'jelly': {
        // Floating luminescent bell
        const bell = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.65), bodyMat);
        bell.position.y = 7.0;
        bell.rotation.x = Math.PI;
        group.add(bell);

        // Tentacles
        const tentGeo = new THREE.CylinderGeometry(0.06, 0.08, 3.2, 3);
        for (let t = 0; t < 5; t++) {
          const tAng = (t * Math.PI * 2) / 5;
          const tent = new THREE.Mesh(tentGeo, bodyMat);
          tent.position.set(Math.cos(tAng) * 0.9, 5.0, Math.sin(tAng) * 0.9);
          group.add(tent);
        }
        behaviour = 'hover';
        moveSpeed = rng.range(1.8, 3.2);
        break;
      }

      case 'ray': {
        // Wide aerodynamic glider
        const rayBody = new THREE.Mesh(new THREE.ConeGeometry(2.8, 4.2, 4), bodyMat);
        rayBody.position.y = 8.5;
        rayBody.rotation.x = Math.PI / 2;
        rayBody.scale.set(1.4, 0.35, 1.0);
        group.add(rayBody);
        behaviour = 'circle';
        moveSpeed = rng.range(6.0, 11.0);
        break;
      }

      case 'hopping': {
        // Round body with agile coiled legs
        const pod = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), bodyMat);
        pod.position.y = 1.4;
        group.add(pod);

        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 4, 4), eyeMat);
        eye.position.set(0, 1.7, -0.9);
        group.add(eye);
        behaviour = 'wander';
        moveSpeed = rng.range(3.0, 5.5);
        break;
      }

      case 'sky_whale': {
        // Enormous atmospheric leviathan (20-30m) with dorsal ridge and ventral vents
        const whaleMat = bodyMat.clone();
        whaleMat.roughness = 0.4;
        const glowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

        const body = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.8, 14.0, 7), whaleMat);
        body.rotation.x = Math.PI / 2;
        body.position.y = 18.0;
        group.add(body);

        // Head dome
        const whaleHead = new THREE.Mesh(new THREE.SphereGeometry(3.6, 8, 6), whaleMat);
        whaleHead.position.set(0, 18.0, -7.0);
        whaleHead.scale.set(0.9, 0.7, 1.3);
        group.add(whaleHead);

        // Pectoral flippers
        const flipperGeo = new THREE.BoxGeometry(7.0, 0.3, 2.5);
        const flippers = new THREE.Mesh(flipperGeo, whaleMat);
        flippers.position.set(0, 17.5, -2.0);
        group.add(flippers);

        // Bioluminescent ventral vents
        for (let v = -4; v <= 4; v += 2) {
          const vent = new THREE.Mesh(new THREE.SphereGeometry(0.4, 5, 5), glowMat);
          vent.position.set(0, 14.8, v);
          group.add(vent);
        }
        behaviour = 'hover';
        moveSpeed = rng.range(2.0, 4.2);
        break;
      }

      case 'titan_strider': {
        // Towering 6-legged colossus with elevated crest
        const carapace = new THREE.Mesh(new THREE.DodecahedronGeometry(2.4, 0), bodyMat);
        carapace.position.y = 7.5;
        group.add(carapace);

        const crestGeo = new THREE.ConeGeometry(0.8, 4.0, 4);
        const crest = new THREE.Mesh(crestGeo, new THREE.MeshBasicMaterial({ color: 0x34d399 }));
        crest.position.set(0, 10.0, -1.0);
        crest.rotation.x = -0.3;
        group.add(crest);

        const legGeo = new THREE.CylinderGeometry(0.18, 0.25, 7.5, 4);
        for (let l = 0; l < 6; l++) {
          const side = l % 2 === 0 ? 1 : -1;
          const zOffset = (Math.floor(l / 2) - 1) * 2.2;
          const leg = new THREE.Mesh(legGeo, bodyMat);
          leg.position.set(side * 2.4, 3.8, zOffset);
          leg.rotation.z = side * 0.2;
          group.add(leg);
        }
        behaviour = 'wander';
        moveSpeed = rng.range(3.0, 5.5);
        break;
      }

      case 'spore_medusa': {
        // Translucent floating bell with glowing trailing tendrils
        const bellMat = new THREE.MeshStandardMaterial({
          color: baseColor,
          roughness: 0.2,
          metalness: 0.1,
          transparent: true,
          opacity: 0.85,
        });
        const glowMat = new THREE.MeshBasicMaterial({ color: 0xa855f7 });

        const bell = new THREE.Mesh(new THREE.SphereGeometry(2.5, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), bellMat);
        bell.rotation.x = Math.PI;
        bell.position.y = 12.0;
        group.add(bell);

        // Core nucleus
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.8, 6, 6), glowMat);
        core.position.y = 11.2;
        group.add(core);

        // Trailing tendrils
        const tendrilGeo = new THREE.CylinderGeometry(0.05, 0.08, 6.0, 3);
        for (let t = 0; t < 8; t++) {
          const angle = (t * Math.PI * 2) / 8;
          const tendril = new THREE.Mesh(tendrilGeo, bellMat);
          tendril.position.set(Math.cos(angle) * 1.8, 8.5, Math.sin(angle) * 1.8);
          group.add(tendril);
        }
        behaviour = 'hover';
        moveSpeed = rng.range(1.6, 3.0);
        break;
      }

      case 'crystal_scuttler': {
        // Low-slung multi-legged faceted crustacean
        const prismGeo = new THREE.ConeGeometry(1.6, 2.8, 6);
        prismGeo.rotateX(Math.PI / 2);
        const shell = new THREE.Mesh(prismGeo, bodyMat);
        shell.scale.set(1.2, 0.5, 1.0);
        shell.position.y = 0.9;
        group.add(shell);

        const gemGeo = new THREE.OctahedronGeometry(0.4, 0);
        const gemMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
        for (let g = -1; g <= 1; g += 2) {
          const gem = new THREE.Mesh(gemGeo, gemMat);
          gem.position.set(g * 0.8, 1.2, 0);
          group.add(gem);
        }

        const legGeo = new THREE.CylinderGeometry(0.08, 0.12, 1.2, 3);
        for (let l = 0; l < 6; l++) {
          const side = l % 2 === 0 ? 1 : -1;
          const zOffset = (Math.floor(l / 2) - 1) * 0.9;
          const leg = new THREE.Mesh(legGeo, bodyMat);
          leg.position.set(side * 1.1, 0.45, zOffset);
          leg.rotation.z = side * 0.45;
          group.add(leg);
        }
        behaviour = 'wander';
        moveSpeed = rng.range(4.0, 7.2);
        break;
      }

      case 'dune_serpent': {
        // Multi-segmented undulating desert serpent
        const segCount = 7;
        const segGeo = new THREE.SphereGeometry(0.9, 6, 5);
        for (let s = 0; s < segCount; s++) {
          const seg = new THREE.Mesh(segGeo, bodyMat);
          const taper = 1.0 - (s / segCount) * 0.5;
          seg.scale.set(taper, taper * 0.7, taper);
          seg.position.set(0, 0.7, (s - 3) * 1.3);
          group.add(seg);
        }
        // Serpent crest
        const crest = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 4), eyeMat);
        crest.position.set(0, 1.5, -4.0);
        crest.rotation.x = -0.6;
        group.add(crest);

        behaviour = 'wander';
        moveSpeed = rng.range(4.5, 8.0);
        break;
      }

      case 'avian_flock': {
        // Group of swift soaring flyers
        const flyerMat = bodyMat.clone();
        for (let f = 0; f < 4; f++) {
          const fGroup = new THREE.Group();
          const fWing = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.2, 3), flyerMat);
          fWing.rotation.x = Math.PI / 2;
          fWing.scale.set(1.4, 0.15, 0.7);
          fGroup.add(fWing);

          const fBeak = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.8, 3), eyeMat);
          fBeak.position.set(0, 0, -1.4);
          fBeak.rotation.x = -Math.PI / 2;
          fGroup.add(fBeak);

          const fAng = (f * Math.PI * 2) / 4;
          fGroup.position.set(Math.cos(fAng) * 4.0, 14.0 + (f % 2) * 2.0, Math.sin(fAng) * 4.0);
          group.add(fGroup);
        }
        behaviour = 'circle';
        moveSpeed = rng.range(8.5, 14.0);
        break;
      }

      case 'biped_stalker': {
        // Fast bipedal predatory runner with counterbalanced tail
        const torso = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 2.2), bodyMat);
        torso.position.y = 2.4;
        group.add(torso);

        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.4, 4), bodyMat);
        neck.position.set(0, 3.2, -1.0);
        neck.rotation.x = 0.4;
        group.add(neck);

        const head = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.4, 4), bodyMat);
        head.position.set(0, 3.8, -1.8);
        head.rotation.x = -Math.PI / 2;
        group.add(head);

        const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.4, 3.0, 4), bodyMat);
        tail.position.set(0, 2.2, 1.8);
        tail.rotation.x = -0.5;
        group.add(tail);

        const legGeo = new THREE.CylinderGeometry(0.18, 0.14, 2.4, 4);
        for (const side of [-1, 1]) {
          const leg = new THREE.Mesh(legGeo, bodyMat);
          leg.position.set(side * 0.8, 1.2, 0.1);
          leg.rotation.x = 0.2;
          group.add(leg);
        }
        behaviour = 'wander';
        moveSpeed = rng.range(5.0, 9.0);
        break;
      }

      case 'crawler':
      default: {
        // Multi-segmented low ground crawler
        const segGeo = new THREE.BoxGeometry(1.2, 0.6, 0.8);
        for (let s = -2; s <= 2; s++) {
          const seg = new THREE.Mesh(segGeo, bodyMat);
          seg.position.set(0, 0.6, s * 0.9);
          group.add(seg);
        }
        behaviour = 'graze';
        moveSpeed = rng.range(1.5, 3.0);
        break;
      }
    }

    group.scale.set(scale, scale, scale);
    group.position.copy(spawnPos);

    const scanInfo = this.generateScanInfo(archetype, region, rng);
    let phase = rng.next() * Math.PI * 2;
    let headingAngle = rng.next() * Math.PI * 2;

    const activeCreature: ActiveCreature = {
      group,
      archetype,
      basePos: spawnPos.clone(),
      velocity: new THREE.Vector3(0, 0, 0),
      behaviour,
      moveSpeed,
      phase,
      scanInfo,
      update: (dt: number, getHeightAt: (x: number, z: number) => number) => {
        phase += dt * (archetype === 'jelly' || archetype === 'spore_medusa' ? 1.8 : 3.0);

        if (behaviour === 'circle') {
          headingAngle += dt * (archetype === 'avian_flock' ? 0.5 : 0.35);
          const circleRadius = archetype === 'avian_flock' ? 55 : 35;
          const targetX = spawnPos.x + Math.cos(headingAngle) * circleRadius;
          const targetZ = spawnPos.z + Math.sin(headingAngle) * circleRadius;
          const baseAlt = archetype === 'avian_flock' ? 22 : 12;
          const curY = getHeightAt(group.position.x, group.position.z) + baseAlt + Math.sin(phase) * 2.0;
          group.position.set(targetX, curY, targetZ);
          group.rotation.y = -headingAngle + Math.PI / 2;
        } else if (behaviour === 'hover') {
          group.position.x += Math.cos(headingAngle) * moveSpeed * dt;
          group.position.z += Math.sin(headingAngle) * moveSpeed * dt;
          const hoverAlt = archetype === 'sky_whale' ? 24 : (archetype === 'spore_medusa' ? 14 : 7);
          const curY = getHeightAt(group.position.x, group.position.z) + hoverAlt + Math.sin(phase) * 1.5;
          group.position.y = curY;
          if (group.position.distanceTo(spawnPos) > (archetype === 'sky_whale' ? 80 : 45)) {
            headingAngle += Math.PI * 0.8;
          }
        } else {
          // Ground walking / grazing / hopping / slithering
          group.position.x += Math.cos(headingAngle) * moveSpeed * dt;
          group.position.z += Math.sin(headingAngle) * moveSpeed * dt;
          const curY = getHeightAt(group.position.x, group.position.z);
          const hop = archetype === 'hopping' ? Math.max(0, Math.sin(phase) * 1.6) : Math.sin(phase) * 0.15;
          group.position.y = curY + hop;
          group.rotation.y = -headingAngle - Math.PI / 2;

          if (archetype === 'dune_serpent') {
            // Sinuous spine wave rotation
            group.rotation.y += Math.sin(phase * 2.5) * 0.25;
          }

          if (group.position.distanceTo(spawnPos) > 45) {
            headingAngle += Math.PI * 0.75 + (rng.next() - 0.5);
          }
        }
      },
    };

    return activeCreature;
  }

  private static generateScanInfo(
    archetype: FaunaArchetype,
    region: LandingRegionProfile,
    rng: SeededRandom
  ): CreatureScanInfo {
    const titles: Record<FaunaArchetype, string[]> = {
      quadruped: ['Steppe Strider', 'Plains Grazer', 'Titan Tusk', 'Dunewalker'],
      tripod: ['Spire Walker', 'Tri-Stilt Stalker', 'Pinnacle Skimmer', 'Needle Strider'],
      jelly: ['Atmospheric Drifter', 'Ether Medusa', 'Thermal Floater', 'Aura Siphon'],
      hopping: ['Spring Biped', 'Saltation Pod', 'Basalt Hopper', 'Quartz Hopper'],
      ray: ['Aerial Manta', 'Atmospheric Ray', 'Thermal Soarer', 'Zephyr Glider'],
      crawler: ['Segmented Scuttler', 'Lithic Carver', 'Basalt Grub', 'Silicate Myriapod'],
      sky_whale: ['Atmospheric Leviathan', 'Vapour Whale', 'Celestial Aerostat', 'Nimbus Monarch'],
      titan_strider: ['Apex Hexapod Colossus', 'Obsidian Strider', 'Lithic Canopy Walker', 'Plateau Titan'],
      spore_medusa: ['Luminescent Spore Medusa', 'Phosphor Bell', 'Ion Siphon', 'Aetheric Cnidarian'],
      crystal_scuttler: ['Prismatic Scuttler', 'Quartz Mantis', 'Faceted Carapace', 'Silicate Skimmer'],
      dune_serpent: ['Sub-Sand Dune Serpent', 'Regolith Wyrm', 'Lithic Glider', 'Basalt Ouroboros'],
      avian_flock: ['Thermal Dart Flock', 'Vapour Swifts', 'Aero-Falcons', 'Prism Skimmers'],
      biped_stalker: ['Savannah Raptor', 'Canyon Strider', 'Swift Crested Runner', 'Basalt Stalker'],
    };

    const diets = [
      'Bioluminescent moss & fungal spore heads',
      'Airborne spore particulates & atmospheric moisture',
      'Silica-rich mineral accretions',
      'Hydrocarbon vapor condensates',
      'Endolithic bacterial filaments',
      'Ambient electrostatic energy & stellar flux',
    ];

    const temperaments = [
      'Placid & unaware of craft',
      'Cautious, maintaining safe distance',
      'Inquisitive towards vessel thruster harmonics',
      'Docile aerial herbivore',
      'Passive territorial sentinel',
      'Majestic sovereign drifter',
    ];

    const adaptations = [
      'Cryo-insulative epidermal scales',
      'Silicate-hardened carapace against scouring storms',
      'Gas bladder regulating electrostatic buoyancy',
      'Resonant acoustic echolocation organs',
      'Bioluminescent signaling chromatophores',
      'Thermal mantle absorbing stellar radiation',
    ];

    const titlesForArch = titles[archetype] || titles.crawler;
    const name = `${region.name} ${rng.pick(titlesForArch)}`;

    return {
      name,
      species: `${region.id.toUpperCase()}-${rng.rangeInt(100, 999)}`,
      behaviour: `Passive ${archetype} organism observed in ${region.biomeName}.`,
      diet: rng.pick(diets),
      temperament: rng.pick(temperaments),
      adaptation: rng.pick(adaptations),
    };
  }
}
