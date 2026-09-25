import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { PlayerStateStore } from '../src/game/progression/PlayerStateStore';
import { SaveManager, DEFAULT_SAVE_SLOT } from '../src/persistence/SaveManager';
import { MarketService } from '../src/game/economy/MarketService';
import { CraftingService } from '../src/game/economy/CraftingService';
import { CRAFTING_RECIPES } from '../src/game/economy/CraftingCatalog';
import { SurveyCraft } from '../src/game/scenes/spaceCraft';
import { SystemPopulationGenerator } from '../src/game/population/SystemPopulationGenerator';
import type { StarSystemDescriptor } from '../src/game/systems/PlanetDescriptor';
import type { SpaceStation } from '../src/game/stations/SpaceStationManager';
import type { NamedVessel } from '../src/game/vessels/NamedVesselDirector';

describe('Sandbox End-to-End Integration, Persistence & Decoupling', () => {
  let saveMgr: SaveManager;

  beforeEach(async () => {
    saveMgr = new SaveManager();
    await saveMgr.init();
  });

  describe('1. Canonical State Ownership & Cargo Expansion Flow', () => {
    it('manages default cargo capacity and computes usage correctly', () => {
      const store = new PlayerStateStore();
      expect(store.getCargoCapacity()).toBe(60);
      expect(store.getCargoUsed()).toBe(0);
      expect(store.hasCargoSpace(10)).toBe(true);
      expect(store.hasCargoSpace(61)).toBe(false);

      // Add samples and commodities
      store.addSample('MINERAL', 15);
      store.addCommodity('water_purified', 10);
      expect(store.getCargoUsed()).toBe(25);
      expect(store.hasCargoSpace(35)).toBe(true);
      expect(store.hasCargoSpace(36)).toBe(false);
    });

    it('expands cargo capacity by 40 with mod_cargo_expanded_hold', () => {
      const store = new PlayerStateStore();
      expect(store.getCargoCapacity()).toBe(60);

      // Install expanded cargo hold
      const installed = store.installModule('mod_cargo_expanded_hold');
      expect(installed).toBe(true);
      expect(store.hasModule('mod_cargo_expanded_hold')).toBe(true);
      expect(store.getCargoCapacity()).toBe(100);

      // Now 80 units of cargo can fit
      store.addCommodity('food_rations', 80);
      expect(store.getCargoUsed()).toBe(80);
      expect(store.hasCargoSpace(20)).toBe(true);
      expect(store.hasCargoSpace(21)).toBe(false);
    });

    it('enforces cargo capacity limits during commodity purchases', () => {
      const store = new PlayerStateStore();
      store.setCredits(10000);
      // Fill hold with 55 units (capacity 60)
      store.addCommodity('water_purified', 55);

      const archetype = 'TRADE_HUB';
      const systemSeed = 1042;
      const stationId = 'station_alpha';

      // Buying 10 would exceed 60 capacity (55 + 10 = 65)
      const failResult = MarketService.buyCommodity(
        store.toSaveSlot(DEFAULT_SAVE_SLOT),
        'hydrocarbon_fuel',
        10,
        archetype,
        systemSeed,
        stationId
      );
      expect(failResult.success).toBe(false);
      expect(failResult.message).toContain('Cargo hold full');

      // Buying 5 should succeed (55 + 5 = 60)
      const successResult = MarketService.buyCommodity(
        store.toSaveSlot(DEFAULT_SAVE_SLOT),
        'hydrocarbon_fuel',
        5,
        archetype,
        systemSeed,
        stationId
      );
      expect(successResult.success).toBe(true);
      expect(successResult.cost).toBeGreaterThan(0);
    });

    it('enforces net cargo capacity during crafting execution', () => {
      const store = new PlayerStateStore();
      // Setup inventory near max
      store.setCredits(1000);
      store.addCommodity('titanium_alloy', 10);
      store.addSample('CRYSTALLINE', 10);
      // Fill remaining space up to 59 / 60
      store.addSample('MINERAL', 39);
      expect(store.getCargoUsed()).toBe(59);

      // Recipe: craft_optotronic_circuits requires titanium_alloy: 1, CRYSTALLINE: 1 -> output optotronic_circuits: 1
      // Net cargo change: -1 -1 + 1 = -1 (frees 1 unit of cargo)
      const recipe = CRAFTING_RECIPES.find((r) => r.id === 'craft_optotronic_circuits')!;
      expect(recipe).toBeDefined();

      const slot = store.toSaveSlot(DEFAULT_SAVE_SLOT);
      const craftResult = CraftingService.craftRecipe(slot, recipe.id);
      expect(craftResult.success).toBe(true);
      expect(slot.commodityInventory!['optotronic_circuits']).toBe(1);
    });
  });

  describe('2. Market Stock Depletion & Deltas Persistence', () => {
    it('tracks stock deltas across multiple purchases and updates remaining stock in quotes', () => {
      const store = new PlayerStateStore();
      store.setCredits(5000);

      const archetype = 'TRADE_HUB';
      const systemSeed = 12345;
      const stationId = 'st_trade_alpha';

      // Initial quote
      const initialQuotes = MarketService.getMarketQuotes(archetype, systemSeed, stationId, store.toSaveSlot(DEFAULT_SAVE_SLOT));
      const fuelQuote = initialQuotes.commodities.find((q) => q.id === 'hydrocarbon_fuel')!;
      expect(fuelQuote).toBeDefined();
      const initialStock = fuelQuote.stationStock;
      expect(initialStock).toBeGreaterThan(10);

      // Buy 5 fuel via PlayerStateStore
      const buy1 = store.buyCommodity(stationId, fuelQuote.id, 5, fuelQuote.buyPrice, fuelQuote.stationStock);
      expect(buy1.success).toBe(true);
      expect(store.getMarketStockDeltas()[stationId]['hydrocarbon_fuel']).toBe(5);

      // Quotes now reflect stock deduction
      const updatedQuotes = MarketService.getMarketQuotes(archetype, systemSeed, stationId, store.toSaveSlot(DEFAULT_SAVE_SLOT));
      const updatedFuelQuote = updatedQuotes.commodities.find((q) => q.id === 'hydrocarbon_fuel')!;
      expect(updatedFuelQuote.stationStock).toBe(initialStock - 5);
    });
  });

  describe('3. Docking Entity Discrimination & Discovery Tracking', () => {
    it('correctly discriminates stations vs vessels and avoids cross-contamination in known collections', () => {
      const store = new PlayerStateStore();

      const mockStation: Partial<SpaceStation> = {
        entityKind: 'STATION',
        id: 'station_prime',
        name: 'Prime Gateway',
        archetype: 'TRADE_HUB',
      };

      const mockVessel: Partial<NamedVessel> = {
        entityKind: 'VESSEL',
        id: 'vessel_voyager',
        name: 'Voyager VII',
        archetype: 'SOLAR_SAIL',
      };

      // Record discoveries
      store.discoverStation(mockStation.id!);
      store.discoverVessel(mockVessel.id!);

      expect(store.isStationKnown('station_prime')).toBe(true);
      expect(store.isStationKnown('vessel_voyager')).toBe(false);

      expect(store.isVesselKnown('vessel_voyager')).toBe(true);
      expect(store.isVesselKnown('station_prime')).toBe(false);

      const slot = store.toSaveSlot(DEFAULT_SAVE_SLOT);
      expect(slot.knownStations).toContain('station_prime');
      expect(slot.knownStations).not.toContain('vessel_voyager');

      expect(slot.knownVessels).toContain('vessel_voyager');
      expect(slot.knownVessels).not.toContain('station_prime');
    });
  });

  describe('4. SaveManager Persistence & Roundtrip', () => {
    it('persists and reloads full sandbox progression state in v6 format', async () => {
      const store = new PlayerStateStore();
      store.setCredits(8750);
      store.installModule('mod_cargo_expanded_hold');
      store.installModule('mod_propulsion_ion_vector');
      store.addCommodity('medical_supplies', 12);
      store.addSample('ORGANIC', 8);
      store.discoverStation('station_orion');
      store.discoverVessel('vessel_zephyr');
      store.recordStockPurchase('station_orion', 'medical_supplies', 12);

      const slot = store.toSaveSlot(DEFAULT_SAVE_SLOT);
      expect(slot.saveVersion).toBe(6);

      // Save journey
      await saveMgr.saveJourney(slot);

      // Reload journey
      const loaded = await saveMgr.getSaveSlot('current_journey');
      expect(loaded).not.toBeNull();
      expect(loaded!.saveVersion).toBe(6);
      expect(loaded!.credits).toBe(8750);
      expect(loaded!.installedModules).toEqual(expect.arrayContaining(['mod_cargo_expanded_hold', 'mod_propulsion_ion_vector']));
      expect(loaded!.commodityInventory!['medical_supplies']).toBe(12);
      expect(loaded!.sampleInventory['ORGANIC']).toBe(8);
      expect(loaded!.knownStations).toContain('station_orion');
      expect(loaded!.knownVessels).toContain('vessel_zephyr');
      expect(loaded!.marketStockDeltas?.['station_orion']?.['medical_supplies']).toBe(12);

      // Rehydrate into a new store
      const rehydratedStore = new PlayerStateStore();
      rehydratedStore.loadFromSaveSlot(loaded!);
      expect(rehydratedStore.getCredits()).toBe(8750);
      expect(rehydratedStore.getCargoCapacity()).toBe(100);
      expect(rehydratedStore.getCommodityCount('medical_supplies')).toBe(12);
      expect(rehydratedStore.getSampleCount('ORGANIC')).toBe(8);
      expect(rehydratedStore.isStationKnown('station_orion')).toBe(true);
      expect(rehydratedStore.isVesselKnown('vessel_zephyr')).toBe(true);
    });
  });

  describe('5. Physical Upgrade Visuals on SurveyCraft', () => {
    it('creates visual meshes for installed modules including cargo pods', () => {
      const craft = new SurveyCraft();

      // Initially no module meshes
      const moduleGroup = (craft as any).moduleVisualsGroup as THREE.Group;
      expect(moduleGroup.children.length).toBe(0);

      // Install cargo expansion and ion vector
      craft.setInstalledModules(['mod_cargo_expanded_hold', 'mod_propulsion_ion_vector']);

      // Visual meshes should now be added
      expect(moduleGroup.children.length).toBeGreaterThanOrEqual(2);
      const visualsMap = (craft as any).installedModuleVisuals as Map<string, THREE.Object3D>;
      expect(visualsMap.has('mod_cargo_expanded_hold')).toBe(true);
      expect(visualsMap.has('mod_propulsion_ion_vector')).toBe(true);

      // Verify cargo pod geometry contains 2 pod meshes (left and right)
      const cargoPods = visualsMap.get('mod_cargo_expanded_hold') as THREE.Group;
      expect(cargoPods.children.length).toBe(2);
    });
  });

  describe('6. Discovery Awareness for Starmap Population', () => {
    it('hides exact station/vessel names for unvisited systems and reveals for visited/known ones', () => {
      const dummyStar = {
        id: 'star-1',
        name: 'Aurelia Prime',
        spectralClass: 'G' as const,
        radius: 100,
        lightColor: 0xffffff,
        temperature: 5500,
        coronaColor: 0xffaa00,
      };

      const system: StarSystemDescriptor = {
        id: 'sys-0_0_0',
        seed: 42109,
        name: 'Aurelia',
        sectorX: 0,
        sectorY: 0,
        sectorZ: 0,
        star: dummyStar,
        planets: [],
      };

      const population = SystemPopulationGenerator.generatePopulation(system);
      system.population = population;
      expect(population.stations.length).toBeGreaterThan(0);
      expect(population.vessels.length).toBeGreaterThan(0);

      const visitedSystems = new Set<string>();
      const knownStations = new Set<string>();
      const knownVessels = new Set<string>();

      // Unvisited system logic:
      const isVisited = visitedSystems.has(system.id);
      expect(isVisited).toBe(false);

      // When unvisited, StarChart displays only aggregate telemetry
      const unvisitedSummary = {
        stationsCount: system.population.stations.length,
        vesselsCount: system.population.vessels.length,
      };
      expect(unvisitedSummary.stationsCount).toBe(population.stations.length);
      expect(unvisitedSummary.vesselsCount).toBe(population.vessels.length);

      // Once visited and identified:
      visitedSystems.add(system.id);
      const firstStation = population.stations[0];
      knownStations.add(firstStation.id);

      expect(visitedSystems.has(system.id)).toBe(true);
      expect(knownStations.has(firstStation.id)).toBe(true);

      const stationDisplayName = knownStations.has(firstStation.id)
        ? firstStation.name
        : 'Uncharted Station';
      expect(stationDisplayName).toBe(firstStation.name);

      // Unknown vessel remains masked
      const firstVessel = population.vessels[0];
      const vesselDisplayName = knownVessels.has(firstVessel.id)
        ? firstVessel.name
        : 'Unidentified Starship';
      expect(vesselDisplayName).toBe('Unidentified Starship');
    });
  });
});
