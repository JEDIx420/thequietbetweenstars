import { describe, it, expect } from 'vitest';
import { PlanetEnvironmentGenerator } from '../src/game/planets/PlanetEnvironmentProfile';
import { LandingRegionGenerator } from '../src/game/planets/LandingRegionProfile';
import { LandingSiteGenerator } from '../src/game/systems/LandingSiteGenerator';
import type { PlanetDescriptor } from '../src/game/systems/PlanetDescriptor';

describe('LandingRegionProfile & LandingSiteGenerator', () => {
  it('generates distinct landing regions with diverse morphology on a single desert planet', () => {
    const profile = PlanetEnvironmentGenerator.generateProfile('seed-7', 'G');
    const regions = LandingRegionGenerator.generateRegions(profile, 7);

    expect(regions.length).toBeGreaterThanOrEqual(3);

    const morphologies = new Set(regions.map((r) => r.terrainMorphologyOverride));
    // Must contain distinct morphologies (e.g. dunes, canyons, salt_flat, mesa_terrace)
    expect(morphologies.size).toBeGreaterThanOrEqual(3);

    // Palettes must differ between regions
    const lowlandColors = new Set(regions.map((r) => r.localSurfacePalette.lowland));
    expect(lowlandColors.size).toBeGreaterThanOrEqual(2);

    // Relief/Height scales must vary
    const heightScales = regions.map((r) => r.heightScale);
    const minHeight = Math.min(...heightScales);
    const maxHeight = Math.max(...heightScales);
    expect(maxHeight).toBeGreaterThan(minHeight * 1.5);
  });

  it('generates diverse landing regions on a temperate terrestrial planet', () => {
    const profile = PlanetEnvironmentGenerator.generateProfile('seed-terrestrial-lush-11', 'G');
    const regions = LandingRegionGenerator.generateRegions(profile, 11);

    expect(regions.length).toBeGreaterThanOrEqual(3);
    const morphologies = regions.map((r) => r.terrainMorphologyOverride);
    expect(morphologies).toContain('coastal');
    expect(morphologies).toContain('alpine');
    expect(morphologies).toContain('forest_basin');
  });

  it('binds LandingRegionProfile to LandingSite instances deterministically', () => {
    const profile = PlanetEnvironmentGenerator.generateProfile('seed-test-planet', 'K');
    const mockPlanet: PlanetDescriptor = {
      id: 'planet-test-1',
      name: 'Aurelia',
      type: 'temperate-terrestrial',
      radius: 120,
      gravity: 9.8,
      hasAtmosphere: true,
      atmosphereDensity: 1.0,
      temperatureKelvin: 288,
      surfacePressureAtm: 1.0,
      oceanCoverage: 0.5,
      cloudCoverage: 0.4,
      biosignature: 'complex-ecosystem',
      hasRings: false,
      moonsCount: 1,
      palette: {
        primary: '#16a34a',
        secondary: '#0284c7',
        atmosphereGlow: '#38bdf8',
        cloudColor: '#ffffff',
      },
      shortDescription: 'Verdant world',
      seed: 8888,
      isLandable: true,
      profile,
    };

    const sites1 = LandingSiteGenerator.generateSites(mockPlanet);
    const sites2 = LandingSiteGenerator.generateSites(mockPlanet);

    expect(sites1.length).toBeGreaterThanOrEqual(3);
    expect(sites1.length).toBe(sites2.length);

    for (let i = 0; i < sites1.length; i++) {
      expect(sites1[i].name).toBe(sites2[i].name);
      expect(sites1[i].region.terrainMorphologyOverride).toBe(sites2[i].region.terrainMorphologyOverride);
      expect(sites1[i].region.localSurfacePalette.lowland).toBe(sites2[i].region.localSurfacePalette.lowland);
    }
  });
});
