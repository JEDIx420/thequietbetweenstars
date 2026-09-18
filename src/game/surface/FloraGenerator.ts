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

    const meshes: THREE.InstancedMesh[] = [];

    // 1. Primary Canopy / Main Flora
    const species = this.deriveSpecies(region, rng);
    const count = Math.floor(region.vegetationDensity * 65);
    if (count > 0) {
      const primaryMesh = this.buildInstancedFlora(species, count, chunkX, chunkZ, chunkSize, getHeightAt, rng);
      if (primaryMesh) meshes.push(primaryMesh);
    }

    // 2. Secondary Understory Flora for rich ecological density
    if (region.vegetationDensity > 0.12) {
      const understoryArchetype = this.pickSecondaryArchetype(region.vegetationArchetype, rng);
      const understorySpecies = this.deriveSpeciesForArchetype(understoryArchetype, region, rng);
      const understoryCount = Math.floor(region.vegetationDensity * 45);
      if (understoryCount > 0) {
        const secondaryMesh = this.buildInstancedFlora(understorySpecies, understoryCount, chunkX, chunkZ, chunkSize, getHeightAt, rng, 0.6);
        if (secondaryMesh) meshes.push(secondaryMesh);
      }
    }

    return meshes;
  }

  private static pickSecondaryArchetype(primary: VegetationArchetype, rng: SeededRandom): VegetationArchetype {
    const options: VegetationArchetype[] = [
      'bioluminescent_tendril',
      'crystalline_lotus',
      'spiral_fern',
      'floating_spore_orb',
      'mycelial_colossus_cap',
      'plasma_tendril_flower',
      'crystal_spire_bloom',
      'spiral_spore_stalk',
      'ancient_jungle_canopy',
      'mushrooms',
      'shrubs',
      'grass',
      'crystals',
    ];
    const filtered = options.filter((o) => o !== primary);
    return rng.pick(filtered);
  }

  private static buildInstancedFlora(
    species: PlantSpecies,
    count: number,
    chunkX: number,
    chunkZ: number,
    chunkSize: number,
    getHeightAt: (x: number, z: number) => number,
    rng: SeededRandom,
    scaleMultiplier = 1.0
  ): THREE.InstancedMesh | null {
    const geom = this.createPlantGeometry(species.archetype, species.height * scaleMultiplier);
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

      const scale = (1.0 + (rng.next() - 0.5) * species.scaleVariation) * scaleMultiplier;
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

    if (placedCount === 0) {
      geom.dispose();
      mat.dispose();
      return null;
    }

    instancedMesh.count = placedCount;
    instancedMesh.instanceMatrix.needsUpdate = true;
    return instancedMesh;
  }

  private static deriveSpecies(region: LandingRegionProfile, rng: SeededRandom): PlantSpecies {
    return this.deriveSpeciesForArchetype(region.vegetationArchetype, region, rng);
  }

  private static deriveSpeciesForArchetype(arch: VegetationArchetype, region: LandingRegionProfile, rng: SeededRandom): PlantSpecies {
    const baseCol = new THREE.Color(region.localSurfacePalette.midland);

    switch (arch) {
      case 'mycelial_colossus_cap':
        return {
          name: `${region.name} Colossal Spore Cap`,
          archetype: arch,
          color: new THREE.Color(region.localSurfacePalette.peak),
          emissiveColor: new THREE.Color(region.localSurfacePalette.accent),
          emissiveIntensity: 0.75,
          height: rng.range(16.0, 28.0),
          scaleVariation: 0.5,
        };
      case 'plasma_tendril_flower':
        return {
          name: `${region.name} Ionized Calyx`,
          archetype: arch,
          color: new THREE.Color(region.localSurfacePalette.highland),
          emissiveColor: new THREE.Color(region.localSurfacePalette.accent),
          emissiveIntensity: 0.9,
          height: rng.range(4.0, 7.5),
          scaleVariation: 0.4,
        };
      case 'crystal_spire_bloom':
        return {
          name: `${region.name} Crystalline Spire Bloom`,
          archetype: arch,
          color: new THREE.Color(region.localSurfacePalette.accent).offsetHSL(0.05, 0.2, 0.1),
          emissiveColor: new THREE.Color(region.localSurfacePalette.accent),
          emissiveIntensity: 0.8,
          height: rng.range(5.0, 10.0),
          scaleVariation: 0.45,
        };
      case 'spiral_spore_stalk':
        return {
          name: `${region.name} Corkscrew Spore Stalk`,
          archetype: arch,
          color: baseCol.clone().offsetHSL(-0.1, 0.3, 0.05),
          emissiveColor: new THREE.Color(region.localSurfacePalette.accent),
          emissiveIntensity: 0.65,
          height: rng.range(6.0, 12.0),
          scaleVariation: 0.45,
        };
      case 'ancient_jungle_canopy':
        return {
          name: `${region.name} Primordial Canopy Tree`,
          archetype: arch,
          color: baseCol.clone().offsetHSL(0.02, 0.25, -0.08),
          emissiveColor: new THREE.Color(region.localSurfacePalette.accent),
          emissiveIntensity: 0.3,
          height: rng.range(18.0, 32.0),
          scaleVariation: 0.55,
        };
      case 'bioluminescent_tendril':
        return {
          name: `${region.name} Bioluminescent Tendril`,
          archetype: arch,
          color: new THREE.Color(region.localSurfacePalette.accent).offsetHSL(0.05, 0.1, -0.1),
          emissiveColor: new THREE.Color(region.localSurfacePalette.accent),
          emissiveIntensity: 0.85,
          height: rng.range(4.5, 8.5),
          scaleVariation: 0.45,
        };
      case 'crystalline_lotus':
        return {
          name: `${region.name} Crystalline Lotus`,
          archetype: arch,
          color: new THREE.Color(region.localSurfacePalette.accent).offsetHSL(-0.05, 0.2, 0.1),
          emissiveColor: new THREE.Color(region.localSurfacePalette.accent),
          emissiveIntensity: 0.7,
          height: rng.range(2.5, 5.0),
          scaleVariation: 0.4,
        };
      case 'giant_kelp_spire':
        return {
          name: `${region.name} Giant Kelp Spire`,
          archetype: arch,
          color: baseCol.clone().offsetHSL(-0.15, 0.35, -0.05),
          emissiveColor: new THREE.Color(region.localSurfacePalette.accent),
          emissiveIntensity: 0.35,
          height: rng.range(14.0, 24.0),
          scaleVariation: 0.5,
        };
      case 'spiral_fern':
        return {
          name: `${region.name} Spiral Fern`,
          archetype: arch,
          color: baseCol.clone().offsetHSL(0.08, 0.25, 0.05),
          emissiveColor: new THREE.Color(region.localSurfacePalette.accent),
          emissiveIntensity: 0.4,
          height: rng.range(3.0, 6.0),
          scaleVariation: 0.4,
        };
      case 'floating_spore_orb':
        return {
          name: `${region.name} Floating Spore Orb`,
          archetype: arch,
          color: new THREE.Color(region.localSurfacePalette.accent).offsetHSL(0.12, 0.2, -0.05),
          emissiveColor: new THREE.Color(region.localSurfacePalette.accent),
          emissiveIntensity: 0.8,
          height: rng.range(4.0, 7.5),
          scaleVariation: 0.5,
        };
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
      case 'mycelial_colossus_cap': {
        // Enormous tiered mushroom with wide parasol cap
        const trunk = new THREE.CylinderGeometry(height * 0.08, height * 0.16, height * 0.75, 7);
        trunk.translate(0, height * 0.37, 0);
        const cap = new THREE.ConeGeometry(height * 0.55, height * 0.22, 10);
        cap.translate(0, height * 0.85, 0);
        const underCap = new THREE.CylinderGeometry(height * 0.45, height * 0.08, height * 0.08, 8);
        underCap.translate(0, height * 0.76, 0);
        return this.mergeGeometries([trunk, cap, underCap]);
      }
      case 'plasma_tendril_flower': {
        // Radial ionized calyx with glowing central spire
        const stem = new THREE.CylinderGeometry(height * 0.03, height * 0.07, height * 0.7, 4);
        stem.translate(0, height * 0.35, 0);
        const calyx = new THREE.ConeGeometry(height * 0.3, height * 0.35, 6);
        calyx.rotateX(Math.PI);
        calyx.translate(0, height * 0.75, 0);
        const stamen = new THREE.OctahedronGeometry(height * 0.15, 0);
        stamen.translate(0, height * 0.85, 0);
        return this.mergeGeometries([stem, calyx, stamen]);
      }
      case 'crystal_spire_bloom': {
        // Cluster of hexagonal quartz needles
        const needles: THREE.BufferGeometry[] = [];
        for (let i = 0; i < 4; i++) {
          const needle = new THREE.ConeGeometry(height * 0.12, height * (0.6 + i * 0.12), 5);
          const nAngle = (i * Math.PI * 2) / 4;
          needle.rotateZ(0.2);
          needle.rotateY(nAngle);
          needle.translate(Math.sin(nAngle) * height * 0.12, height * 0.4, Math.cos(nAngle) * height * 0.12);
          needles.push(needle);
        }
        return this.mergeGeometries(needles);
      }
      case 'spiral_spore_stalk': {
        // Ascending corkscrew spore nodules
        const coreStalk = new THREE.CylinderGeometry(height * 0.04, height * 0.08, height * 0.9, 4);
        coreStalk.translate(0, height * 0.45, 0);
        const nodes: THREE.BufferGeometry[] = [coreStalk];
        for (let n = 0; n < 5; n++) {
          const nodule = new THREE.DodecahedronGeometry(height * 0.1, 0);
          const nAngle = n * 1.3;
          nodule.translate(Math.cos(nAngle) * height * 0.15, height * (0.25 + n * 0.14), Math.sin(nAngle) * height * 0.15);
          nodes.push(nodule);
        }
        return this.mergeGeometries(nodes);
      }
      case 'ancient_jungle_canopy': {
        // Huge jungle canopy with massive spreading buttress and umbrella crowns
        const trunk = new THREE.CylinderGeometry(height * 0.08, height * 0.22, height * 0.7, 6);
        trunk.translate(0, height * 0.35, 0);
        const crown1 = new THREE.ConeGeometry(height * 0.6, height * 0.2, 8);
        crown1.translate(0, height * 0.78, 0);
        const crown2 = new THREE.ConeGeometry(height * 0.4, height * 0.16, 7);
        crown2.translate(0, height * 0.92, 0);
        return this.mergeGeometries([trunk, crown1, crown2]);
      }
      case 'bioluminescent_tendril': {
        // Sinuous curving tendril with luminous apical bulb
        const stem = new THREE.CylinderGeometry(height * 0.03, height * 0.09, height * 0.85, 5);
        stem.translate(0, height * 0.42, 0);
        const bulb = new THREE.SphereGeometry(height * 0.14, 6, 6);
        bulb.translate(0, height * 0.88, 0);
        return this.mergeGeometries([stem, bulb]);
      }
      case 'crystalline_lotus': {
        // Geometric radiating crystal petals around central core
        const core = new THREE.OctahedronGeometry(height * 0.28, 0);
        core.translate(0, height * 0.35, 0);

        const petals: THREE.BufferGeometry[] = [core];
        for (let p = 0; p < 5; p++) {
          const petal = new THREE.ConeGeometry(height * 0.14, height * 0.4, 4);
          const pAngle = (p * Math.PI * 2) / 5;
          petal.rotateZ(0.6);
          petal.rotateY(pAngle);
          petal.translate(Math.sin(pAngle) * height * 0.22, height * 0.28, Math.cos(pAngle) * height * 0.22);
          petals.push(petal);
        }
        return this.mergeGeometries(petals);
      }
      case 'giant_kelp_spire': {
        // Massive spiraling stipe with wide flotation blades
        const stipe = new THREE.CylinderGeometry(height * 0.04, height * 0.08, height, 5);
        stipe.translate(0, height * 0.5, 0);

        const blades: THREE.BufferGeometry[] = [stipe];
        for (let b = 0; b < 4; b++) {
          const blade = new THREE.BoxGeometry(height * 0.35, height * 0.02, height * 0.12);
          const bAngle = b * 1.5;
          blade.rotateY(bAngle);
          blade.translate(0, height * (0.3 + b * 0.18), 0);
          blades.push(blade);
        }
        return this.mergeGeometries(blades);
      }
      case 'spiral_fern': {
        // Tiered spiral frond
        const stem = new THREE.CylinderGeometry(height * 0.04, height * 0.07, height * 0.5, 4);
        stem.translate(0, height * 0.25, 0);
        const frond1 = new THREE.BoxGeometry(height * 0.6, height * 0.03, height * 0.2);
        frond1.translate(0, height * 0.45, 0);
        frond1.rotateY(0.4);
        const frond2 = new THREE.BoxGeometry(height * 0.45, height * 0.03, height * 0.16);
        frond2.translate(0, height * 0.65, 0);
        frond2.rotateY(1.2);
        return this.mergeGeometries([stem, frond1, frond2]);
      }
      case 'floating_spore_orb': {
        // Tethered floating bio-gas spore pod
        const tether = new THREE.CylinderGeometry(height * 0.02, height * 0.03, height * 0.6, 4);
        tether.translate(0, height * 0.3, 0);
        const pod = new THREE.DodecahedronGeometry(height * 0.3, 0);
        pod.translate(0, height * 0.75, 0);
        const satellite = new THREE.DodecahedronGeometry(height * 0.12, 0);
        satellite.translate(height * 0.25, height * 0.82, 0);
        return this.mergeGeometries([tether, pod, satellite]);
      }
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
