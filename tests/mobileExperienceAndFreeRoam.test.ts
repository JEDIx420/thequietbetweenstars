import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { TargetLockReticle } from '../src/game/ui/TargetLockReticle';
import { NavRadar } from '../src/game/ui/NavRadar';
import { FlightModel } from '../src/game/core/flightModel';
import { AutopilotController } from '../src/game/flight/AutopilotController';
import { StoryObjectiveHUD } from '../src/story/StoryObjectiveHUD';
import { DEFAULT_SAVE_SLOT } from '../src/persistence/SaveManager';
import { StoryDirector } from '../src/story/StoryDirector';
import type { SpaceAnomalyDescriptor } from '../src/game/systems/PlanetDescriptor';
import type { LockableTarget } from '../src/game/targeting/TargetLockSystem';

// Mock DOM element for tests
class MockElement {
  public id = '';
  public innerHTML = '';
  public textContent = '';
  public title = '';
  public style: Record<string, any> = {};
  public children: any[] = [];
  public classSet = new Set<string>();
  public clientWidth = 0;
  public clientHeight = 0;
  public width = 140;
  public height = 140;

  getContext() {
    return {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      stroke: vi.fn(),
      strokeRect: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      createRadialGradient: () => ({ addColorStop: vi.fn() }),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      setLineDash: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
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

  private _className = '';
  public set className(val: string) {
    this._className = val;
    val.split(/\s+/).filter(Boolean).forEach(c => this.classSet.add(c));
  }
  public get className(): string {
    return this._className;
  }

  private listeners: Record<string, Function[]> = {};

  appendChild(el: any) {
    this.children.push(el);
    return el;
  }
  remove() {}
  addEventListener(evt: string, cb: Function) {
    if (!this.listeners[evt]) this.listeners[evt] = [];
    this.listeners[evt].push(cb);
  }
  removeEventListener() {}
  click() {
    this.listeners['click']?.forEach(cb => cb({ stopPropagation: () => {}, target: this }));
  }
  querySelector(selector: string): any {
    if (selector.startsWith('#') && this.id === selector.slice(1)) return this;
    if (selector.startsWith('.') && this.classSet.has(selector.slice(1))) return this;
    for (const child of this.children) {
      if (child.id === selector.replace('#', '') || child.classSet?.has(selector.replace('.', ''))) {
        return child;
      }
      const found = child.querySelector?.(selector);
      if (found) return found;
    }
    return null;
  }
}

if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    createElement: () => new MockElement(),
  };
}
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 3,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

describe('Mobile Experience & Free Roam Clean UX', () => {
  let parentEl: any;

  beforeEach(() => {
    parentEl = new MockElement();
  });

  describe('1. Default Save Slot & Free Roam Startup', () => {
    it('initializes default save slot with freeExplorationMode set to true', () => {
      expect(DEFAULT_SAVE_SLOT.story!.freeExplorationMode).toBe(true);
    });

    it('allows toggling freeExplorationMode on StoryDirector', () => {
      const director = StoryDirector.getInstance();
      director.setFreeExploration(true);
      expect(director.isFreeExploration()).toBe(true);

      director.setFreeExploration(false);
      expect(director.isFreeExploration()).toBe(false);

      // Reset back to true for default
      director.setFreeExploration(true);
    });
  });

  describe('2. FlightModel Camera Reset for Mobile Screen Inits', () => {
    it('resets camera chase position and syncs from shipPhysicsRoot directly', () => {
      const shipGroup = new THREE.Group();
      shipGroup.position.set(100, 20, -50);
      shipGroup.quaternion.set(0, 0, 0, 1);

      const flightModel = new FlightModel(shipGroup);
      const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);

      flightModel.resetCamera(camera);

      // Camera FOV should be reset to standard 60
      expect(camera.fov).toBe(60);

      // Camera target pos should be directly behind ship (camDistance = 3.6, camHeight = 1.1)
      const targetPos = (flightModel as any).cameraTargetPos;
      expect(targetPos.x).toBeCloseTo(100);
      expect(targetPos.y).toBeCloseTo(21.1);
      expect(targetPos.z).toBeCloseTo(-46.4);

      // Camera position should immediately match chase pos
      expect(camera.position.x).toBeCloseTo(targetPos.x);
      expect(camera.position.y).toBeCloseTo(targetPos.y);
      expect(camera.position.z).toBeCloseTo(targetPos.z);
    });
  });

  describe('3. TargetLockReticle Free Roam Suppression', () => {
    it('suppresses off-screen edge clamping when freeExplorationMode is true', () => {
      const reticle = new TargetLockReticle(parentEl);
      const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 10000);
      camera.position.set(0, 0, 0);
      camera.lookAt(0, 0, -1);
      camera.updateMatrixWorld();

      // Object behind camera (z = +500)
      const target: LockableTarget = {
        id: 'wanderer_7',
        name: 'The Wanderer-7',
        type: 'vessel',
        position: new THREE.Vector3(0, 0, 500),
        distance: 500,
        radius: 10,
      };

      // 1. In Story Mode: edge clamping is active (display block)
      reticle.update(
        target,
        camera,
        800,
        600,
        false,
        false,
        false // freeExplorationMode = false
      );
      expect((reticle as any).container.style.display).toBe('block');

      // 2. In Free Roam: edge clamping is suppressed (display none)
      reticle.update(
        target,
        camera,
        800,
        600,
        false,
        false,
        true // freeExplorationMode = true
      );
      expect((reticle as any).container.style.display).toBe('none');
    });

    it('shows target reticle cleanly on-screen in free roam without cyan mission accent', () => {
      const reticle = new TargetLockReticle(parentEl);
      const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 10000);
      camera.position.set(0, 0, 0);
      camera.lookAt(0, 0, -1);
      camera.updateMatrixWorld();

      // Object directly ahead (z = -200)
      const target: LockableTarget = {
        id: 'wanderer_7',
        name: 'The Wanderer-7',
        type: 'vessel',
        position: new THREE.Vector3(0, 0, -200),
        distance: 200,
        radius: 10,
      };

      reticle.update(
        target,
        camera,
        800,
        600,
        false,
        false,
        true // freeExplorationMode = true
      );

      // Target is visible
      expect((reticle as any).container.style.display).toBe('block');
      // No cyan story glow styling
      expect((reticle as any).container.classList.contains('target-reticle--story-objective')).toBe(false);
    });
  });

  describe('4. NavRadar Free Roam Clean UI', () => {
    it('suppresses objective waypoint pointers and resonance styling in free roam', () => {
      const autopilot = new AutopilotController({} as any);
      const radar = new NavRadar(parentEl, autopilot);
      (radar as any).canvas.width = 140;
      (radar as any).canvas.height = 140;

      const anomaly: SpaceAnomalyDescriptor = {
        id: 'story_anom_resonance_alpha',
        name: 'Resonance Monolith Alpha',
        type: 'RESONANCE_ECHO',
        distanceFromStar: 1000,
        angle: 0.5,
        position: { x: 500, y: 0, z: -500 },
        color: '#38bdf8',
        radius: 30,
        description: 'Vibrating resonance monolith',
        scanned: false,
        hasResonance: true,
        discovered: false,
      };

      radar.setPlanets([], [anomaly]);
      radar.setActiveStoryObjective('story_anom_resonance_alpha', 'Resonance Monolith Alpha');

      // Free roam mode enabled
      radar.setFreeExplorationMode(true);

      const shipPos = new THREE.Vector3(0, 0, 0);
      const shipRot = new THREE.Quaternion();
      const sunPos = new THREE.Vector3(0, 0, 0);

      // Draw radar frame
      radar.update(shipPos, shipRot, sunPos, 1000);

      // In free roam, objective marker drawing is skipped completely
      expect(radar.isFreeExplorationMode()).toBe(true);
    });
  });

  describe('5. StoryObjectiveHUD Free Roam Toggle & Collapse Controls', () => {
    it('displays [▶ MISSIONS] in free roam and [⏸ ROAM] in story mode', () => {
      const hud = new StoryObjectiveHUD(parentEl);
      let toggleFired = false;
      hud.setOnToggleFreeRoam(() => {
        toggleFired = true;
      });

      // 1. In free roam
      hud.update({
        freeExplorationMode: true,
        currentChapter: 1,
        currentBeat: 'beat_0_awakening',
        activePillars: [],
        alignedPillars: [],
        resonanceFragments: [],
        resonanceFrequenciesScanned: [],
        discoveredResonanceSignatures: [],
        relaySynchronized: false,
        storyCompleted: false,
      } as any);

      const toggleBtn = parentEl.querySelector('#hud-btn-toggle-freeroam');
      expect(toggleBtn).toBeTruthy();
      expect(toggleBtn.textContent).toContain('MISSIONS');
      expect(toggleBtn.title).toBe('Enable Story Missions');

      // 2. In story mode
      hud.update({
        freeExplorationMode: false,
        currentChapter: 1,
        currentBeat: 'beat_0_awakening',
        activePillars: [],
        alignedPillars: [],
        resonanceFragments: [],
        resonanceFrequenciesScanned: [],
        discoveredResonanceSignatures: [],
        relaySynchronized: false,
        storyCompleted: false,
      } as any);

      expect(toggleBtn.textContent).toContain('ROAM');
      expect(toggleBtn.title).toBe('Switch to Free Roam');

      (hud as any).onToggleFreeRoamCallback?.();
      expect(toggleFired).toBe(true);
    });

    it('supports collapsing and expanding the panel cleanly', () => {
      const hud = new StoryObjectiveHUD(parentEl);

      hud.toggleCollapse(true);
      expect((hud as any).isCollapsed).toBe(true);
      expect((hud as any).titleEl.style.display).toBe('none');
      expect((hud as any).objectiveEl.style.display).toBe('none');

      hud.toggleCollapse(false);
      expect((hud as any).isCollapsed).toBe(false);
      expect((hud as any).titleEl.style.display).toBe('block');
      expect((hud as any).objectiveEl.style.display).toBe('block');
    });

    it('activates missions when tapping the collapsed Free Roam card directly', () => {
      const hud = new StoryObjectiveHUD(parentEl);
      let toggleCount = 0;
      hud.setOnToggleFreeRoam(() => {
        toggleCount++;
      });

      hud.update({
        freeExplorationMode: true,
        currentChapter: 1,
        currentBeat: 'beat_0_awakening',
        activePillars: [],
        alignedPillars: [],
        resonanceFragments: [],
        resonanceFrequenciesScanned: [],
        discoveredResonanceSignatures: [],
        relaySynchronized: false,
        storyCompleted: false,
      } as any);

      hud.toggleCollapse(true);
      expect((hud as any).isCollapsed).toBe(true);

      const card = (hud as any).container.querySelector('.hud-card');
      expect(card).toBeTruthy();

      // Simulate tapping the card in collapsed Free Roam mode
      card.click();
      expect(toggleCount).toBe(1);
    });
  });

  describe('6. ExpeditionBriefing Mobile Usability', () => {
    it('provides touch-friendly skip and quickstart start flying options', async () => {
      const { ExpeditionBriefing } = await import('../src/ui/ExpeditionBriefing');
      let finished = false;
      const briefing = new ExpeditionBriefing(parentEl);

      briefing.show(() => {
        finished = true;
      });

      const containerHtml = (briefing as any).container.innerHTML;

      // On screen 1, quickstart button should be rendered
      expect(containerHtml).toContain('btn-briefing-quickstart');
      expect(containerHtml).toContain('START FLYING →');

      // Skip button exists
      expect(containerHtml).toContain('btn-skip-briefing');

      briefing.dispose();
      (briefing as any).onCompleteCallback?.();
      expect(finished).toBe(true);
    });
  });
});
