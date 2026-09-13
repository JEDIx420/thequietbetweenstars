import { describe, it, expect } from 'vitest';
import { PlanetEnvironmentGenerator, type PlanetFamily } from '../src/game/planets/PlanetEnvironmentProfile';
import { StarSystemGenerator } from '../src/game/systems/StarSystemGenerator';

describe('PlanetEnvironmentProfile & Diversity Generation', () => {
  it('generates strictly deterministic profiles for identical seed and star conditions', () => {
    const profileA = PlanetEnvironmentGenerator.generateProfile('test-seed-42', 'G');
    const profileB = PlanetEnvironmentGenerator.generateProfile('test-seed-42', 'G');

    expect(profileA).toEqual(profileB);
  });

  it('generates diverse planet families across 100 random seeds', () => {
    const familiesObserved = new Set<PlanetFamily>();
    const morphologyObserved = new Set<string>();
    const landmarksObserved = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const seed = `sample-seed-${i * 37 + 13}`;
      const starClasses = ['O', 'B', 'A', 'F', 'G', 'K', 'M'];
      const starClass = starClasses[i % starClasses.length];

      const profile = PlanetEnvironmentGenerator.generateProfile(seed, starClass);
      familiesObserved.add(profile.family);
      morphologyObserved.add(profile.terrain.morphology);
      landmarksObserved.add(profile.landmark);

      // Verify essential properties exist and are valid
      expect(profile.family).toBeTruthy();
      expect(profile.palette.surfaceLowland).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(profile.palette.surfaceMidland).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(profile.palette.surfaceHighland).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(profile.palette.surfacePeak).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(profile.atmosphere.density).toBeGreaterThanOrEqual(0);
      expect(profile.cloudCoverage).toBeGreaterThanOrEqual(0);
      expect(profile.oceanCoverage).toBeGreaterThanOrEqual(0);
    }

    // Must cover at least 9 distinct families across 100 seeds
    expect(familiesObserved.size).toBeGreaterThanOrEqual(9);
    // Must cover all or nearly all morphology types
    expect(morphologyObserved.size).toBeGreaterThanOrEqual(5);
    // Must cover multiple landmark families
    expect(landmarksObserved.size).toBeGreaterThanOrEqual(5);
  });

  it('generates systems with non-repetitive planet families', () => {
    const system = StarSystemGenerator.generateSystem(12345, 0, 0, 0);
    const families = system.planets.map(p => p.profile?.family).filter(Boolean);

    // Ensure profiles are populated on star system planets
    expect(families.length).toBe(system.planets.length);

    // Ensure no consecutive identical families in the generated star system
    for (let i = 0; i < families.length - 1; i++) {
      expect(families[i]).not.toBe(families[i + 1]);
    }
  });

  it('respects airless atmosphere properties for barren moons', () => {
    const barrenProfile = PlanetEnvironmentGenerator.generateProfile('barren-test', 'G', 'barren-moon');
    expect(barrenProfile.atmosphere.hasAtmosphere).toBe(false);
    expect(barrenProfile.atmosphere.density).toBe(0);
    expect(barrenProfile.oceanCoverage).toBe(0);
    expect(barrenProfile.terrain.hasLiquid).toBe(false);
  });

  it('derives star light color and temperature shifts correctly', () => {
    const hotStarProfile = PlanetEnvironmentGenerator.generateProfile('star-test', 'O');
    const coolStarProfile = PlanetEnvironmentGenerator.generateProfile('star-test', 'M');

    expect(hotStarProfile.palette.sunLightColor).toBeDefined();
    expect(coolStarProfile.palette.sunLightColor).toBeDefined();
    expect(hotStarProfile.palette.sunLightColor).not.toEqual(coolStarProfile.palette.sunLightColor);
  });
});
