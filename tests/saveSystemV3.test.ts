import { describe, it, expect, beforeEach } from 'vitest';
import { SaveManager, type PlayerSaveSlot } from '../src/persistence/SaveManager';

describe('Save Schema v3 & Journey Reset', () => {
  let saveMgr: SaveManager;

  beforeEach(async () => {
    saveMgr = new SaveManager();
    await saveMgr.init();
    await saveMgr.clearJourney();
  });

  it('persists and loads v3 save slot with tutorial and narrative states', async () => {
    const slot: PlayerSaveSlot = {
      slotId: 'current_journey',
      saveVersion: 3,
      updatedAt: Date.now(),
      universeSeed: 'UNIVERSE-EPSILON-9',
      playerSector: { x: 12, y: -2, z: 8 },
      playerLocalPos: { x: 50, y: 10, z: -20 },
      currentSystem: null,
      flightPhase: 'STELLAR_CRUISE',
      credits: 0,
      sampleInventory: {},
      installedModules: [],
      pendingOrders: [],
      npcMemories: {},
      stats: {
        systemsVisited: 4,
        planetsScanned: 8,
        surfacesVisited: 3,
        speciesDiscovered: 7,
        sentientDiscovered: 0,
        loreLearned: 0,
        samplesCollected: 0,
        modulesInstalled: 0,
        anomaliesDiscovered: 2,
        flightTimeSeconds: 1540,
      },
      tutorial: {
        started: true,
        completed: false,
        step: 'APPROACH_PLANET',
        skipped: false,
      },
      narrative: {
        triggeredEventIds: ['first_wake', 'first_steer', 'deep_cruise_start'],
        resonanceFlags: ['first_harmonic_heard'],
      },
    };

    await saveMgr.saveJourney(slot);

    const hasJourney = await saveMgr.hasSavedJourney();
    expect(hasJourney).toBe(true);

    const loaded = await saveMgr.getSaveSlot('current_journey');
    expect(loaded).toBeDefined();
    expect(loaded?.saveVersion).toBeGreaterThanOrEqual(3);
    expect(loaded?.universeSeed).toBe('UNIVERSE-EPSILON-9');
    expect(loaded?.tutorial?.step).toBe('APPROACH_PLANET');
    expect(loaded?.narrative?.triggeredEventIds).toContain('deep_cruise_start');
    expect(loaded?.narrative?.resonanceFlags).toContain('first_harmonic_heard');
    expect(loaded?.stats.speciesDiscovered).toBe(7);
  });

  it('migrates older v2 save slots gracefully to v3 on retrieval', async () => {
    // Manually write an unversioned / v2 structure
    const rawV2: any = {
      slotId: 'current_journey',
      saveVersion: 2,
      updatedAt: Date.now(),
      universeSeed: 'LEGACY-V2',
      playerSector: { x: 1, y: 0, z: 1 },
      playerLocalPos: { x: 0, y: 0, z: 0 },
      currentSystem: null,
      flightPhase: 'SYSTEM_CRUISE',
      stats: {
        systemsVisited: 1,
        planetsScanned: 0,
        anomaliesFound: 0,
        flightTimeSeconds: 30,
      },
    };

    // Save directly into memory or IDB
    if ((saveMgr as any).db) {
      const db = (saveMgr as any).db as IDBDatabase;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('save_slots', 'readwrite');
        const req = tx.objectStore('save_slots').put(rawV2);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } else {
      (saveMgr as any).memorySaveSlot = rawV2;
    }

    const loaded = await saveMgr.getSaveSlot('current_journey');
    expect(loaded).toBeDefined();
    expect(loaded?.saveVersion).toBeGreaterThanOrEqual(3);
    expect(loaded?.tutorial).toBeDefined();
    expect(loaded?.tutorial?.step).toBe('WAKE_INTRO');
    expect(loaded?.narrative).toBeDefined();
    expect(loaded?.stats.surfacesVisited).toBe(0);
    expect(loaded?.stats.speciesDiscovered).toBe(0);
  });

  it('clears all journey states and discoveries when clearJourney is called', async () => {
    const slot: PlayerSaveSlot = {
      slotId: 'current_journey',
      saveVersion: 3,
      updatedAt: Date.now(),
      universeSeed: 'RESET-TEST',
      playerSector: { x: 0, y: 0, z: 0 },
      playerLocalPos: { x: 0, y: 0, z: 0 },
      currentSystem: null,
      flightPhase: 'SYSTEM_CRUISE',
      credits: 0,
      sampleInventory: {},
      installedModules: [],
      pendingOrders: [],
      npcMemories: {},
      stats: {
        systemsVisited: 1,
        planetsScanned: 1,
        surfacesVisited: 1,
        speciesDiscovered: 1,
        sentientDiscovered: 0,
        loreLearned: 0,
        samplesCollected: 0,
        modulesInstalled: 0,
        anomaliesDiscovered: 1,
        flightTimeSeconds: 10,
      },
      tutorial: { started: true, completed: false, step: 'SCAN_ACTION', skipped: false },
      narrative: { triggeredEventIds: ['first_wake'], resonanceFlags: [] },
    };

    await saveMgr.saveJourney(slot);
    await saveMgr.recordDiscovery({
      id: 'disc-1',
      type: 'planet',
      name: 'Alpha Planet',
      systemName: 'Alpha',
      sector: { x: 0, y: 0, z: 0 },
      timestamp: Date.now(),
      details: 'Test planet',
      category: 'WORLDS',
    });

    expect(await saveMgr.hasSavedJourney()).toBe(true);
    expect((await saveMgr.getAllDiscoveries()).length).toBe(1);

    await saveMgr.clearJourney();

    expect(await saveMgr.hasSavedJourney()).toBe(false);
    expect(await saveMgr.getSaveSlot('current_journey')).toBeNull();
    expect((await saveMgr.getAllDiscoveries()).length).toBe(0);
  });
});
