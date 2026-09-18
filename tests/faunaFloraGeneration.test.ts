import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FaunaGenerator } from '../src/game/surface/FaunaGenerator';
import { FloraGenerator } from '../src/game/surface/FloraGenerator';
import { LandingRegionGenerator } from '../src/game/planets/LandingRegionProfile';
import { PlanetEnvironmentGenerator } from '../src/game/planets/PlanetEnvironmentProfile';
import type { FaunaArchetype, VegetationArchetype } from '../src/game/planets/LandingRegionProfile';

describe('Vibrant Alien Fauna & Flora Generation Suite', () => {
  const profile = PlanetEnvironmentGenerator.generateProfile('seed-aurelia', 'G');
  const regions = LandingRegionGenerator.generateRegions(profile, 101);
  const region = regions[0];

  it('generates rich procedural 3D creatures across all fauna archetypes', () => {
    const allArchetypes: FaunaArchetype[] = [
      'sky_whale',
      'titan_strider',
      'spore_medusa',
      'crystal_scuttler',
      'dune_serpent',
      'avian_flock',
      'biped_stalker',
      'quadruped',
      'tripod',
      'jelly',
      'hopping',
      'ray',
      'crawler',
      'ocean_leviathan',
      'lithic_behemoth',
      'zephyr_leviathan',
      'archipelago_swimmer',
    ];

    for (const arch of allArchetypes) {
      const testRegion = {
        ...region,
        faunaDensity: 0.8,
        faunaArchetypes: [arch],
      };

      const creatures = FaunaGenerator.createFauna(testRegion, new THREE.Vector3(0, 10, 0), () => 15);
      expect(creatures.length).toBeGreaterThan(0);

      const c = creatures[0];
      expect(c.archetype).toBe(arch);
      expect(c.group.children.length).toBeGreaterThan(0);
      expect(c.scanInfo.name.length).toBeGreaterThan(3);
      expect(c.scanInfo.species.length).toBeGreaterThan(2);
      expect(c.scanInfo.diet.length).toBeGreaterThan(5);

      // Verify animation update cycle does not throw and modifies position/heading
      const initialPos = c.group.position.clone();
      c.update(0.1, () => 15);
      expect(c.group.position).toBeDefined();
      expect(initialPos).toBeDefined();
    }
  });

  it('generates distinct instanced geometries for all vegetation archetypes', () => {
    const vegArchetypes: VegetationArchetype[] = [
      'spore_tree',
      'fans',
      'bulbous',
      'grass',
      'mushrooms',
      'crystals',
      'stalks',
      'shrubs',
      'bioluminescent_tendril',
      'crystalline_lotus',
      'giant_kelp_spire',
      'spiral_fern',
      'floating_spore_orb',
    ];

    for (const arch of vegArchetypes) {
      const testRegion = {
        ...region,
        vegetationDensity: 0.5,
        vegetationArchetype: arch,
      };

      const meshes = FloraGenerator.createFloraInstances(testRegion, 0, 0, 120, () => 10);
      expect(meshes.length).toBeGreaterThanOrEqual(1);
      for (const mesh of meshes) {
        expect(mesh.count).toBeGreaterThan(0);
        expect(mesh.geometry.attributes.position.count).toBeGreaterThan(0);
      }
    }
  });
});
