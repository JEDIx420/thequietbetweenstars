import * as THREE from 'three';
import { SeededRandom } from '../universe/SeededRandom';
import type { LandmarkFamily, PaletteProfile } from '../planets/PlanetEnvironmentProfile';

export interface GeneratedLandmark {
  mesh: THREE.Group;
  name: string;
  info: string;
  isAnomalous: boolean;
}

export class LandmarkGenerator {
  public static createLandmark(
    family: LandmarkFamily,
    palette: PaletteProfile,
    rng: SeededRandom,
    biomeName: string
  ): GeneratedLandmark {
    const group = new THREE.Group();
    let name = '';
    let info = '';
    let isAnomalous = false;

    switch (family) {
      case 'stone_arches': {
        // Desert / Wind-carved stone arch
        name = `${biomeName} Wind Arch`;
        info = 'Eolian sandstone natural bridge. Sculpted by millennia of planetary sandstorms.';
        const archGeo = new THREE.TorusGeometry(rng.range(12, 20), rng.range(2.5, 4.5), 8, 20, Math.PI);
        const archMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(palette.surfaceHighland),
          roughness: 0.9,
          metalness: 0.1,
          flatShading: true,
        });
        const archMesh = new THREE.Mesh(archGeo, archMat);
        archMesh.rotation.z = Math.PI;
        archMesh.rotation.y = rng.range(0, Math.PI);
        group.add(archMesh);
        break;
      }

      case 'basalt_columns': {
        // Clustered hexagonal volcanic basalt pillars
        name = `${biomeName} Basalt Column Formation`;
        info = 'Hexagonal columnar jointing formed during rapid cooling of flood basalts.';
        const colCount = rng.rangeInt(5, 9);
        const colMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(palette.surfaceLowland),
          roughness: 0.85,
          metalness: 0.25,
          emissive: new THREE.Color(palette.accentMineral),
          emissiveIntensity: 0.35,
          flatShading: true,
        });

        for (let i = 0; i < colCount; i++) {
          const h = rng.range(10, 26);
          const colGeo = new THREE.CylinderGeometry(rng.range(1.8, 3.2), rng.range(2.0, 3.5), h, 6);
          const colMesh = new THREE.Mesh(colGeo, colMat);
          colMesh.position.set(
            (rng.next() - 0.5) * 12,
            h / 2,
            (rng.next() - 0.5) * 12
          );
          group.add(colMesh);
        }
        break;
      }

      case 'crystalline_clusters': {
        // Multi-faceted quartz / amethyst crystal cluster
        name = `${biomeName} Resonant Crystal Cluster`;
        info = 'Hexagonal dielectric prism cluster. Exhibits high-frequency electromagnetic piezoelectric resonance.';
        isAnomalous = true;
        const crystalCount = rng.rangeInt(4, 7);
        const crysMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(palette.surfaceHighland),
          roughness: 0.15,
          metalness: 0.45,
          emissive: new THREE.Color(palette.accentMineral),
          emissiveIntensity: 0.55,
          flatShading: true,
        });

        for (let i = 0; i < crystalCount; i++) {
          const h = rng.range(14, 28);
          const crysGeo = new THREE.ConeGeometry(rng.range(2.2, 4.0), h, 6);
          const crysMesh = new THREE.Mesh(crysGeo, crysMat);
          crysMesh.position.set((rng.next() - 0.5) * 8, h / 2, (rng.next() - 0.5) * 8);
          crysMesh.rotation.set((rng.next() - 0.5) * 0.4, rng.range(0, Math.PI), (rng.next() - 0.5) * 0.4);
          group.add(crysMesh);
        }
        break;
      }

      case 'ice_shards': {
        // Cryogenic tetrahedral ice needles
        name = `${biomeName} Cryo-Glacial Needle`;
        info = 'Translucent methane-ice crystalline shard projecting through permafrost shelf.';
        const h = rng.range(16, 32);
        const shardGeo = new THREE.TetrahedronGeometry(rng.range(4, 7), 0);
        shardGeo.scale(1, 3.5, 1);
        const shardMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(palette.surfacePeak),
          roughness: 0.1,
          metalness: 0.1,
          emissive: new THREE.Color(palette.accentMineral),
          emissiveIntensity: 0.25,
          transparent: true,
          opacity: 0.85,
        });
        const shardMesh = new THREE.Mesh(shardGeo, shardMat);
        shardMesh.position.y = h / 2;
        shardMesh.rotation.set((rng.next() - 0.5) * 0.3, rng.range(0, Math.PI), (rng.next() - 0.5) * 0.3);
        group.add(shardMesh);
        break;
      }

      case 'alien_flora': {
        // Stylized bulbous bio-luminescent flora
        name = `${biomeName} Archaean Spore Canopy`;
        info = 'Massive carbon-silicon photosynthetic fungal spire discharging airborne pollen spores.';
        isAnomalous = false;
        // Trunk
        const trunkH = rng.range(14, 22);
        const trunkGeo = new THREE.CylinderGeometry(1.2, 2.5, trunkH, 7);
        const trunkMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(palette.surfaceLowland),
          roughness: 0.8,
        });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = trunkH / 2;
        group.add(trunk);

        // Bulb / Cap
        const capGeo = new THREE.DodecahedronGeometry(rng.range(5, 9), 1);
        const capMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(palette.surfaceHighland),
          emissive: new THREE.Color(palette.accentMineral),
          emissiveIntensity: 0.4,
          roughness: 0.4,
        });
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.y = trunkH;
        group.add(cap);
        break;
      }

      case 'ejecta_boulders':
      default: {
        // Airless crater ejecta monolith
        name = `${biomeName} Meteoric Impact Monolith`;
        info = 'Dense nickel-iron meteorite fragment embedded into lunar regolith.';
        const h = rng.range(8, 18);
        const boulderGeo = new THREE.DodecahedronGeometry(rng.range(3.5, 6.5), 1);
        boulderGeo.scale(1.2, 1.6, 0.9);
        const boulderMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(palette.surfaceHighland),
          roughness: 0.9,
          metalness: 0.3,
          flatShading: true,
        });
        const boulderMesh = new THREE.Mesh(boulderGeo, boulderMat);
        boulderMesh.position.y = h / 2;
        boulderMesh.rotation.set(rng.next(), rng.next(), rng.next());
        group.add(boulderMesh);
        break;
      }
    }

    return { mesh: group, name, info, isAnomalous };
  }
}
