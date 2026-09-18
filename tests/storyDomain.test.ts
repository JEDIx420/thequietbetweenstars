import { describe, it, expect, beforeEach } from 'vitest';
import { SaveManager } from '../src/persistence/SaveManager';
import { StoryDirector } from '../src/story/StoryDirector';
import { StoryEncounterPlanner } from '../src/story/StoryEncounterPlanner';
import type { StarSystemDescriptor } from '../src/game/systems/PlanetDescriptor';

describe('Story Domain & Save v5 Migration', () => {
  let saveMgr: SaveManager;

  beforeEach(async () => {
    saveMgr = new SaveManager();
    await saveMgr.init();
    await saveMgr.clearJourney('current_journey');
  });

  it('migrates v4 save slot to v5 with default story state', async () => {
    const v4Slot: any = {
      slotId: 'current_journey',
      saveVersion: 4,
      updatedAt: Date.now(),
      universeSeed: 'UNIVERSE-TEST-V4',
      playerSector: { x: 1, y: 0, z: 2 },
      playerLocalPos: { x: 0, y: 0, z: 100 },
      currentSystem: null,
      flightPhase: 'SYSTEM_CRUISE',
      credits: 300,
      sampleInventory: {},
      installedModules: [],
      pendingOrders: [],
      npcMemories: {},
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
        flightTimeSeconds: 50,
      },
      tutorial: { started: true, completed: true, step: 'COMPLETED', skipped: false },
      narrative: { triggeredEventIds: [], resonanceFlags: [] },
    };

    // Save as v4
    await (saveMgr as any).saveLocalStorageFallback();
    // Directly save and get
    await saveMgr.saveJourney(v4Slot);
    const loaded = await saveMgr.getSaveSlot();

    expect(loaded).not.toBeNull();
    expect(loaded!.saveVersion).toBe(5);
    expect(loaded!.story).toBeDefined();
    expect(loaded!.story!.activeChapter).toBe(1);
    expect(loaded!.story!.currentBeat).toBe('beat_0_awakening');
  });

  it('StoryDirector manages beats, fragments and events', () => {
    const director = new StoryDirector();
    const events: any[] = [];
    director.subscribe((e) => events.push(e));

    expect(director.getState().currentBeat).toBe('beat_0_awakening');

    director.advanceBeat('beat_1_first_whisper');
    expect(director.getState().currentBeat).toBe('beat_1_first_whisper');
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('STORY_BEAT_TRIGGERED');

    // Emit fragment recovered
    director.emit({
      type: 'FRAGMENT_RECOVERED',
      payload: {
        fragment: {
          id: 'fragment_alpha',
          name: 'Echo of the First Builders',
          frequency: 432.8,
          originBeat: 'beat_1_first_whisper',
          description: 'A crystalline fragment pulsing with ancient harmonics.',
          dataPayload: 'ENC-ALPHA-99',
          decrypted: false,
          codexId: 'codex_fragment_alpha',
          recoveredAt: Date.now(),
        },
      },
      timestamp: Date.now(),
    });

    // Should advance to beat_2_station_contact
    expect(director.getState().currentBeat).toBe('beat_2_station_contact');
    expect(director.getState().resonanceFragments.length).toBe(1);

    // Dock at station
    director.emit({
      type: 'STATION_DOCKED',
      payload: { stationId: 'station_epsilon_7' },
      timestamp: Date.now(),
    });
    expect(director.getState().currentBeat).toBe('beat_3_fragment_alpha');
    expect(director.getState().visitedStations).toContain('station_epsilon_7');
    expect(director.getState().npcMemories['dr_vance'].timesMet).toBe(1);

    // Recover fragment beta
    director.emit({
      type: 'FRAGMENT_RECOVERED',
      payload: {
        fragment: {
          id: 'fragment_beta',
          name: 'Survey Craft Flight Core',
          frequency: 528.0,
          originBeat: 'beat_3_fragment_alpha',
          description: 'Decrypted flight telemetry.',
          dataPayload: 'ENC-BETA-01',
          decrypted: false,
          codexId: 'codex_fragment_beta',
          recoveredAt: Date.now(),
        },
      },
      timestamp: Date.now(),
    });
    expect(director.getState().currentBeat).toBe('beat_4_decryption');

    // Decrypt fragments
    director.emit({
      type: 'FRAGMENT_DECRYPTED',
      payload: { fragmentId: 'fragment_alpha' },
      timestamp: Date.now(),
    });
    director.emit({
      type: 'FRAGMENT_DECRYPTED',
      payload: { fragmentId: 'fragment_beta' },
      timestamp: Date.now(),
    });

    // Both decrypted advances to beat_5_relay_coordinates
    expect(director.getState().currentBeat).toBe('beat_5_relay_coordinates');

    // Hail Zephyr
    director.emit({
      type: 'VESSEL_HAILED',
      payload: { vesselId: 'the_wanderer_7' },
      timestamp: Date.now(),
    });
    expect(director.getState().currentBeat).toBe('beat_6_relay_alignment');
    expect(director.getState().npcMemories['captain_zephyr'].timesMet).toBe(1);

    // Align all 3 pillars
    director.emit({
      type: 'RELAY_PILLAR_ALIGNED',
      payload: { pillarIndex: 0 },
      timestamp: Date.now(),
    });
    director.emit({
      type: 'RELAY_PILLAR_ALIGNED',
      payload: { pillarIndex: 1 },
      timestamp: Date.now(),
    });
    director.emit({
      type: 'RELAY_PILLAR_ALIGNED',
      payload: { pillarIndex: 2 },
      timestamp: Date.now(),
    });

    expect(director.getState().harmonicRelayState.activated).toBe(true);
    expect(director.getState().currentBeat).toBe('beat_7_chapter1_climax');
  });

  it('StoryEncounterPlanner plans appropriate injections for current story beat', () => {
    const director = new StoryDirector();
    const mockSystem: StarSystemDescriptor = {
      id: 'sys-alpha',
      seed: 12345,
      name: 'System Alpha',
      sectorX: 0,
      sectorY: 0,
      sectorZ: 0,
      star: {
        id: 'star-alpha',
        name: 'Alpha Prime',
        spectralClass: 'G',
        radius: 140,
        lightColor: 0xfff3d6,
        temperature: 5778,
        coronaColor: 0xf59e0b,
      },
      planets: [],
      anomalies: [],
    };

    // Advance to beat 1 and verify resonance anomaly injection
    director.advanceBeat('beat_1_first_whisper');
    const planBeat1 = StoryEncounterPlanner.planSystem(mockSystem, director);
    expect(planBeat1.injectedAnomalies.length).toBe(1);
    expect(planBeat1.injectedAnomalies[0].signature?.isResonanceAnomaly).toBe(true);

    // Advance to beat 2 (station contact)
    director.advanceBeat('beat_2_station_contact');
    const planBeat2 = StoryEncounterPlanner.planSystem(mockSystem, director);
    expect(planBeat2.injectedStation).toBeDefined();
    expect(planBeat2.injectedStation!.id).toBe('station_epsilon_7');

    // Advance to beat 5 (relay coordinates)
    director.advanceBeat('beat_5_relay_coordinates');
    const planBeat5 = StoryEncounterPlanner.planSystem(mockSystem, director);
    expect(planBeat5.injectedRelay).toBeDefined();
    expect(planBeat5.injectedVessel).toBeDefined();
    expect(planBeat5.injectedVessel!.id).toBe('the_wanderer_7');
  });

  it('supports Free Exploration sandbox mode toggling and events', () => {
    const director = new StoryDirector();
    const events: any[] = [];
    director.subscribe((e) => events.push(e));

    expect(director.isFreeExploration()).toBe(false);

    director.setFreeExploration(true);
    expect(director.isFreeExploration()).toBe(true);
    expect(events.some((e) => e.type === 'FREE_EXPLORATION_TOGGLED' && e.payload.enabled === true)).toBe(true);

    director.setFreeExploration(false);
    expect(director.isFreeExploration()).toBe(false);
    expect(events.some((e) => e.type === 'FREE_EXPLORATION_TOGGLED' && e.payload.enabled === false)).toBe(true);
  });
});
