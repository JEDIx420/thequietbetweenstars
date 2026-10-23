import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { AlienCitySettlementManager } from '../src/game/surface/AlienCitySettlement';
import { PilotOnboardingHUD } from '../src/ui/PilotOnboardingHUD';
import { SpaceInteractionController } from '../src/game/interaction/SpaceInteractionController';
import { DockingController } from '../src/game/docking/DockingController';
import { StoryDirector } from '../src/story/StoryDirector';
import { DialoguePresenter } from '../src/ui/DialoguePresenter';
import { NamedVessel } from '../src/game/vessels/NamedVesselDirector';
import { StarSystemGenerator } from '../src/game/systems/StarSystemGenerator';

// Headless DOM mock for Node runner
class MockHTMLElement {
  public id = '';
  private _innerHTML = '';
  public textContent = '';
  public style: Record<string, any> = {};
  public children: MockHTMLElement[] = [];
  public parentElement: MockHTMLElement | null = null;
  public classList = {
    classes: new Set<string>(),
    add: (c: string) => this.classList.classes.add(c),
    remove: (c: string) => this.classList.classes.delete(c),
    contains: (c: string) => this.classList.classes.has(c),
  };
  private listeners: Record<string, Function[]> = {};

  public get innerHTML(): string {
    return this._innerHTML;
  }

  public set innerHTML(val: string) {
    this._innerHTML = val;
    this.children = [];
    const matches = val.matchAll(/id="([^"]+)"/g);
    for (const match of matches) {
      const child = new MockHTMLElement();
      child.id = match[1];
      child.parentElement = this;
      this.children.push(child);
    }
  }

  addEventListener(event: string, cb: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  removeEventListener(event: string, cb: Function) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(l => l !== cb);
    }
  }

  click() {
    if (this.listeners['click']) {
      this.listeners['click'].forEach(cb => cb({ preventDefault: () => {} }));
    }
  }

  appendChild(child: MockHTMLElement) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  querySelector(selector: string): any {
    const id = selector.replace('#', '');
    if (this.id === id) return this;
    for (const c of this.children) {
      const found = c.querySelector(selector);
      if (found) return found;
    }
    return null;
  }

  querySelectorAll(_selector: string): any[] {
    return this.children;
  }

  setAttribute(_k: string, _v: string) {}
  getAttribute(_k: string) { return null; }
  getBoundingClientRect() {
    return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 };
  }
}

const mockStorage: Record<string, string> = {};
const storageMock = {
  getItem: (key: string) => mockStorage[key] || null,
  setItem: (key: string, value: string) => { mockStorage[key] = value; },
  removeItem: (key: string) => { delete mockStorage[key]; },
  clear: () => {
    for (const k in mockStorage) delete mockStorage[k];
  },
};

if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    createElement: () => new MockHTMLElement(),
    body: new MockHTMLElement(),
  };
}

if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    localStorage: storageMock,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}
(globalThis as any).localStorage = storageMock;

describe('Alien Cities, Onboarding HUD, and Ship Interaction Suite', () => {
  describe('1. AlienCitySettlementManager', () => {
    const testSystem = StarSystemGenerator.generateSystem('QUIET-TEST-SETTLEMENTS', 0, 0, 0);
    const mockPlanet = testSystem.planets[0];

    it('generates settlements with landing pads, beacon beams, and traffic drones', () => {
      const getTerrainHeight = (_x: number, _z: number) => 12.5;
      const manager = new AlienCitySettlementManager(mockPlanet, getTerrainHeight);

      expect(manager.cities.length).toBeGreaterThanOrEqual(1);
      const city = manager.cities[0];
      expect(city.name).toBeDefined();
      expect(city.landingPadPos.y).toBeCloseTo(17.0, 1);
      expect(city.populationEstimate).toBeGreaterThan(0);
      expect(city.radius).toBe(120);

      // Check group has 3D meshes
      expect(manager.group.children.length).toBeGreaterThan(0);

      // Animate update without crashing
      const updateResult = manager.update(0.16, new THREE.Vector3(city.landingPadPos.x, city.landingPadPos.y, city.landingPadPos.z));
      expect(updateResult.nearestCity).toBe(city);
      expect(updateResult.isOverLandingPad).toBe(true);
      expect(updateResult.padDistance).toBeCloseTo(0, 1);
    });

    it('generates outposts even on secondary worlds', () => {
      const secondPlanet = testSystem.planets[testSystem.planets.length - 1];
      const manager = new AlienCitySettlementManager(secondPlanet, () => 5.0);
      expect(manager.cities.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('2. PilotOnboardingHUD', () => {
    let parent: any;

    beforeEach(() => {
      storageMock.clear();
      parent = new MockHTMLElement();
    });

    it('initializes visible when first playing and displays 4 steps', () => {
      const hud = new PilotOnboardingHUD(parent);
      expect(hud.getVisible()).toBe(true);
    });

    it('completing all steps auto-dismisses and marks localStorage', () => {
      vi.useFakeTimers();
      const hud = new PilotOnboardingHUD(parent);
      expect(hud.getVisible()).toBe(true);

      hud.completeStep('steer');
      hud.completeStep('throttle');
      hud.completeStep('target');
      hud.completeStep('cruise');

      expect(storageMock.getItem('pilot_onboarding_completed_v1')).toBe('true');
      vi.advanceTimersByTime(3500);
      expect(hud.getVisible()).toBe(false);
      vi.useRealTimers();
    });

    it('dismiss button completes immediately', () => {
      const hud = new PilotOnboardingHUD(parent);
      hud.dismiss();
      expect(hud.getVisible()).toBe(false);
      expect(storageMock.getItem('pilot_onboarding_completed_v1')).toBe('true');
    });

    it('triggers onSkipCallback when close or skip tutorial is invoked', () => {
      const hud = new PilotOnboardingHUD(parent);
      let skipCalled = false;
      hud.setOnSkipCallback(() => {
        skipCalled = true;
      });

      // Simulating fast tap on close button
      const closeBtn = parent.querySelector('#btn-close-onboarding');
      closeBtn?.click();

      expect(hud.getVisible()).toBe(false);
      expect(skipCalled).toBe(true);
      expect(storageMock.getItem('pilot_onboarding_completed_v1')).toBe('true');
    });

    it('sets display none and pointer-events none when hidden so it never blocks touch controls', () => {
      const hud = new PilotOnboardingHUD(parent);
      hud.hide();
      expect(hud.getVisible()).toBe(false);
      const containerEl = (hud as any).container;
      const cardEl = (hud as any).cardEl;
      expect(containerEl.style.display).toBe('none');
      expect(cardEl.style.pointerEvents).toBe('none');

      hud.show();
      expect(hud.getVisible()).toBe(true);
      expect(containerEl.style.display).toBe('block');
      expect(cardEl.style.pointerEvents).toBe('auto');
    });
  });

  describe('3. SpaceInteractionController Interactive Comms', () => {
    it('opens interactive comms dialogue with 5 distinct choices when hailing a vessel', () => {
      const storyDirector = new StoryDirector();
      const dockingController = new DockingController();
      const dialoguePresenter = new DialoguePresenter(new MockHTMLElement() as any);
      const controller = new SpaceInteractionController(storyDirector, dockingController, dialoguePresenter);

      const vessel = new NamedVessel({
        id: 'vessel-test-alpha',
        name: 'Aurelia Scout',
        species: 'Kaelen',
        captainName: 'Commander Vaelen',
        greeting: 'Greetings traveler. All systems nominal.',
        position: new THREE.Vector3(0, 0, 0),
        hailRadius: 250,
      });

      const showInteractiveSpy = vi.spyOn(dialoguePresenter, 'showInteractiveConversation');
      const setChoiceCallbackSpy = vi.spyOn(dialoguePresenter, 'setChoiceCallback');
      const enqueueSpy = vi.spyOn(dialoguePresenter, 'enqueue');

      const notices: string[] = [];
      const callbacks = {
        showNotice: (msg: string) => notices.push(msg),
        setContextPrompt: vi.fn(),
        addCredits: vi.fn(),
        addSample: vi.fn(),
        saveJourney: vi.fn(),
      };

      const lockedTarget = {
        id: vessel.id,
        name: vessel.name,
        type: 'vessel' as const,
        position: vessel.position.clone(),
        distance: 50,
        radius: 25,
        data: vessel,
      };

      controller.handleSpaceAction(lockedTarget, vessel.position.clone().add(new THREE.Vector3(20, 0, 0)), 0.016, callbacks);

      expect(showInteractiveSpy).toHaveBeenCalledTimes(1);
      expect(setChoiceCallbackSpy).toHaveBeenCalledTimes(1);

      const options = showInteractiveSpy.mock.calls[0][2];
      expect(options.map(o => o.topic)).toEqual(['trade', 'intel', 'escort', 'scan', 'close']);

      // Test invoking the choice callback
      const callback = setChoiceCallbackSpy.mock.calls[0][0];

      callback('trade');
      expect(notices.some(n => n.includes('CARGO RECEIVED'))).toBe(true);

      callback('intel');
      expect(notices.some(n => n.includes('NAVIGATION INTEL'))).toBe(true);

      callback('escort');
      expect(notices.some(n => n.includes('FORMATION LOCK'))).toBe(true);

      callback('scan');
      expect(enqueueSpy).toHaveBeenCalled();
    });
  });
});
