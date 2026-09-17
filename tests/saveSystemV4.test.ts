import { describe, it, expect, beforeEach } from 'vitest';
import { SaveManager, type PlayerSaveSlot } from '../src/persistence/SaveManager';

describe('Save Schema v4 & Ship Progression Persistence', () => {
  let saveMgr: SaveManager;

  beforeEach(async () => {
    saveMgr = new SaveManager();
    await saveMgr.init();
    await saveMgr.clearJourney('current_journey');
  });

  it('persists and loads v4 save slot with progression data', async () => {
    const slot: PlayerSaveSlot = {
      slotId: 'current_journey',
      saveVersion: 4,
      updatedAt: Date.now(),
      universeSeed: 'UNIVERSE-PROGRESSION-4',
      playerSector: { x: 5, y: 0, z: -3 },
      playerLocalPos: { x: 200, y: 50, z: -100 },
      currentSystem: null,
      flightPhase: 'SYSTEM_CRUISE',
      credits: 650,
      sampleInventory: {
        'CRYSTALLINE': 3,
        'MINERAL': 5,
        'BIOLOGICAL': 2,
      },
      installedModules: ['mod_propulsion_ion_vector'],
      pendingOrders: [
        {
          orderId: 'order_123',
          moduleId: 'mod_surface_grav_stabilizer',
          orderedAt: Date.now(),
          deliveryEtaSec: 15,
          destinationSystemName: 'Aurelia',
          status: 'IN_TRANSIT',
        },
      ],
      npcMemories: {
        'npc_1': {
          npcId: 'npc_1',
          speciesId: 'species_orosen',
          name: 'Eraan the Stargazer',
          timesMet: 2,
          lastMet: Date.now(),
          topicsDiscussed: ['ecology', 'the_resonance'],
          factsRevealed: ['Lore of The Silent Weavers'],
          familiarity: 0.5,
        },
      },
      stats: {
        systemsVisited: 2,
        planetsScanned: 4,
        surfacesVisited: 2,
        speciesDiscovered: 5,
        sentientDiscovered: 1,
        loreLearned: 2,
        samplesCollected: 10,
        modulesInstalled: 1,
        anomaliesDiscovered: 1,
        flightTimeSeconds: 800,
      },
      tutorial: { started: true, completed: true, step: 'FINISHED', skipped: false },
      narrative: { triggeredEventIds: ['first_wake'], resonanceFlags: ['resonance_first_heard'] },
    };

    await saveMgr.saveJourney(slot);

    const loaded = await saveMgr.getSaveSlot('current_journey');
    expect(loaded).toBeDefined();
    expect(loaded?.saveVersion).toBe(4);
    expect(loaded?.credits).toBe(650);
    expect(loaded?.sampleInventory['CRYSTALLINE']).toBe(3);
    expect(loaded?.installedModules).toContain('mod_propulsion_ion_vector');
    expect(loaded?.pendingOrders.length).toBe(1);
    expect(loaded?.pendingOrders[0].status).toBe('IN_TRANSIT');
    expect(loaded?.npcMemories['npc_1'].timesMet).toBe(2);
    expect(loaded?.stats.samplesCollected).toBe(10);
    expect(loaded?.stats.sentientDiscovered).toBe(1);
  });

  it('migrates legacy save slots with missing progression fields gracefully to v4 defaults', async () => {
    const rawLegacy: any = {
      slotId: 'current_journey',
      saveVersion: 2,
      updatedAt: Date.now(),
      universeSeed: 'LEGACY-SEED',
      playerSector: { x: 0, y: 0, z: 0 },
      playerLocalPos: { x: 0, y: 0, z: 0 },
      currentSystem: null,
      flightPhase: 'SYSTEM_CRUISE',
      stats: {
        systemsVisited: 1,
        planetsScanned: 2,
        surfacesVisited: 1,
        speciesDiscovered: 0,
        anomaliesDiscovered: 0,
        flightTimeSeconds: 120,
      },
    };

    if ((saveMgr as any).db) {
      const db = (saveMgr as any).db as IDBDatabase;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('save_slots', 'readwrite');
        const req = tx.objectStore('save_slots').put(rawLegacy);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } else {
      (saveMgr as any).memorySaveSlot = rawLegacy;
    }

    const migrated = await saveMgr.getSaveSlot('current_journey');
    expect(migrated).toBeDefined();
    expect(migrated?.saveVersion).toBe(4);
    expect(migrated?.credits).toBeGreaterThanOrEqual(250);
    expect(migrated?.sampleInventory).toBeDefined();
    expect(migrated?.installedModules).toEqual([]);
    expect(migrated?.pendingOrders).toEqual([]);
    expect(migrated?.npcMemories).toEqual({});
    expect(migrated?.stats.samplesCollected).toBe(0);
    expect(migrated?.stats.modulesInstalled).toBe(0);
  });

  it('only detects saved journey when player has actually started playing', async () => {
    // 1. Unplayed slot (default position, 0 flight time, 0 discoveries)
    const unplayedSlot: any = {
      slotId: 'current_journey',
      saveVersion: 4,
      updatedAt: Date.now(),
      universeSeed: 'QUIET-DEFAULT-001',
      playerSector: { x: 0, y: 0, z: 0 },
      playerLocalPos: { x: 0, y: 0, z: 100 },
      currentSystem: null,
      targetSystem: null,
      flightPhase: 'SYSTEM_CRUISE',
      credits: 250,
      sampleInventory: {},
      installedModules: [],
      pendingOrders: [],
      npcMemories: {},
      collectedCreditIds: [],
      stats: {
        systemsVisited: 1,
        planetsScanned: 0,
        surfacesVisited: 0,
        speciesDiscovered: 0,
        sentientDiscovered: 0,
        loreLearned: 0,
        samplesCollected: 0,
        modulesInstalled: 0,
        anomaliesDiscovered: 0,
        flightTimeSeconds: 0,
      },
      tutorial: { started: false, completed: false, step: 'WAKE_INTRO', skipped: false },
      narrative: { triggeredEventIds: [], resonanceFlags: [] },
    };

    await saveMgr.saveJourney(unplayedSlot);
    expect(await saveMgr.hasSavedJourney()).toBe(false);

    // 2. Once the player has flown or moved or scanned, hasSavedJourney becomes true
    unplayedSlot.stats.flightTimeSeconds = 12;
    await saveMgr.saveJourney(unplayedSlot);
    expect(await saveMgr.hasSavedJourney()).toBe(true);
  });
});

