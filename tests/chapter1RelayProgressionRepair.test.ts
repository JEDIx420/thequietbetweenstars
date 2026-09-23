import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { StoryDirector } from '../src/story/StoryDirector';
import { HarmonicRelay } from '../src/game/structures/HarmonicRelay';
import { SpaceInteractionController } from '../src/game/interaction/SpaceInteractionController';
import { StoryObjectiveHUD } from '../src/story/StoryObjectiveHUD';
import { StoryPresentationDirector } from '../src/story/StoryPresentationDirector';
import { SaveManager } from '../src/persistence/SaveManager';
import { DEFAULT_STORY_STATE, cloneStoryState } from '../src/story/StoryState';
import type { StoryState } from '../src/story/StoryTypes';

// Headless mock DOM for testing in Node.js
class MockDOMElement {
  public id = '';
  public innerHTML = '';
  public textContent = '';
  public style: Record<string, any> = {};
  public children: any[] = [];
  public classList = {
    add: () => {},
    remove: () => {},
    toggle: () => {},
    contains: () => false,
  };

  appendChild(el: any) {
    this.children.push(el);
    return el;
  }
  remove() {}
  addEventListener() {}
  removeEventListener() {}
  querySelector() {
    return new MockDOMElement();
  }
  querySelectorAll() {
    return [];
  }
}

if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    createElement: () => new MockDOMElement(),
  };
}

describe('Chapter 1 Harmonic Relay Progression & Save Repair', () => {
  let director: StoryDirector;

  beforeEach(() => {
    director = new StoryDirector();
  });

  describe('1. Normal progression flow', () => {
    it('advances from beat 5 -> beat 6 on Zephyr hail, then beat 6 -> beat 7 upon aligning 3 pillars', () => {
      // Advance to beat 5
      director.advanceBeat('beat_5_relay_coordinates');
      expect(director.getState().currentBeat).toBe('beat_5_relay_coordinates');

      // Hail Captain Zephyr
      director.emit({
        type: 'VESSEL_HAILED',
        payload: { vesselId: 'the_wanderer_7' },
        timestamp: Date.now(),
      });
      expect(director.getState().currentBeat).toBe('beat_6_relay_alignment');

      // Align pillars one by one
      director.emit({
        type: 'RELAY_PILLAR_ALIGNED',
        payload: { pillarIndex: 0 },
        timestamp: Date.now(),
      });
      expect(director.getState().currentBeat).toBe('beat_6_relay_alignment');
      expect(director.getState().harmonicRelayState.alignedPillars).toEqual([0]);

      director.emit({
        type: 'RELAY_PILLAR_ALIGNED',
        payload: { pillarIndex: 1 },
        timestamp: Date.now(),
      });
      expect(director.getState().currentBeat).toBe('beat_6_relay_alignment');
      expect(director.getState().harmonicRelayState.alignedPillars).toEqual([0, 1]);

      director.emit({
        type: 'RELAY_PILLAR_ALIGNED',
        payload: { pillarIndex: 2 },
        timestamp: Date.now(),
      });
      expect(director.getState().currentBeat).toBe('beat_7_chapter1_climax');
      expect(director.getState().harmonicRelayState.alignedPillars).toEqual([0, 1, 2]);
      expect(director.getState().harmonicRelayState.activated).toBe(true);
      expect(director.getState().completedBeats).toContain('beat_6_relay_alignment');
    });
  });

  describe('2. Out-of-order alignment flow (root cause prevention)', () => {
    it('advances directly to beat 7 if pillars are aligned before hailing Zephyr, and later hail does not regress beat', () => {
      director.advanceBeat('beat_5_relay_coordinates');

      // Player flies straight to relay and aligns pillars before hailing Zephyr
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

      // Should advance directly to beat_7_chapter1_climax
      expect(director.getState().currentBeat).toBe('beat_7_chapter1_climax');
      expect(director.getState().harmonicRelayState.activated).toBe(true);

      // Player subsequently hails Captain Zephyr
      director.emit({
        type: 'VESSEL_HAILED',
        payload: { vesselId: 'the_wanderer_7' },
        timestamp: Date.now(),
      });

      // Must remain at beat_7_chapter1_climax, NOT regressing to beat 6!
      expect(director.getState().currentBeat).toBe('beat_7_chapter1_climax');
    });
  });

  describe('3. Canonical save repair for existing broken saves', () => {
    it('repairs a save stuck on beat_6_relay_alignment with activated=true and [0,1,2] pillars', () => {
      const brokenSavedStory: StoryState = {
        ...cloneStoryState(DEFAULT_STORY_STATE),
        currentBeat: 'beat_6_relay_alignment',
        completedBeats: ['beat_0_awakening', 'beat_1_first_whisper', 'beat_2_station_contact', 'beat_3_fragment_alpha', 'beat_4_decryption', 'beat_5_relay_coordinates'],
        visitedStations: ['station_epsilon_7'],
        harmonicRelayState: {
          ...DEFAULT_STORY_STATE.harmonicRelayState,
          alignedPillars: [0, 1, 2],
          activated: true,
        },
      };

      const repaired = director.loadState(brokenSavedStory);

      expect(repaired).toBe(true);
      expect(director.getState().currentBeat).toBe('beat_7_chapter1_climax');
      expect(director.getState().completedBeats).toContain('beat_6_relay_alignment');
      expect(director.getState().harmonicRelayState.activated).toBe(true);
      expect(director.getActiveObjectiveTarget()).toBeNull();
    });

    it('repairs an unsorted, duplicated pillar list and activates relay', () => {
      const dirtyState: StoryState = {
        ...cloneStoryState(DEFAULT_STORY_STATE),
        currentBeat: 'beat_6_relay_alignment',
        completedBeats: ['beat_0_awakening'],
        harmonicRelayState: {
          ...DEFAULT_STORY_STATE.harmonicRelayState,
          alignedPillars: [2, 0, 1, 0, 2],
          activated: false,
        },
      };

      const repaired = director.loadState(dirtyState);

      expect(repaired).toBe(true);
      expect(director.getState().harmonicRelayState.alignedPillars).toEqual([0, 1, 2]);
      expect(director.getState().harmonicRelayState.activated).toBe(true);
      expect(director.getState().currentBeat).toBe('beat_7_chapter1_climax');
    });

    it('returns false when loading an already consistent state without mutations', () => {
      const healthyState: StoryState = {
        ...cloneStoryState(DEFAULT_STORY_STATE),
        currentBeat: 'beat_7_chapter1_climax',
        completedBeats: ['beat_0_awakening', 'beat_6_relay_alignment', 'beat_7_chapter1_climax'],
        harmonicRelayState: {
          ...DEFAULT_STORY_STATE.harmonicRelayState,
          alignedPillars: [0, 1, 2],
          activated: true,
        },
      };

      const repaired = director.loadState(healthyState);
      expect(repaired).toBe(false);
      expect(director.getState().currentBeat).toBe('beat_7_chapter1_climax');
    });
  });

  describe('4. HarmonicRelay rehydration & silent state restoration', () => {
    it('restores partial alignment silently without emitting story events', () => {
      const relay = new HarmonicRelay({
        id: 'harmonic_relay_prime',
        name: 'First Harmonic Relay',
        position: new THREE.Vector3(0, 0, 0),
      });

      const events: any[] = [];
      director.subscribe((e) => events.push(e));

      // Restore partial state (pillars 0 and 2)
      relay.restoreFromState({
        alignedPillars: [0, 2],
        activated: false,
      });

      expect(relay.alignedCount).toBe(2);
      expect(relay.isActivated).toBe(false);
      // No story events should have been emitted
      expect(events.length).toBe(0);

      relay.dispose();
    });

    it('restores fully activated relay silently without emitting events', () => {
      const relay = new HarmonicRelay({
        id: 'harmonic_relay_prime',
        name: 'First Harmonic Relay',
        position: new THREE.Vector3(0, 0, 0),
      });

      const events: any[] = [];
      director.subscribe((e) => events.push(e));

      relay.restoreFromState({
        alignedPillars: [0, 1, 2],
        activated: true,
      });

      expect(relay.alignedCount).toBe(3);
      expect(relay.isActivated).toBe(true);
      expect(events.length).toBe(0);

      relay.dispose();
    });
  });

  describe('5. Duplicate interaction idempotency & safety', () => {
    it('rejects further pillar alignments and activations once activated', () => {
      const relay = new HarmonicRelay({
        id: 'harmonic_relay_prime',
        name: 'First Harmonic Relay',
        position: new THREE.Vector3(0, 0, 0),
      });

      relay.restoreFromState({
        alignedPillars: [0, 1, 2],
        activated: true,
      });

      const events: any[] = [];
      director.subscribe((e) => events.push(e));

      // Attempting to align an already activated relay must return false and emit nothing
      const res = relay.alignPillar(0, director);
      expect(res).toBe(false);
      expect(events.length).toBe(0);

      // Attempting to activate again must be a no-op
      relay.activateRelay(director);
      expect(events.length).toBe(0);

      relay.dispose();
    });

    it('SpaceInteractionController safely handles interaction with activated relay', () => {
      const dialoguePresenter = {
        enqueue: vi.fn(),
      } as any;

      const controller = new SpaceInteractionController(director, {} as any, dialoguePresenter);

      const relay = new HarmonicRelay({
        id: 'harmonic_relay_prime',
        name: 'First Harmonic Relay',
        position: new THREE.Vector3(0, 0, 0),
      });
      relay.restoreFromState({
        alignedPillars: [0, 1, 2],
        activated: true,
      });

      let noticeShown = '';
      const callbacks = {
        isTriggered: true,
        showNotice: (msg: string) => { noticeShown = msg; },
        saveJourney: vi.fn(),
        addCredits: vi.fn(),
      };

      const lockedTarget = {
        type: 'relay' as const,
        id: relay.id,
        name: relay.name,
        position: new THREE.Vector3(0, 0, 0),
        data: relay,
      };

      controller.handleSpaceAction(
        lockedTarget as any,
        new THREE.Vector3(10, 0, 0),
        0.016,
        callbacks as any
      );

      expect(noticeShown).toContain('FIRST HARMONIC RELAY // STATUS: SYNCHRONIZED');
      expect(callbacks.saveJourney).not.toHaveBeenCalled();

      relay.dispose();
    });
  });

  describe('6. Climax presentation and objective HUD behavior', () => {
    it('StoryPresentationDirector plays climax presentation and marks beat 7 complete', () => {
      const dialoguePresenter = {
        enqueue: vi.fn(),
      } as any;

      const container = document.createElement('div');
      const hud = new StoryObjectiveHUD(container);

      let saved = false;
      let hudNotice = '';

      const presentation = new StoryPresentationDirector(
        director,
        dialoguePresenter,
        hud,
        {
          reconcileWorldState: vi.fn(),
          highlightNavigationTarget: vi.fn(),
          showHudNotice: (msg) => { hudNotice = msg; },
          saveJourney: () => { saved = true; },
        }
      );

      director.advanceBeat('beat_7_chapter1_climax');
      presentation.playChapter1ClimaxPresentation();

      expect(hudNotice).toContain('GATEWAY AWAKENED // CHAPTER 1 COMPLETE: THE RESONANCE');
      expect(dialoguePresenter.enqueue).toHaveBeenCalled();
      expect(director.getState().completedBeats).toContain('beat_7_chapter1_climax');
      expect(saved).toBe(true);

      // Objective HUD and StoryDirector should display Chapter 1 complete
      expect(director.isChapter1Complete()).toBe(true);
      expect((hud as any).chapterEl.textContent).toContain('CHAPTER 1 // THE RESONANCE: COMPLETE');
    });
  });

  describe('7. SaveManager persistence roundtrip with auto-repair', () => {
    it('saves and loads journey with automatic story repair', async () => {
      const saveMgr = new SaveManager();
      await saveMgr.init();
      await saveMgr.clearJourney('current_journey');

      // Craft a broken save slot as if written by the previous buggy version
      const brokenSlot: any = {
        slotId: 'current_journey',
        saveVersion: 5,
        updatedAt: Date.now(),
        universeSeed: 'TEST-UNIVERSE',
        playerSector: { x: 0, y: 0, z: 0 },
        playerLocalPos: { x: 0, y: 0, z: 0 },
        currentSystem: null,
        flightPhase: 'SYSTEM_CRUISE',
        credits: 100,
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
          flightTimeSeconds: 100,
        },
        tutorial: { started: true, completed: true, step: 'COMPLETED', skipped: false },
        narrative: { triggeredEventIds: [], resonanceFlags: [] },
        story: {
          ...cloneStoryState(DEFAULT_STORY_STATE),
          currentBeat: 'beat_6_relay_alignment',
          completedBeats: ['beat_0_awakening', 'beat_5_relay_coordinates'],
          harmonicRelayState: {
            ...DEFAULT_STORY_STATE.harmonicRelayState,
            alignedPillars: [0, 1, 2],
            activated: true,
          },
        },
      };

      await saveMgr.saveJourney(brokenSlot);

      const loadedSlot = await saveMgr.getSaveSlot();
      expect(loadedSlot).not.toBeNull();

      // Simulate DesktopApp load process
      const testDirector = new StoryDirector();
      const repaired = testDirector.loadState(loadedSlot!.story!);
      expect(repaired).toBe(true);
      expect(testDirector.getState().currentBeat).toBe('beat_7_chapter1_climax');

      // Save repaired state
      loadedSlot!.story = testDirector.getState();
      await saveMgr.saveJourney(loadedSlot!);

      // Reload and verify it is permanently repaired
      const reloadedSlot = await saveMgr.getSaveSlot();
      const secondDirector = new StoryDirector();
      const repairedAgain = secondDirector.loadState(reloadedSlot!.story!);
      expect(repairedAgain).toBe(false);
      expect(secondDirector.getState().currentBeat).toBe('beat_7_chapter1_climax');
      expect(secondDirector.getState().harmonicRelayState.activated).toBe(true);
    });
  });
});
