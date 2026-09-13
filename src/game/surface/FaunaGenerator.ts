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
        phase += dt * (archetype === 'jelly' ? 1.8 : 3.0);

        if (behaviour === 'circle') {
          headingAngle += dt * 0.35;
          const targetX = spawnPos.x + Math.cos(headingAngle) * 35;
          const targetZ = spawnPos.z + Math.sin(headingAngle) * 35;
          const curY = getHeightAt(group.position.x, group.position.z) + 12 + Math.sin(phase) * 1.5;
          group.position.set(targetX, curY, targetZ);
          group.rotation.y = -headingAngle + Math.PI / 2;
        } else if (behaviour === 'hover') {
          group.position.x += Math.cos(headingAngle) * moveSpeed * dt;
          group.position.z += Math.sin(headingAngle) * moveSpeed * dt;
          const curY = getHeightAt(group.position.x, group.position.z) + 7 + Math.sin(phase) * 1.2;
          group.position.y = curY;
          if (group.position.distanceTo(spawnPos) > 45) {
            headingAngle += Math.PI * 0.8;
          }
        } else {
          // Ground walking / grazing / hopping
          group.position.x += Math.cos(headingAngle) * moveSpeed * dt;
          group.position.z += Math.sin(headingAngle) * moveSpeed * dt;
          const curY = getHeightAt(group.position.x, group.position.z);
          const hop = archetype === 'hopping' ? Math.max(0, Math.sin(phase) * 1.6) : Math.sin(phase) * 0.15;
          group.position.y = curY + hop;
          group.rotation.y = -headingAngle - Math.PI / 2;

          if (group.position.distanceTo(spawnPos) > 40) {
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
    };

    const diets = [
      'Bioluminescent moss & fungal spore heads',
      'Airborne spore particulates & atmospheric moisture',
      'Silica-rich mineral accretions',
      'Hydrocarbon vapor condensates',
      'Endolithic bacterial filaments',
    ];

    const temperaments = [
      'Placid & unaware of craft',
      'Cautious, maintaining safe distance',
      'Inquisitive towards vessel thruster harmonics',
      'Docile aerial herbivore',
      'Passive territorial sentinel',
    ];

    const adaptations = [
      'Cryo-insulative epidermal scales',
      'Silicate-hardened carapace against scouring storms',
      'Gas bladder regulating electrostatic buoyancy',
      'Resonant acoustic echolocation organs',
      'Bioluminescent signaling chromatophores',
    ];

    const name = `${region.name} ${rng.pick(titles[archetype])}`;

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
