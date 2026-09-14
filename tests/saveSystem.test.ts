import { describe, it, expect, beforeEach } from 'vitest';
import { SaveManager, type PlayerSaveSlot, type DiscoveryRecord, type JournalEntry } from '../src/persistence/SaveManager';

describe('SaveManager IndexedDB v2 & Journey Persistence', () => {
  let saveMgr: SaveManager;

  beforeEach(async () => {
    saveMgr = new SaveManager();
    await saveMgr.init();
  });

  it('manages settings defaults and updates', async () => {
    const settings = await saveMgr.getSettings();
    expect(settings.version).toBe(2);
    expect(settings.audioMuted).toBe(false);

    const updated = await saveMgr.updateSettings({ audioMuted: true, masterVolume: 0.9 });
    expect(updated.audioMuted).toBe(true);
    expect(updated.masterVolume).toBe(0.9);
  });

  it('serializes and retrieves a player save slot', async () => {
    const slot: PlayerSaveSlot = {
      slotId: 'current_journey',
      saveVersion: 2,
      updatedAt: Date.now(),
      universeSeed: 'TEST-UNIVERSE-99',
      playerSector: { x: 4, y: 0, z: -7 },
      playerLocalPos: { x: 120, y: 35, z: -50 },
      currentSystem: null,
      flightPhase: 'SYSTEM_CRUISE',
      stats: {
        systemsVisited: 3,
        planetsScanned: 5,
        surfacesVisited: 2,
        speciesDiscovered: 4,
        anomaliesDiscovered: 1,
        flightTimeSeconds: 420,
      },
      tutorial: {
        started: true,
        completed: false,
        step: 'SET_COURSE',
        skipped: false,
      },
      narrative: {
        triggeredEventIds: ['first_wake', 'first_steer'],
        resonanceFlags: ['intro_1420'],
      },
    };

    await saveMgr.saveJourney(slot);

    const hasSave = await saveMgr.hasSavedJourney();
    expect(hasSave).toBe(true);

    const retrieved = await saveMgr.getSaveSlot('current_journey');
    expect(retrieved).toBeDefined();
    expect(retrieved?.universeSeed).toBe('TEST-UNIVERSE-99');
    expect(retrieved?.playerSector.x).toBe(4);
    expect(retrieved?.stats.systemsVisited).toBe(3);
  });

  it('records and queries discoveries across categories', async () => {
    const disc: DiscoveryRecord = {
      id: 'planet-zephyr-alpha',
      type: 'planet',
      name: 'Zephyr Prime',
      systemName: 'Aurelia System',
      sector: { x: 0, y: 0, z: 0 },
      timestamp: Date.now(),
      details: 'Arid desert world with ancient monolithic formations',
      category: 'WORLDS',
    };

    await saveMgr.recordDiscovery(disc);

    const all = await saveMgr.getAllDiscoveries();
    expect(all.length).toBeGreaterThan(0);
    const found = all.find(d => d.id === 'planet-zephyr-alpha');
    expect(found).toBeDefined();
    expect(found?.name).toBe('Zephyr Prime');
    expect(found?.category).toBe('WORLDS');
  });

  it('adds and retrieves ship log journal entries', async () => {
    const entry: JournalEntry = {
      id: 'journal-001',
      timestamp: Date.now(),
      title: 'Arrival at Aurelia',
      content: 'Standard orbital entry confirmed. Atmospheric scanners picking up faint tectonic hum.',
      sector: { x: 0, y: 0, z: 0 },
      tags: ['Aurelia', 'Tectonic', 'First Contact'],
    };

    await saveMgr.addJournalEntry(entry);

    const entries = await saveMgr.getJournalEntries();
    expect(entries.length).toBeGreaterThan(0);
    const found = entries.find(e => e.id === 'journal-001');
    expect(found).toBeDefined();
    expect(found?.title).toBe('Arrival at Aurelia');
  });
});
