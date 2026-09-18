import * as THREE from 'three';
import { SeededRandom } from '../universe/SeededRandom';
import type { SpaceAnomalyDescriptor } from '../systems/PlanetDescriptor';

export type SpaceEncounterType = 'asteroid_cluster' | 'derelict_probe' | 'gravitic_anomaly' | 'resonance_echo';

export interface SpaceEncounter {
  id: string;
  type: SpaceEncounterType;
  name: string;
  position: THREE.Vector3;
  group: THREE.Group;
  isScanned: boolean;
  rewardCredits: number;
  rewardSampleCategory?: 'MINERAL' | 'CRYSTALLINE' | 'RESONANCE';
  logSnippet: string;
  anomalyDescriptor?: SpaceAnomalyDescriptor;
  update: (dt: number) => void;
}

export class SpaceEncounterManager {
  public encounters: SpaceEncounter[] = [];
  public group = new THREE.Group();
  private clock = 0;

  constructor(
    systemSeed: number,
    sunPos: THREE.Vector3,
    planetPositions: THREE.Vector3[],
    systemAnomalies?: SpaceAnomalyDescriptor[]
  ) {
    this.initEncounters(systemSeed, sunPos, planetPositions, systemAnomalies);
  }

  private initEncounters(
    seed: number,
    sunPos: THREE.Vector3,
    planetPositions: THREE.Vector3[],
    systemAnomalies?: SpaceAnomalyDescriptor[]
  ): void {
    const rng = new SeededRandom(seed + 909);

    if (systemAnomalies && systemAnomalies.length > 0) {
      // Authoritative bridge: instantiate physical 3D representations for each system anomaly
      for (let i = 0; i < systemAnomalies.length; i++) {
        const anomaly = systemAnomalies[i];
        let spawnPos: THREE.Vector3;
        if (anomaly.position) {
          spawnPos = new THREE.Vector3(anomaly.position.x, anomaly.position.y, anomaly.position.z);
        } else {
          const dist = anomaly.distanceFromStar || rng.range(400, 1800);
          const angle = anomaly.angle || (i * 1.5 + rng.range(-0.3, 0.3));
          spawnPos = new THREE.Vector3(
            sunPos.x + Math.cos(angle) * dist,
            sunPos.y + rng.range(-120, 120),
            sunPos.z + Math.sin(angle) * dist
          );
        }

        let encounterType: SpaceEncounterType = 'gravitic_anomaly';
        if (anomaly.type === 'RESONANCE_ECHO' || anomaly.type === 'resonance_monolith' || anomaly.hasResonance) {
          encounterType = 'resonance_echo';
        } else if (anomaly.type === 'DERELICT_PROBE' || anomaly.type === 'derelict_probe') {
          encounterType = 'derelict_probe';
        } else if (anomaly.type === 'dense_asteroid_cluster') {
          encounterType = 'asteroid_cluster';
        }

        const encounter = this.buildEncounter(encounterType, spawnPos, rng, i, anomaly);
        this.encounters.push(encounter);
        this.group.add(encounter.group);
      }

      // Supplementary asteroid belts for mining gameplay
      for (let j = 0; j < 2; j++) {
        const refPos = planetPositions.length > 0 ? rng.pick(planetPositions) : sunPos;
        const dist = rng.range(300, 700);
        const ang = rng.next() * Math.PI * 2;
        const pos = new THREE.Vector3(
          refPos.x + Math.cos(ang) * dist,
          refPos.y + rng.range(-80, 80),
          refPos.z + Math.sin(ang) * dist
        );
        const belt = this.buildEncounter('asteroid_cluster', pos, rng, 100 + j);
        this.encounters.push(belt);
        this.group.add(belt.group);
      }
      return;
    }

    // Default fallback procedural encounters
    const encounterCount = 3 + rng.rangeInt(1, 3); // 4 to 6 cosmic points of interest

    for (let i = 0; i < encounterCount; i++) {
      const type: SpaceEncounterType = i === 0
        ? 'asteroid_cluster'
        : (i === 1 ? 'derelict_probe' : (i === 2 ? 'gravitic_anomaly' : rng.pick(['asteroid_cluster', 'derelict_probe'])));

      const refPos = planetPositions.length > 0 ? rng.pick(planetPositions) : sunPos;
      const angle = (i / encounterCount) * Math.PI * 2 + rng.range(-0.4, 0.4);
      const dist = rng.range(280, 850);
      const spawnPos = new THREE.Vector3(
        refPos.x + Math.cos(angle) * dist,
        refPos.y + rng.range(-150, 150),
        refPos.z + Math.sin(angle) * dist
      );

      const encounter = this.buildEncounter(type, spawnPos, rng, i);
      this.encounters.push(encounter);
      this.group.add(encounter.group);
    }
  }

  private buildEncounter(
    type: SpaceEncounterType,
    spawnPos: THREE.Vector3,
    rng: SeededRandom,
    index: number,
    anomalyDesc?: SpaceAnomalyDescriptor
  ): SpaceEncounter {
    const group = new THREE.Group();
    let name = anomalyDesc?.name || '';
    let rewardCredits = 50;
    let rewardSampleCategory: SpaceEncounter['rewardSampleCategory'] = 'MINERAL';
    let logSnippet = anomalyDesc?.description || '';

    switch (type) {
      case 'resonance_echo': {
        if (!name) name = `RESONANCE MONOLITH [HARMONIC-${index + 1}]`;
        rewardCredits = 250;
        rewardSampleCategory = 'RESONANCE';
        if (!logSnippet) logSnippet = 'Majestic crystalline monolith vibrating with ancient harmonic resonance.';

        // Monolith central obelisk
        const crystalMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x0284c7,
          emissiveIntensity: 0.6,
          roughness: 0.1,
          metalness: 0.8,
          flatShading: true,
        });
        const obelisk = new THREE.Mesh(new THREE.OctahedronGeometry(6.0, 0), crystalMat);
        obelisk.scale.set(1.0, 2.5, 1.0);
        group.add(obelisk);

        // Orbiting harmonic shard rings
        const shardMat = new THREE.MeshBasicMaterial({ color: 0xc084fc, wireframe: true });
        const ringTorus = new THREE.Mesh(new THREE.TorusGeometry(14, 0.25, 4, 24), shardMat);
        ringTorus.rotation.x = Math.PI / 4;
        group.add(ringTorus);

        for (let s = 0; s < 4; s++) {
          const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(1.5, 0), crystalMat);
          const ang = (s / 4) * Math.PI * 2;
          shard.position.set(Math.cos(ang) * 12, Math.sin(ang) * 4, Math.sin(ang) * 12);
          group.add(shard);
        }

        const glow = new THREE.PointLight(0x38bdf8, 5.0, 90);
        group.add(glow);
        break;
      }

      case 'asteroid_cluster': {
        if (!name) name = `MINERAL ASTEROID VEIN [BELT-${rng.rangeInt(10, 99)}]`;
        rewardCredits = 75;
        rewardSampleCategory = 'MINERAL';
        if (!logSnippet) logSnippet = 'Dense iron-nickel and silica asteroid cluster with rich surface fractures.';

        const astMat = new THREE.MeshStandardMaterial({
          color: 0x475569,
          roughness: 0.9,
          metalness: 0.2,
          flatShading: true,
        });
        const oreMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

        const numRocks = rng.rangeInt(8, 14);
        for (let r = 0; r < numRocks; r++) {
          const rSize = rng.range(2.5, 9.0);
          const rGeo = new THREE.DodecahedronGeometry(rSize, 0);
          const rock = new THREE.Mesh(rGeo, astMat);
          const rDist = rng.range(4, 38);
          const rAng = rng.next() * Math.PI * 2;
          const rElev = rng.range(-12, 12);
          rock.position.set(Math.cos(rAng) * rDist, rElev, Math.sin(rAng) * rDist);
          rock.rotation.set(rng.next() * Math.PI, rng.next() * Math.PI, 0);
          group.add(rock);

          if (rSize > 5.5) {
            const vein = new THREE.Mesh(new THREE.OctahedronGeometry(rSize * 0.35, 0), oreMat);
            vein.position.copy(rock.position).add(new THREE.Vector3(0, rSize * 0.4, 0));
            group.add(vein);
          }
        }
        break;
      }

      case 'derelict_probe': {
        if (!name) name = `ANCIENT RECON PROBE [PIONEER-X${index}]`;
        rewardCredits = 120;
        rewardSampleCategory = 'CRYSTALLINE';
        if (!logSnippet) logSnippet = 'Pre-collapse autonomous survey probe transmitting lingering telemetry on loop.';

        const probeMat = new THREE.MeshStandardMaterial({
          color: 0x64748b,
          roughness: 0.5,
          metalness: 0.7,
          flatShading: true,
        });
        const goldMat = new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          roughness: 0.3,
          metalness: 0.9,
        });

        const core = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 4.0, 6), probeMat);
        group.add(core);

        const dish = new THREE.Mesh(new THREE.ConeGeometry(2.8, 1.2, 8), goldMat);
        dish.position.set(0, 2.5, 0);
        group.add(dish);

        const panelGeo = new THREE.BoxGeometry(8.0, 0.1, 1.8);
        const panels = new THREE.Mesh(panelGeo, probeMat);
        panels.position.set(0, 0, 0);
        group.add(panels);

        const beacon = new THREE.PointLight(0xf59e0b, 2.5, 45);
        beacon.position.set(0, 3.2, 0);
        group.add(beacon);
        break;
      }

      case 'gravitic_anomaly':
      default: {
        if (!name) name = `GRAVITIC HARMONIC ANOMALY [OMEGA-${index + 1}]`;
        rewardCredits = 180;
        rewardSampleCategory = 'RESONANCE';
        if (!logSnippet) logSnippet = 'Localized subspace stress curvature emitting resonant prime interval frequencies.';

        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xa855f7,
          wireframe: true,
          transparent: true,
          opacity: 0.75,
        });
        const ring1 = new THREE.Mesh(new THREE.TorusGeometry(8, 0.4, 6, 24), ringMat);
        group.add(ring1);

        const ring2 = new THREE.Mesh(new THREE.TorusGeometry(5, 0.3, 6, 18), ringMat);
        ring2.rotation.x = Math.PI / 3;
        group.add(ring2);

        const coreMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
        const singCore = new THREE.Mesh(new THREE.SphereGeometry(1.8, 12, 12), coreMat);
        group.add(singCore);

        const glow = new THREE.PointLight(0xa855f7, 4.0, 75);
        group.add(glow);
        break;
      }
    }

    group.position.copy(spawnPos);

    return {
      id: anomalyDesc?.id || `encounter_${type}_${index}`,
      type,
      name,
      position: spawnPos.clone(),
      group,
      isScanned: anomalyDesc?.scanned || false,
      rewardCredits,
      rewardSampleCategory,
      logSnippet,
      anomalyDescriptor: anomalyDesc,
      update: (dt: number) => {
        group.rotation.y += dt * (type === 'asteroid_cluster' ? 0.08 : (type === 'resonance_echo' ? 0.3 : 0.25));
        if (type === 'gravitic_anomaly' || type === 'resonance_echo') {
          group.rotation.x += dt * 0.15;
          group.rotation.z += dt * 0.1;
        }
      },
    };
  }

  public onRebase(offset: THREE.Vector3): void {
    for (const enc of this.encounters) {
      enc.position.add(offset);
      enc.group.position.add(offset);
    }
  }

  public update(dt: number): void {
    this.clock += dt;
    for (const enc of this.encounters) {
      enc.update(dt);
    }
  }

  public getNearbyEncounter(shipPos: THREE.Vector3, range = 110): SpaceEncounter | null {
    for (const enc of this.encounters) {
      const d = enc.position.distanceTo(shipPos);
      if (d <= range) {
        return enc;
      }
    }
    return null;
  }

  public dispose(): void {
    for (const enc of this.encounters) {
      enc.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material?.dispose();
          }
        } else if (obj instanceof THREE.PointLight) {
          obj.dispose();
        }
      });
      this.group.remove(enc.group);
    }
    this.encounters = [];
  }
}
