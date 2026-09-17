import { describe, it, expect } from 'vitest';
import { PlanetEnvironmentGenerator } from '../src/game/planets/PlanetEnvironmentProfile';
import { LandingRegionGenerator } from '../src/game/planets/LandingRegionProfile';
import { LandingSiteGenerator } from '../src/game/systems/LandingSiteGenerator';
import type { PlanetDescriptor } from '../src/game/systems/PlanetDescriptor';

describe('Gas Giant Landing Zones & Universal Accessibility', () => {
  it('marks gas giants as landable and generates specialized aerostat regions', () => {
    const profile = PlanetEnvironmentGenerator.generateProfile(42077, 'G', 'gas-giant');
    expect(profile.isLandable).toBe(true);
    expect(profile.family).toBe('gas-giant');

    const regions = LandingRegionGenerator.generateRegions(profile, 42077);
    expect(regions.length).toBeGreaterThanOrEqual(3);

    const regionNames = regions.map((r) => r.name);
    expect(regionNames.some((n) => n.includes('Aerostat') || n.includes('Cloud'))).toBe(true);

    const gasPlanet: PlanetDescriptor = {
      id: 'p-jovian',
      seed: 42077,
      name: 'Solara Majoris',
      type: 'gas-giant',
      radius: 220,
      gravity: 26.0,
      hasAtmosphere: true,
      atmosphereDensity: 4.0,
      temperatureKelvin: 180,
      surfacePressureAtm: 15.0,
      oceanCoverage: 0,
      cloudCoverage: 1.0,
      biosignature: 'none',
      hasRings: true,
      moonsCount: 4,
      palette: { primary: '#f59e0b', secondary: '#d97706', atmosphereGlow: '#fef08a', cloudColor: '#ffffff' },
      shortDescription: 'Colossal banded gas giant with atmospheric aerostat cities.',
      isLandable: true,
      profile,
    };

    const sites = LandingSiteGenerator.generateSites(gasPlanet);
    expect(sites.length).toBeGreaterThanOrEqual(3);
    for (const site of sites) {
      expect(site.id).toBeDefined();
      expect(site.name.length).toBeGreaterThan(0);
      expect(site.region).toBeDefined();
    }
  });
});
