import { describe, it, expect } from 'vitest';
import { PlanetEnvironmentGenerator } from '../src/game/planets/PlanetEnvironmentProfile';
import { LandingRegionGenerator } from '../src/game/planets/LandingRegionProfile';
import { FloraGenerator } from '../src/game/surface/FloraGenerator';
import { FaunaGenerator } from '../src/game/surface/FaunaGenerator';
import * as THREE from 'three';

describe('Ecology, Flora & Fauna Distribution', () => {
  it('prevents flora and fauna on barren airless worlds or salt flats', () => {
    const profile = PlanetEnvironmentGenerator.generateProfile('seed-12', 'M');
    const regions = LandingRegionGenerator.generateRegions(profile, 12);

    const flatRegion = regions.find((r) => r.vegetationDensity === 0 && r.faunaDensity === 0);
    expect(flatRegion).toBeDefined();

    if (flatRegion) {
      const flora = FloraGenerator.createFloraInstances(flatRegion, 0, 0, 200, () => 10);
      expect(flora.length).toBe(0);

      const fauna = FaunaGenerator.createFauna(flatRegion, new THREE.Vector3(0, 10, 0), () => 10);
      expect(fauna.length).toBe(0);
    }
  });

  it('generates instanced flora and active fauna in rich biosignature regions', () => {
    const profile = PlanetEnvironmentGenerator.generateProfile('seed-terrestrial-lush-11', 'G');
    const regions = LandingRegionGenerator.generateRegions(profile, 11);

    const lushRegion = regions.find((r) => r.vegetationDensity > 0.5 && r.faunaDensity > 0.5);
    expect(lushRegion).toBeDefined();

    if (lushRegion) {
      const flora = FloraGenerator.createFloraInstances(lushRegion, 0, 0, 200, () => 12);
      expect(flora.length).toBeGreaterThan(0);
      expect(flora[0].count).toBeGreaterThan(10);

      const fauna = FaunaGenerator.createFauna(lushRegion, new THREE.Vector3(0, 15, 0), () => 10);
      expect(fauna.length).toBeGreaterThan(0);

      const firstCreature = fauna[0];
      expect(firstCreature.scanInfo.name).toBeTruthy();
      expect(firstCreature.scanInfo.behaviour).toBeTruthy();
      expect(firstCreature.scanInfo.diet).toBeTruthy();
      expect(firstCreature.scanInfo.adaptation).toBeTruthy();

      // Test creature locomotion update
      const initialPos = firstCreature.group.position.clone();
      firstCreature.update(0.1, () => 10);
      expect(firstCreature.group.position.equals(initialPos)).toBe(false);
    }
  });
});
