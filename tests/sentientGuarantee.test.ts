import { describe, it, expect } from 'vitest';
import { StarSystemGenerator } from '../src/game/systems/StarSystemGenerator';
import { FaunaPopulationManager } from '../src/game/ecology/FaunaPopulationManager';
import { EcologyGenerator } from '../src/game/ecology/PlanetEcologyProfile';
import { SentientSpeciesGenerator } from '../src/game/ecology/SentientSpeciesProfile';
import type { LandingRegionProfile } from '../src/game/planets/LandingRegionProfile';

describe('Sentient World Rarity & Starting Neighborhood Guarantee', () => {
  it('guarantees a landable sentient world in the starting neighborhood (sector {0, 1, 0})', () => {
    // Generate star system in neighbor sector (0, 1, 0)
    const system = StarSystemGenerator.generateSystem('SEED-TEST-001', 0, 1, 0);

    // Find any landable planet with sentient ecology
    const sentientCandidate = system.planets.find((p) => {
      const ecology = EcologyGenerator.deriveEcology(p.profile, p.seed, p.id);
      return ecology.tier === 'SENTIENT_BIOSPHERE' && ecology.sentientSpecies.length > 0;
    });

    expect(sentientCandidate).toBeDefined();
    expect(sentientCandidate?.isLandable).toBe(true);
    expect(sentientCandidate?.biosignature).toBe('anomalous');
  });

  it('guarantees SentientEncounterSite placement situated between 190m and 360m from landing', () => {
    const system = StarSystemGenerator.generateSystem('SEED-TEST-001', 0, 1, 0);
    const planet = system.planets.find(p => p.profile.forceSentient)!;
    expect(planet).toBeDefined();

    const ecology = EcologyGenerator.deriveEcology(planet.profile, planet.seed, planet.id);
    expect(ecology.tier).toBe('SENTIENT_BIOSPHERE');

    const sentientProfile = SentientSpeciesGenerator.generateSpecies(planet.profile, planet.seed, planet.id, ecology);
    expect(sentientProfile).not.toBeNull();

    const notableNPCs = SentientSpeciesGenerator.generateNotableNPCs(sentientProfile!, 3, planet.seed);
    expect(notableNPCs.length).toBe(3);

    const mockRegion: LandingRegionProfile = {
      id: 'reg-sentient',
      name: 'Resonant Vale',
      regionSeed: 777,
      regionType: 'canyons',
      biomeName: 'Spires',
      loreSnippet: 'Home of the ancient giants.',
      safetyRating: 'Stable',
      interestingSignals: ['INTELLIGENT SIGNAL'],
      terrainMorphologyOverride: 'canyons',
      heightScale: 1.0,
      roughness: 0.5,
      erosion: 0.2,
      ridgeStrength: 0.3,
      canyonStrength: 0.5,
      duneStrength: 0,
      waterLevelOffset: -100,
      moisture: 0.5,
      temperatureOffset: 0,
      windStrength: 0.3,
      vegetationDensity: 0.5,
      vegetationArchetype: 'stalks',
      faunaDensity: 0.6,
      faunaArchetypes: ['quadruped'],
      rockDensity: 0.3,
      landmarkFamilies: ['basalt_columns'],
      localSurfacePalette: {
        lowland: '#1e293b',
        midland: '#334155',
        highland: '#475569',
        peak: '#0f172a',
        rock: '#64748b',
        accent: '#020617',
      },
      fogModifier: {
        densityMultiplier: 1.0,
      },
      particleModifier: {
        type: 'none',
        densityMultiplier: 1.0,
      },
    };

    const manager = new FaunaPopulationManager(ecology, mockRegion, sentientProfile, notableNPCs);

    // Guaranteed encounter sites must exist
    expect(manager.encounterSites.length).toBeGreaterThanOrEqual(1);

    for (const site of manager.encounterSites) {
      // Landing point is (0, 0)
      const distFromLanding = Math.sqrt(site.position.x * site.position.x + site.position.z * site.position.z);
      expect(distFromLanding).toBeGreaterThanOrEqual(190);
      expect(distFromLanding).toBeLessThanOrEqual(360);
      expect(site.giantNPC).toBeDefined();
      expect(site.giantNPC.greeting.length).toBeGreaterThan(0);
    }
  });
});
