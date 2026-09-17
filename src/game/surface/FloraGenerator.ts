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
      case 'spore_tree':
        return {
          name: `${region.name} Spore Arbor`,
          archetype: arch,
          color: baseCol.clone().offsetHSL(0.05, 0.2, -0.05),
          emissiveColor: new THREE.Color(region.localSurfacePalette.accent),
          emissiveIntensity: 0.6,
          height: rng.range(10.0, 18.0),
          scaleVariation: 0.5,
        };
      case 'fans':
        return {
          name: `${region.name} Radial Fan Frond`,
          archetype: arch,
          color: baseCol.clone().offsetHSL(-0.1, 0.25, 0.1),
          emissiveColor: new THREE.Color(region.localSurfacePalette.accent),
          emissiveIntensity: 0.35,
          height: rng.range(3.5, 6.5),
          scaleVariation: 0.4,
        };
      case 'bulbous':
        return {
          name: `${region.name} Succulent Bulb Clustoid`,
          archetype: arch,
          color: baseCol.clone().offsetHSL(0.15, -0.1, 0.1),
          emissiveColor: new THREE.Color(region.localSurfacePalette.accent),
          emissiveIntensity: 0.45,
          height: rng.range(2.8, 5.2),
          scaleVariation: 0.45,
        };
      case 'grass':
        return {
          name: `${region.name} Lithic Sedge`,
          archetype: arch,
          color: baseCol.clone().offsetHSL(0.0, 0.15, 0.0),
          emissiveColor: new THREE.Color(0x000000),
          emissiveIntensity: 0.0,
          height: rng.range(1.5, 3.2),
          scaleVariation: 0.3,
        };
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
      case 'spore_tree': {
        // Massive tall trunk + tiered umbrella spore canopies
        const trunk = new THREE.CylinderGeometry(height * 0.06, height * 0.12, height * 0.8, 6);
        trunk.translate(0, height * 0.4, 0);

        const cap1 = new THREE.ConeGeometry(height * 0.35, height * 0.2, 7);
        cap1.translate(0, height * 0.75, 0);

        const cap2 = new THREE.ConeGeometry(height * 0.22, height * 0.15, 6);
        cap2.translate(0, height * 0.9, 0);

        return this.mergeGeometries([trunk, cap1, cap2]);
      }
      case 'fans': {
        // Radial layered fronds
        const stem = new THREE.CylinderGeometry(0.15, 0.25, height * 0.5, 4);
        stem.translate(0, height * 0.25, 0);

        const frond1 = new THREE.BoxGeometry(height * 0.7, 0.1, height * 0.25);
        frond1.translate(0, height * 0.55, 0);

        const frond2 = new THREE.BoxGeometry(height * 0.25, 0.1, height * 0.7);
        frond2.translate(0, height * 0.65, 0);

        return this.mergeGeometries([stem, frond1, frond2]);
      }
      case 'bulbous': {
        // Clustered bulb nodes
        const stalk = new THREE.CylinderGeometry(0.2, 0.35, height * 0.6, 5);
        stalk.translate(0, height * 0.3, 0);

        const bulbMain = new THREE.DodecahedronGeometry(height * 0.3, 0);
        bulbMain.translate(0, height * 0.7, 0);

        const bulbSide = new THREE.DodecahedronGeometry(height * 0.18, 0);
        bulbSide.translate(height * 0.2, height * 0.55, 0);

        return this.mergeGeometries([stalk, bulbMain, bulbSide]);
      }
      case 'grass': {
        // Multi-blade sedge tuft
        const blade1 = new THREE.ConeGeometry(height * 0.15, height, 3);
        blade1.translate(-height * 0.1, height * 0.5, 0);

        const blade2 = new THREE.ConeGeometry(height * 0.12, height * 0.85, 3);
        blade2.translate(height * 0.1, height * 0.42, 0);

        return this.mergeGeometries([blade1, blade2]);
      }
      case 'mushrooms': {
        // Stem + Cap combo geometry
        const stem = new THREE.CylinderGeometry(0.3, 0.5, height * 0.7, 6);
        stem.translate(0, height * 0.35, 0);
        const cap = new THREE.ConeGeometry(height * 0.6, height * 0.35, 7);
        cap.translate(0, height * 0.7 + height * 0.15, 0);
        return this.mergeGeometries([stem, cap]);
      }
      case 'stalks': {
        // Tall segmented cylinder
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
