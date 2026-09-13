import * as THREE from 'three';
import { SeededRandom } from '../universe/SeededRandom';
import type { LandingRegionProfile, VegetationArchetype } from '../planets/LandingRegionProfile';

export interface PlantSpecies {
  name: string;
  archetype: VegetationArchetype;
  color: THREE.Color;
  emissiveColor: THREE.Color;
  emissiveIntensity: number;
  height: number;
  scaleVariation: number;
}

export class FloraGenerator {
  public static createFloraInstances(
    region: LandingRegionProfile,
    chunkX: number,
    chunkZ: number,
    chunkSize: number,
    getHeightAt: (x: number, z: number) => number
  ): THREE.InstancedMesh[] {
    if (region.vegetationDensity <= 0.02 || region.vegetationArchetype === 'none') {
      return [];
    }

    const chunkSeed = SeededRandom.hashCoords(region.regionSeed, chunkX, 0, chunkZ);
    const rng = new SeededRandom(chunkSeed);

    // Determine species characteristics for this region
    const species = this.deriveSpecies(region, rng);
    const count = Math.floor(region.vegetationDensity * 65);
    if (count <= 0) return [];

    const geom = this.createPlantGeometry(species.archetype, species.height);
    const mat = new THREE.MeshStandardMaterial({
      color: species.color,
      emissive: species.emissiveColor,
      emissiveIntensity: species.emissiveIntensity,
      roughness: 0.7,
      metalness: 0.1,
      flatShading: true,
    });

    const instancedMesh = new THREE.InstancedMesh(geom, mat, count);
    const dummy = new THREE.Object3D();
    const originX = chunkX * chunkSize;
    const originZ = chunkZ * chunkSize;

    let placedCount = 0;
    for (let i = 0; i < count; i++) {
      const lx = (rng.next() - 0.5) * chunkSize;
      const lz = (rng.next() - 0.5) * chunkSize;
      const wx = originX + lx;
      const wz = originZ + lz;

      const gy = getHeightAt(wx, wz);
      // Skip deep depressions/liquids
      if (gy < 2.0) continue;

      const scale = 1.0 + (rng.next() - 0.5) * species.scaleVariation;
      dummy.position.set(wx, gy, wz);
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.set(
        (rng.next() - 0.5) * 0.15,
        rng.next() * Math.PI * 2,
        (rng.next() - 0.5) * 0.15
      );
      dummy.updateMatrix();

      instancedMesh.setMatrixAt(placedCount, dummy.matrix);
      placedCount++;
    }

    instancedMesh.count = placedCount;
    instancedMesh.instanceMatrix.needsUpdate = true;
    return [instancedMesh];
  }

  private static deriveSpecies(region: LandingRegionProfile, rng: SeededRandom): PlantSpecies {
    const arch = region.vegetationArchetype;
    const baseCol = new THREE.Color(region.localSurfacePalette.midland);

    switch (arch) {
      case 'mushrooms':
        return {
          name: `${region.name} Bioluminescent Cap`,
          archetype: arch,
          color: baseCol.clone().offsetHSL(0.1, 0.2, 0.1),
          emissiveColor: new THREE.Color(region.localSurfacePalette.accent),
          emissiveIntensity: 0.5,
          height: rng.range(3.0, 5.5),
          scaleVariation: 0.4,
        };
      case 'stalks':
        return {
          name: `${region.name} Spire Reeds`,
          archetype: arch,
          color: baseCol.clone().offsetHSL(-0.05, 0.3, 0.05),
          emissiveColor: new THREE.Color(0x000000),
          emissiveIntensity: 0.0,
          height: rng.range(4.5, 8.0),
          scaleVariation: 0.5,
        };
      case 'crystals':
        return {
          name: `${region.name} Resonant Shards`,
          archetype: arch,
          color: new THREE.Color(region.localSurfacePalette.accent),
          emissiveColor: new THREE.Color(region.localSurfacePalette.accent),
          emissiveIntensity: 0.35,
          height: rng.range(2.5, 6.0),
          scaleVariation: 0.6,
        };
      case 'shrubs':
      default:
        return {
          name: `${region.name} Scrub Bush`,
          archetype: 'shrubs',
          color: baseCol.clone().offsetHSL(0.05, -0.1, -0.1),
          emissiveColor: new THREE.Color(0x000000),
          emissiveIntensity: 0.0,
          height: rng.range(2.0, 4.0),
          scaleVariation: 0.35,
        };
    }
  }

  private static createPlantGeometry(archetype: VegetationArchetype, height: number): THREE.BufferGeometry {
    switch (archetype) {
      case 'mushrooms': {
        // Stem + Cap combo geometry
        const stem = new THREE.CylinderGeometry(0.3, 0.5, height * 0.7, 6);
        stem.translate(0, height * 0.35, 0);
        const cap = new THREE.ConeGeometry(height * 0.6, height * 0.35, 7);
        cap.translate(0, height * 0.7 + height * 0.15, 0);
        return this.mergeGeometries([stem, cap]);
      }
      case 'stalks': {
        // Tall segmented segmented cylinder
        const stalk = new THREE.CylinderGeometry(0.2, 0.4, height, 5);
        stalk.translate(0, height / 2, 0);
        return stalk;
      }
      case 'crystals': {
        // Prismatic faceted crystal spire
        const crystal = new THREE.ConeGeometry(height * 0.35, height, 5);
        crystal.translate(0, height / 2, 0);
        return crystal;
      }
      case 'shrubs':
      default: {
        // Clustered low geometric bush
        const bush = new THREE.DodecahedronGeometry(height * 0.5, 0);
        bush.translate(0, height * 0.4, 0);
        return bush;
      }
    }
  }

  private static mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
    let totalVerts = 0;
    for (const g of geos) {
      totalVerts += g.attributes.position.count;
    }

    const pos = new Float32Array(totalVerts * 3);
    const norm = new Float32Array(totalVerts * 3);
    let offset = 0;

    for (const g of geos) {
      const gPos = g.attributes.position.array;
      const gNorm = g.attributes.normal?.array;
      pos.set(gPos, offset * 3);
      if (gNorm) {
        norm.set(gNorm, offset * 3);
      }
      offset += g.attributes.position.count;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
    return merged;
  }
}
