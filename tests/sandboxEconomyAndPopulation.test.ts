import { describe, it, expect, beforeEach } from 'vitest';
import { SystemPopulationGenerator } from '../src/game/population/SystemPopulationGenerator';
import { MarketService } from '../src/game/economy/MarketService';
import { CraftingService } from '../src/game/economy/CraftingService';
import { COMMODITY_CATALOG, RAW_SAMPLE_PRICES } from '../src/game/economy/CommodityCatalog';
import { CRAFTING_RECIPES } from '../src/game/economy/CraftingCatalog';
import { SaveManager, type PlayerSaveSlot, DEFAULT_SAVE_SLOT } from '../src/persistence/SaveManager';
import type { StarSystemDescriptor } from '../src/game/systems/PlanetDescriptor';

describe('SystemPopulationGenerator', () => {
  const dummyStar = {
    id: 'star-1',
    name: 'Solara',
    spectralClass: 'G' as const,
    radius: 100,
    lightColor: 0xffffff,
    temperature: 5500,
    coronaColor: 0xffaa00,
  };

  it('deterministically generates stations and NPC vessels for an origin system', () => {
    const originSystem: StarSystemDescriptor = {
      id: 'sys-0_0_0',
      seed: 42109,
      name: 'Aurelia',
      sectorX: 0,
      sectorY: 0,
      sectorZ: 0,
      star: dummyStar,
      planets: [],
    };

    const popA = SystemPopulationGenerator.generatePopulation(originSystem);
    const popB = SystemPopulationGenerator.generatePopulation(originSystem);

    expect(popA.stations.length).toBe(1);
    expect(popA.stations[0].archetype).toBe('TRADE_HUB');
    expect(popA.stations[0].id).toBe(popB.stations[0].id);
    expect(popA.stations[0].name).toBe('Aurelia Orbital Gateway');
    expect(popA.stations[0].services).toContain('SHIPYARD');

    expect(popA.vessels.length).toBe(2);
    expect(popA.vessels[0].id).toBe('the_wanderer_7');
    expect(popA.vessels[0].name).toBe('The Wanderer-7');
    expect(popA.vessels[0].captainName).toBe('Captain Zephyr');
    expect(popA.vessels[0].isDockable).toBe(false); // CRUISER
  });

  it('deterministically generates stations and vessels for deep space systems', () => {
    const deepSystem: StarSystemDescriptor = {
      id: 'sys-5_3_-2',
      seed: 881726,
      name: 'Vespera Prime',
      sectorX: 5,
      sectorY: 3,
      sectorZ: -2,
      star: dummyStar,
      planets: [
        { id: 'p1' } as any,
        { id: 'p2' } as any,
        { id: 'p3' } as any,
        { id: 'p4' } as any,
      ],
    };

    const pop1 = SystemPopulationGenerator.generatePopulation(deepSystem);
    const pop2 = SystemPopulationGenerator.generatePopulation(deepSystem);

    expect(pop1.stations.length).toBe(pop2.stations.length);
    expect(pop1.vessels.length).toBe(pop2.vessels.length);

    if (pop1.stations.length > 0) {
      expect(pop1.stations[0].id).toBe(pop2.stations[0].id);
      expect(pop1.stations[0].name).toBe(pop2.stations[0].name);
      expect(pop1.stations[0].archetype).toBe(pop2.stations[0].archetype);
      expect(pop1.stations[0].services).toContain('MARKET');
      expect(pop1.stations[0].services).toContain('FABRICATOR');
    }
  });

  it('generates dockable capital vessels across varied system seeds', () => {
    let foundDockable = false;

    for (let s = 1; s <= 20; s++) {
      const sys: StarSystemDescriptor = {
        id: `sys-${s}_0_0`,
        seed: s * 104729,
        name: `Sector-${s}`,
        sectorX: s,
        sectorY: 0,
        sectorZ: 0,
        star: dummyStar,
        planets: [{ id: 'p1' } as any, { id: 'p2' } as any, { id: 'p3' } as any, { id: 'p4' } as any, { id: 'p5' } as any],
      };

      const pop = SystemPopulationGenerator.generatePopulation(sys);
      for (const v of pop.vessels) {
        if (v.isDockable) {
          foundDockable = true;
          expect(['CARRIER', 'CAPITAL', 'TRADER'].includes(v.sizeClass)).toBe(true);
        }
      }
    }

    expect(foundDockable).toBe(true);
  });
});

describe('MarketService', () => {
  it('calculates deterministic prices with archetype supply/demand adjustments and positive bid/ask spreads', () => {
    const tradeQuotes = MarketService.getMarketQuotes('TRADE_HUB', 551122, 'station_hub_1');
    expect(tradeQuotes.commodities.length).toBe(COMMODITY_CATALOG.length);
    expect(tradeQuotes.samples.length).toBe(Object.keys(RAW_SAMPLE_PRICES).length);

    for (const item of tradeQuotes.commodities) {
      expect(item.buyPrice).toBeGreaterThan(item.sellPrice);
      expect(item.stationStock).toBeGreaterThan(0);
    }

    // Refinery has cheaper titanium alloy than high-tech biostation
    const refineryQuotes = MarketService.getMarketQuotes('MINING_REFINERY', 551122, 'station_refinery_1');
    const bioQuotes = MarketService.getMarketQuotes('ALIEN_BIOSTATION', 551122, 'station_refinery_1');

    const refineryTitanium = refineryQuotes.commodities.find((c) => c.id === 'titanium_alloy')!;
    const bioTitanium = bioQuotes.commodities.find((c) => c.id === 'titanium_alloy')!;
    expect(refineryTitanium.buyPrice).toBeLessThan(bioTitanium.buyPrice);
  });

  it('executes atomic commodity purchases and deducts credits', () => {
    const slot: PlayerSaveSlot = {
      ...DEFAULT_SAVE_SLOT,
      credits: 1000,
      commodityInventory: {},
    };

    const res = MarketService.buyCommodity(
      slot,
      'titanium_alloy',
      2,
      'MINING_REFINERY',
      551122,
      'st-1'
    );

    expect(res.success).toBe(true);
    expect(slot.credits).toBeLessThan(1000);
    expect(slot.commodityInventory!['titanium_alloy']).toBe(2);
  });

  it('rejects purchases if the player has insufficient credits', () => {
    const slot: PlayerSaveSlot = {
      ...DEFAULT_SAVE_SLOT,
      credits: 5,
      commodityInventory: {},
    };

    const res = MarketService.buyCommodity(
      slot,
      'optotronic_circuits',
      10,
      'RESEARCH_ARRAY',
      12345,
      'st-2'
    );

    expect(res.success).toBe(false);
    expect(res.message).toContain('Insufficient credits');
    expect(slot.credits).toBe(5);
  });

  it('executes atomic commodity sales and credits the player', () => {
    const slot: PlayerSaveSlot = {
      ...DEFAULT_SAVE_SLOT,
      credits: 200,
      commodityInventory: { 'hydrocarbon_fuel': 5 },
    };

    const res = MarketService.sellCommodity(
      slot,
      'hydrocarbon_fuel',
      2,
      'TRADE_HUB',
      12345,
      'st-1'
    );

    expect(res.success).toBe(true);
    expect(slot.credits).toBeGreaterThan(200);
    expect(slot.commodityInventory!['hydrocarbon_fuel']).toBe(3);
  });

  it('executes raw sample sales from exploration cargo', () => {
    const slot: PlayerSaveSlot = {
      ...DEFAULT_SAVE_SLOT,
      credits: 150,
      sampleInventory: { 'MINERAL': 10 },
    };

    const res = MarketService.sellSample(
      slot,
      'MINERAL',
      4,
      'MINING_REFINERY',
      12345,
      'st-ref-1'
    );

    expect(res.success).toBe(true);
    expect(slot.credits).toBeGreaterThan(150);
    expect(slot.sampleInventory['MINERAL']).toBe(6);
  });
});

describe('CraftingService', () => {
  it('validates ingredient requirements and missing components', () => {
    const recipe = CRAFTING_RECIPES.find((r) => r.id === 'craft_titanium_ingot')!;
    expect(recipe).toBeDefined();

    const emptySlot: PlayerSaveSlot = {
      ...DEFAULT_SAVE_SLOT,
      credits: 0,
      sampleInventory: {},
      commodityInventory: {},
    };

    const checkFail = CraftingService.validateRecipe(emptySlot, recipe);
    expect(checkFail.canCraft).toBe(false);
    expect(checkFail.missingCredits).toBe(recipe.creditsCost);
    expect(checkFail.missingIngredients.length).toBe(1);

    const readySlot: PlayerSaveSlot = {
      ...DEFAULT_SAVE_SLOT,
      credits: 500,
      sampleInventory: { 'MINERAL': 10 },
      commodityInventory: {},
    };

    const checkPass = CraftingService.validateRecipe(readySlot, recipe);
    expect(checkPass.canCraft).toBe(true);
    expect(checkPass.missingCredits).toBe(0);
    expect(checkPass.missingIngredients.length).toBe(0);
  });

  it('atomically crafts commodities and reduces inventory and credits', () => {
    const slot: PlayerSaveSlot = {
      ...DEFAULT_SAVE_SLOT,
      credits: 500,
      sampleInventory: { 'ATMOSPHERIC': 4 },
      commodityInventory: {},
    };

    const res = CraftingService.craftRecipe(slot, 'craft_deuterium_fuel');
    expect(res.success).toBe(true);
    expect(slot.credits).toBeLessThan(500);
    expect(slot.sampleInventory['ATMOSPHERIC']).toBe(2);
    expect(slot.commodityInventory!['hydrocarbon_fuel']).toBe(1);
  });

  it('installs modules into installedModules upon crafting', () => {
    const moduleRecipe = CRAFTING_RECIPES.find((r) => r.result.type === 'MODULE')!;
    expect(moduleRecipe).toBeDefined();

    const slot: PlayerSaveSlot = {
      ...DEFAULT_SAVE_SLOT,
      credits: 10000,
      sampleInventory: { 'RESONANCE': 5 },
      commodityInventory: { 'harmonic_resonator': 5, 'optotronic_circuits': 5 },
      installedModules: [],
    };

    const res = CraftingService.craftRecipe(slot, moduleRecipe.id);
    expect(res.success).toBe(true);
    expect(slot.installedModules).toContain(moduleRecipe.result.id);
  });
});

describe('SaveManager v6 Sandbox Migration', () => {
  let saveMgr: SaveManager;

  beforeEach(async () => {
    saveMgr = new SaveManager();
    await saveMgr.init();
    await saveMgr.clearJourney('current_journey');
  });

  it('creates and saves default slot with version 6 sandbox properties', async () => {
    const freshSlot = { ...DEFAULT_SAVE_SLOT, updatedAt: Date.now() };
    await saveMgr.saveJourney(freshSlot);

    const loaded = await saveMgr.getSaveSlot('current_journey');
    expect(loaded).not.toBeNull();
    expect(loaded!.saveVersion).toBe(6);
    expect(loaded!.commodityInventory).toBeDefined();
    expect(loaded!.knownStations).toBeDefined();
    expect(loaded!.knownVessels).toBeDefined();
  });

  it('migrates a v5 save into v6 preserving exploration and initializing sandbox collections', async () => {
    const v5Slot: any = {
      slotId: 'current_journey',
      saveVersion: 5,
      updatedAt: Date.now() - 50000,
      universeSeed: 'TEST-UNIVERSE-V5',
      playerSector: { x: 1, y: 2, z: 3 },
      playerLocalPos: { x: 10, y: 20, z: 30 },
      currentSystem: null,
      flightPhase: 'SYSTEM_CRUISE',
      credits: 1250,
      sampleInventory: { 'MINERAL': 7 },
      installedModules: ['mod_propulsion_ion_vector'],
      pendingOrders: [],
      npcMemories: {},
      stats: { ...DEFAULT_SAVE_SLOT.stats },
      tutorial: { ...DEFAULT_SAVE_SLOT.tutorial },
      narrative: { ...DEFAULT_SAVE_SLOT.narrative },
      story: {
        activeChapterId: 'ch1',
        currentObjectiveId: 'reach_beacon',
        flags: {},
        dialogueHistory: [],
        discoveredRelayIds: [],
        storyCompleted: false,
        freeExplorationMode: false,
      },
    };

    await saveMgr.saveJourney(v5Slot);

    const migrated = await saveMgr.getSaveSlot('current_journey');
    expect(migrated).not.toBeNull();
    expect(migrated!.saveVersion).toBe(6);
    expect(migrated!.credits).toBe(1250);
    expect(migrated!.commodityInventory).toEqual({});
    expect(migrated!.knownStations).toEqual([]);
    expect(migrated!.knownVessels).toEqual([]);
    expect(migrated!.story?.freeExplorationMode).toBe(true);
  });
});
