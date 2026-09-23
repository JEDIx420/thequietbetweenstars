import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { NavRadar } from '../src/game/ui/NavRadar';
import { AutopilotController } from '../src/game/flight/AutopilotController';
import { FlightModel } from '../src/game/core/flightModel';
import { StagedScanHUD } from '../src/game/ui/StagedScanHUD';
import { StoryObjectiveHUD } from '../src/story/StoryObjectiveHUD';
import { MissionHelpModal } from '../src/ui/MissionHelpModal';
import { CHAPTER_1_BEATS } from '../src/story/chapters/Chapter1Resonance';
import { StoryDirector } from '../src/story/StoryDirector';
import { StoryEncounterPlanner } from '../src/story/StoryEncounterPlanner';
import { StarSystemGenerator } from '../src/game/systems/StarSystemGenerator';
import type { SpaceAnomalyDescriptor } from '../src/game/systems/PlanetDescriptor';

// Headless DOM mock for Node vitest runner
class MockDOMElement {
  public id = '';
  public innerHTML = '';
  public textContent = '';
  public style: Record<string, any> = {};
  public children: any[] = [];
  public classSet = new Set<string>();
  public width = 140;
  public height = 140;

  getContext() {
    return {
      clearRect: () => {},
      beginPath: () => {},
      arc: () => {},
      stroke: () => {},
      strokeRect: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      fill: () => {},
      createRadialGradient: () => ({
        addColorStop: () => {},
      }),
      fillText: () => {},
      drawImage: () => {},
      setLineDash: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
    };
  }

  public get classList() {
    return {
      add: (c: string) => this.classSet.add(c),
      remove: (c: string) => this.classSet.delete(c),
      toggle: (c: string, force?: boolean) => {
        if (force !== undefined) {
          if (force) this.classSet.add(c);
          else this.classSet.delete(c);
          return force;
        }
        if (this.classSet.has(c)) {
          this.classSet.delete(c);
          return false;
        } else {
          this.classSet.add(c);
          return true;
        }
      },
      contains: (c: string) => this.classSet.has(c),
    };
  }

  appendChild(el: any) {
    this.children.push(el);
    return el;
  }
  remove() {}
  addEventListener() {}
  removeEventListener() {}
  querySelector(selector: string): any {
    if (selector.startsWith('#') && this.id === selector.slice(1)) return this;
    for (const child of this.children) {
      if (child.id === selector.replace('#', '') || child.className === selector.replace('.', '')) {
        return child;
      }
      const found = child.querySelector?.(selector);
      if (found) return found;
    }
    return new MockDOMElement();
  }
}

if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    createElement: () => new MockDOMElement(),
  };
}
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: (fn: Function) => setTimeout(fn, 0),
    clearTimeout: (id: any) => clearTimeout(id),
  };
}

describe('Mission Help and UI UX Improvements', () => {
  let parentEl: any;

  beforeEach(() => {
    parentEl = new MockDOMElement();
  });

  describe('1. StagedScanHUD Compactness & Sleek UI', () => {
    it('creates a compact HUD with narrow footprint and slim progress bar', () => {
      const hud = new StagedScanHUD(parentEl);

      const anomaly: SpaceAnomalyDescriptor = {
        id: 'story_anom_resonance_alpha',
        name: 'Resonance Monolith Prime',
        type: 'RESONANCE_ECHO',
        distanceFromStar: 1200,
        angle: 1.0,
        position: { x: 1200, y: 150, z: -1800 },
        color: '#38bdf8',
        radius: 45,
        description: 'A crystalline structure vibrating in perfect harmonic resonance.',
        scanned: false,
        hasResonance: true,
        discovered: false,
        currentStage: 1,
        scanProgress: 0.45,
        signature: {
          frequency: 432.8,
          intensity: 0.95,
          harmonicPattern: 'Phi-1.618-Harmonic',
          isResonanceAnomaly: true,
          tier: 1,
          frequencyLabel: '432.8 Hz',
          baseValue: 400,
        },
      };

      hud.update(anomaly, 600, true, false);

      // Verify progress update runs cleanly and updates elements
      expect((hud as any).lastStage).toBe(1);
      expect((hud as any).titleEl.textContent).toBe('RESONANCE MONOLITH PRIME');
      expect((hud as any).freqBadgeEl.textContent).toBe('432.8 Hz');
      expect((hud as any).progressBarFillEl.style.width).toBe('45%');

      hud.dispose();
    });
  });

  describe('2. Collapsible StoryObjectiveHUD in Free Roam and Missions', () => {
    it('allows collapsing and expanding the mission HUD', () => {
      const hud = new StoryObjectiveHUD(parentEl);
      const director = StoryDirector.getInstance();
      director.reset();
      director.advanceBeat('beat_1_first_whisper');
      const state = director.getState();

      hud.update(state);
      expect((hud as any).isCollapsed).toBe(false);

      // Trigger collapse
      hud.toggleCollapse();
      expect((hud as any).isCollapsed).toBe(true);

      // Trigger expand
      hud.toggleCollapse();
      expect((hud as any).isCollapsed).toBe(false);

      // When free roam is enabled
      director.setFreeExploration(true);
      hud.update(director.getState());
      expect((hud as any).chapterEl.textContent).toContain('FREE ROAM');

      hud.dispose();
    });
  });

  describe('3. MissionHelpModal Contextual Guidance', () => {
    it('generates guidance for Chapter 1 beats and Free Roam mode', () => {
      const modal = new MissionHelpModal(parentEl);
      const director = StoryDirector.getInstance();

      // Test Free Roam Guidance
      director.setFreeExploration(true);
      modal.open(director.getState(), false);
      expect(modal.getIsOpen()).toBe(true);
      modal.close();
      expect(modal.getIsOpen()).toBe(false);

      // Test Beat 1 Guidance
      director.setFreeExploration(false);
      director.reset();
      modal.open(director.getState(), false);
      expect(modal.getIsOpen()).toBe(true);
      modal.close();

      director.advanceBeat('beat_1_first_whisper');
      const tip = (modal as any).generateTipContent(director.getState(), false);
      expect(tip.title).toContain('RESONANCE MONOLITH PRIME');
      expect(tip.steps.some((s: string) => s.includes('1500 meters'))).toBe(true);

      modal.dispose();
    });
  });

  describe('4. Story & Map Entity Name Consistency', () => {
    it('ensures origin system is Solara and entities match exactly', () => {
      const originSystem = StarSystemGenerator.generateSystem('test_universe', 0, 0, 0);
      expect(originSystem.name).toBe('Solara');

      // Beat 1: Resonance Monolith Prime
      expect(CHAPTER_1_BEATS.beat_1_first_whisper.objective).toContain('Resonance Monolith Prime');
      expect(CHAPTER_1_BEATS.beat_1_first_whisper.objective).toContain('Solara system');

      // Beat 2: Research Outpost Epsilon-7 & Bay 03
      expect(CHAPTER_1_BEATS.beat_2_station_contact.objective).toContain('Research Outpost Epsilon-7');
      expect(CHAPTER_1_BEATS.beat_2_station_contact.objective).toContain('Bay 03');

      // Beat 3: Derelict Survey Craft Alpha-9
      expect(CHAPTER_1_BEATS.beat_3_fragment_alpha.objective).toContain('Derelict Survey Craft Alpha-9');

      // Beat 4: Signal Lab at Research Outpost Epsilon-7
      expect(CHAPTER_1_BEATS.beat_4_decryption.objective).toContain('Research Outpost Epsilon-7');

      // Beat 5: First Harmonic Relay: Spires of the Quiet
      expect(CHAPTER_1_BEATS.beat_5_relay_coordinates.objective).toContain(
        'First Harmonic Relay: Spires of the Quiet'
      );

      // Injected encounters match the same names
      const director = StoryDirector.getInstance();
      director.setFreeExploration(false);
      director.reset();
      director.advanceBeat('beat_1_first_whisper');

      const plan1 = StoryEncounterPlanner.planSystem(originSystem, director);
      expect(plan1.injectedAnomalies[0].name).toBe('Resonance Monolith Prime');

      director.advanceBeat('beat_2_station_contact');
      const plan2 = StoryEncounterPlanner.planSystem(originSystem, director);
      expect(plan2.injectedStation?.name).toBe('Research Outpost Epsilon-7');

      director.advanceBeat('beat_3_fragment_alpha');
      const plan3 = StoryEncounterPlanner.planSystem(originSystem, director);
      expect(plan3.injectedAnomalies[0].name).toBe('Derelict Survey Craft Alpha-9');
    });
  });

  describe('5. Story Objective Minimap Markers and Autopilot Tracking', () => {
    it('retrieves active objective target dynamically across beats and suppresses in free roam', () => {
      const director = StoryDirector.getInstance();
      director.reset();

      // Beat 0: no active objective
      expect(director.getActiveObjectiveTarget()).toBeNull();

      // Beat 1: Monolith
      director.advanceBeat('beat_1_first_whisper');
      const beat1Target = director.getActiveObjectiveTarget();
      expect(beat1Target?.targetId).toBe('story_anom_resonance_alpha');
      expect(beat1Target?.label).toBe('Resonance Monolith Prime');

      // Beat 2: Station Epsilon-7
      director.advanceBeat('beat_2_station_contact');
      const beat2Target = director.getActiveObjectiveTarget();
      expect(beat2Target?.targetId).toBe('station_epsilon_7');
      expect(beat2Target?.label).toBe('Research Outpost Epsilon-7');

      // Free roam suppresses active objective
      director.setFreeExploration(true);
      expect(director.getActiveObjectiveTarget()).toBeNull();
      director.setFreeExploration(false);
      expect(director.getActiveObjectiveTarget()?.targetId).toBe('station_epsilon_7');
    });

    it('manages active story objective on NavRadar and fires track callback', () => {
      const shipGroup = new THREE.Group();
      const flightModel = new FlightModel(shipGroup);
      const autopilot = new AutopilotController(flightModel);
      const radar = new NavRadar(parentEl, autopilot);

      radar.setActiveStoryObjective('story_anom_resonance_alpha', 'Resonance Monolith Prime');
      expect(radar.getActiveStoryObjectiveId()).toBe('story_anom_resonance_alpha');
      expect(radar.getActiveStoryObjectiveLabel()).toBe('Resonance Monolith Prime');

      const anomaly: SpaceAnomalyDescriptor = {
        id: 'story_anom_resonance_alpha',
        name: 'Resonance Monolith Prime',
        type: 'RESONANCE_ECHO',
        distanceFromStar: 1200,
        angle: 1.0,
        position: { x: 1200, y: 150, z: -1800 },
        color: '#38bdf8',
        radius: 45,
        description: 'Harmonic resonance monolith.',
        scanned: false,
        hasResonance: true,
        discovered: false,
      };

      radar.setPlanets([], [anomaly]);
      expect(radar.hasTargetId('story_anom_resonance_alpha')).toBe(true);

      const selected = radar.selectActiveStoryObjective();
      expect(selected).toBe(true);
      expect(radar.getSelectedTarget()?.id).toBe('story_anom_resonance_alpha');

      let trackFiredWith: string | null = null;
      radar.setOnTrackObjective((targetId: string) => {
        trackFiredWith = targetId;
      });

      // Update radar rendering
      radar.update(new THREE.Vector3(0, 0, 0), new THREE.Quaternion(), new THREE.Vector3(0, 0, 5000));

      const infoHtml = (radar as any).targetInfoEl.innerHTML;
      expect(infoHtml).toContain('✦ MISSION');
      expect(infoHtml).toContain('TRACK OBJECTIVE');

      // Trigger track callback
      (radar as any).onTrackObjectiveCallback?.('story_anom_resonance_alpha');
      expect(trackFiredWith).toBe('story_anom_resonance_alpha');

      radar.dispose();
    });

    it('provides track button on StoryObjectiveHUD during story and triggers callback', () => {
      const hud = new StoryObjectiveHUD(parentEl);
      const director = StoryDirector.getInstance();
      director.reset();
      director.advanceBeat('beat_1_first_whisper');

      let trackClicked = false;
      hud.setOnTrackObjective(() => {
        trackClicked = true;
      });

      hud.update(director.getState());
      const trackBtn = (hud as any).trackBtn;
      expect(trackBtn).toBeDefined();
      expect(trackBtn.style.display).not.toBe('none');

      // In free roam mode, track button is hidden
      director.setFreeExploration(true);
      hud.update(director.getState());
      expect(trackBtn.style.display).toBe('none');

      // Click callback
      (hud as any).onTrackObjectiveCallback?.();
      expect(trackClicked).toBe(true);

      hud.dispose();
    });
  });
});

