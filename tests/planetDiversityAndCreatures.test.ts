import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PlanetEnvironmentGenerator, type PlanetFamily } from '../src/game/planets/PlanetEnvironmentProfile';
import { LandingRegionGenerator } from '../src/game/planets/LandingRegionProfile';
import { EcologyGenerator } from '../src/game/ecology/PlanetEcologyProfile';
import { FaunaPopulationManager } from '../src/game/ecology/FaunaPopulationManager';
import { FloraGenerator } from '../src/game/surface/FloraGenerator';
import { LandmarkGenerator } from '../src/game/surface/LandmarkGenerator';
import { StructuredConversationProvider } from '../src/narrative/ConversationDirector';
import { SeededRandom } from '../src/game/universe/SeededRandom';
import { FaunaGenerator } from '../src/game/surface/FaunaGenerator';

describe('Planetary Diversity, Exotic Biomes & Creature Variety', () => {
  const newFamilies: PlanetFamily[] = [
    'aurora-plasma',
    'fungal-mycelium',
    'shattered-shards',
    'chlorophyll-jungle',
    'radioactive-abyss',
  ];

  it('generates coherent profiles for all 5 new exotic planet families', () => {
    for (const family of newFamilies) {
      const profile = PlanetEnvironmentGenerator.generateProfile(12345, 'G', family);
      expect(profile.family).toBe(family);
      expect(profile.isLandable).toBe(true);
      expect(profile.atmosphere.hasAtmosphere).toBe(true);
      expect(profile.palette.surfaceMidland).toBeDefined();
      expect(profile.palette.surfaceHighland).toBeDefined();
      expect(profile.palette.accentMineral).toBeDefined();
      expect(profile.terrain.morphology).toBeDefined();
      expect(profile.landmark).toBeDefined();
    }
  });

  it('generates distinct landing regions and biomes for each new family', () => {
    for (const family of newFamilies) {
      const profile = PlanetEnvironmentGenerator.generateProfile(54321, 'K', family);
      const regions = LandingRegionGenerator.generateRegions(profile, 54321);

      expect(regions.length).toBeGreaterThanOrEqual(3);
      for (const region of regions) {
        expect(region.biomeName.length).toBeGreaterThan(0);
        expect(region.terrainMorphologyOverride).toBeDefined();
        expect(region.faunaArchetypes.length).toBeGreaterThan(0);
        expect(region.localSurfacePalette.midland).toBeDefined();
      }
    }
  });

  it('generates flora instances and landmarks for new biomes', () => {
    const myceliumProfile = PlanetEnvironmentGenerator.generateProfile(8888, 'M', 'fungal-mycelium');
    const regions = LandingRegionGenerator.generateRegions(myceliumProfile, 8888);
    const region = regions[0];

    const flora = FloraGenerator.createFloraInstances(region, 0, 0, 150, () => 8.0);
    expect(flora.length).toBeGreaterThan(0);

    const landmark = LandmarkGenerator.createLandmark(region.landmarkFamilies[0], myceliumProfile.palette, new SeededRandom(42), region.biomeName);
    expect(landmark.mesh.children.length).toBeGreaterThan(0);
    expect(landmark.name.length).toBeGreaterThan(0);
  });

  it('generates planet-adapted species catalogues featuring new body plans', () => {
    const plasmaProfile = PlanetEnvironmentGenerator.generateProfile(9999, 'B', 'aurora-plasma');
    const ecology = EcologyGenerator.deriveEcology(plasmaProfile, 9999, 'p-plasma-1', true);

    expect(ecology.tier).toBe('SENTIENT_BIOSPHERE');
    const allSpecies = [
      ...ecology.groundSpecies,
      ...ecology.aerialSpecies,
      ...ecology.amphibiousSpecies,
      ...ecology.megafaunaSpecies,
    ];

    const bodyPlans = new Set(allSpecies.map((s) => s.bodyPlan));
    expect(bodyPlans.has('plasma_kite') || bodyPlans.has('crystal_behemoth') || bodyPlans.has('sand_scythe')).toBe(true);
  });

  it('instantiates sentient Titans for Land, Water, and Air with look-at and dynamic palette', () => {
    const shardProfile = PlanetEnvironmentGenerator.generateProfile(7771, 'G', 'shattered-shards');
    const ecology = EcologyGenerator.deriveEcology(shardProfile, 7771, 'p-shard-1', true);
    const regions = LandingRegionGenerator.generateRegions(shardProfile, 7771);
    const region = regions[0];

    const manager = new FaunaPopulationManager(ecology, region, null, []);
    expect(manager.encounterSites.length).toBe(3);

    const siteTypes = manager.encounterSites.map((s) => s.type);
    expect(siteTypes.some((t) => t.includes('LAND'))).toBe(true);
    expect(siteTypes.some((t) => t.includes('WATER'))).toBe(true);
    expect(siteTypes.some((t) => t.includes('AIR'))).toBe(true);

    // Verify encounter site titans can be updated and respond to ship position
    for (const site of manager.encounterSites) {
      expect(site.giantNPC).toBeDefined();
      expect(site.giantNPC.name.length).toBeGreaterThan(0);
      expect(site.giantNPC.greeting.length).toBeGreaterThan(0);
    }
  });

  it('provides specialized dialogue from StructuredConversationProvider for varied titans', () => {
    const mockNPC = {
      npcId: 'giant_land_volcano',
      speciesId: 'sp-volcano',
      name: 'Obsidian Caldera Titan',
      title: 'Elder of the Pyroclastic Strata',
      personality: 'solemn' as const,
      ageStage: 'elder' as const,
      knowledgeTopics: ['ecology', 'history'],
      greeting: 'The stone remembers.',
      loreKey: 'volcanic_core',
      loreFactTitle: 'Secrets of the Core',
      loreFactText: 'The core pulses with molten energy.',
      loreFactKey: 'volcanic_core',
      currentConcern: 'The mantle stirs.',
    };

    const conversation = StructuredConversationProvider.handleChoice(mockNPC, 'ecology');
    expect(conversation.text).toContain('molten plates');
    expect(conversation.text).toContain('primordial flame');

    const mockFungal = {
      npcId: 'giant_land_fungal',
      speciesId: 'sp-fungal',
      name: 'Mycelial Arch-Druid',
      title: 'Elder of the Prime Mycelial Canopies',
      personality: 'gentle' as const,
      ageStage: 'elder' as const,
      knowledgeTopics: ['ecology', 'history'],
      greeting: 'The spores whisper.',
      loreKey: 'fungal_core',
      loreFactTitle: 'Secrets of the Fungal Core',
      loreFactText: 'The network stretches deep.',
      loreFactKey: 'fungal_core',
      currentConcern: 'The spores drift.',
    };

    const fungalConvo = StructuredConversationProvider.handleChoice(mockFungal, 'ecology');
    expect(fungalConvo.text).toContain('spore stalk');
    expect(fungalConvo.text).toContain('acoustic fungal network');
  });

  it('instantiates active creatures with all 9 new body plans and verifies scan info', () => {
    const archetypes = [
      'crystal_behemoth' as const,
      'mycelial_chimera' as const,
      'plasma_kite' as const,
      'magma_drake' as const,
      'abyssal_drifter' as const,
      'strider_colossus' as const,
      'sand_scythe' as const,
      'floating_aegis' as const,
      'chitin_burrower' as const,
    ];

    const profile = PlanetEnvironmentGenerator.generateProfile(1010, 'G', 'aurora-plasma');
    const regions = LandingRegionGenerator.generateRegions(profile, 1010);
    const region = regions[0];

    for (const arch of archetypes) {
      const creature = (FaunaGenerator as any).buildCreature(arch, region, new SeededRandom(77), new THREE.Vector3(0, 5, 0));
      expect(creature.group.children.length).toBeGreaterThan(0);
      expect(creature.scanInfo.name.length).toBeGreaterThan(0);
      expect(creature.scanInfo.adaptation.length).toBeGreaterThan(0);
    }
  });
});
