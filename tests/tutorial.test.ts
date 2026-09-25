import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TutorialDirector, type TutorialState, type TutorialStepInfo } from '../src/tutorial/TutorialDirector';
import { ShipComputerGuidanceHUD } from '../src/ui/ShipComputerGuidanceHUD';
import type { NarrativeDirector } from '../src/narrative/NarrativeDirector';
import type { NarrativeContext } from '../src/narrative/NarrativeTypes';

class MockDOMElement {
  public id: string = '';
  public className: string = '';
  public style: Record<string, any> = {};
  public children: MockDOMElement[] = [];
  public parentElement: MockDOMElement | null = null;
  public onclick: (() => void) | null = null;
  private eventListeners: Record<string, ((e?: any) => void)[]> = {};
  private classSet = new Set<string>();
  private _innerHTML: string = '';

  public get innerHTML(): string {
    return this._innerHTML;
  }

  public set innerHTML(val: string) {
    this._innerHTML = val;
    this.children = [];
    if (val.includes('id="btn-skip-tutorial"')) {
      const btn = new MockDOMElement();
      btn.id = 'btn-skip-tutorial';
      this.children.push(btn);
    }
    if (val.includes('id="btn-tutorial-skip-step"')) {
      const btn = new MockDOMElement();
      btn.id = 'btn-tutorial-skip-step';
      this.children.push(btn);
    }
  }

  public addEventListener(event: string, handler: (e?: any) => void) {
    if (!this.eventListeners[event]) this.eventListeners[event] = [];
    this.eventListeners[event].push(handler);
  }

  public removeEventListener(event: string, handler: (e?: any) => void) {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event].filter((h) => h !== handler);
    }
  }

  public click() {
    if (this.onclick) this.onclick();
    if (this.eventListeners['click']) {
      for (const h of this.eventListeners['click']) {
        h({ stopPropagation: () => {} });
      }
    }
  }

  public get classList() {
    return {
      add: (c: string) => this.classSet.add(c),
      remove: (c: string) => this.classSet.delete(c),
      contains: (c: string) => this.classSet.has(c),
    };
  }

  appendChild(el: any) {
    this.children.push(el);
    el.parentElement = this;
    return el;
  }

  removeChild(el: any) {
    this.children = this.children.filter((c) => c !== el);
    return el;
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter((c) => c !== this);
    }
  }

  querySelector(selector: string): any {
    const clean = selector.replace(/[#.]/g, '');
    if (this.id === clean || this.classSet.has(clean)) return this;
    for (const child of this.children) {
      if (child.id === clean || child.classList.contains(clean)) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }

  querySelectorAll(selector: string): any[] {
    const results: any[] = [];
    const clean = selector.replace(/[#.]/g, '');
    if (this.id === clean || this.classSet.has(clean)) results.push(this);
    for (const child of this.children) {
      results.push(...child.querySelectorAll(selector));
    }
    return results;
  }
}

const mockBody = new MockDOMElement();
if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    body: mockBody,
    createElement: () => new MockDOMElement(),
    getElementById: (id: string) => mockBody.querySelector('#' + id),
    querySelector: (sel: string) => mockBody.querySelector(sel),
    querySelectorAll: (sel: string) => mockBody.querySelectorAll(sel),
  };
}
if (typeof (globalThis as any).requestAnimationFrame === 'undefined') {
  (globalThis as any).requestAnimationFrame = (cb: () => void) => setTimeout(cb, 0);
}

describe('TutorialDirector Flow & Progression', () => {
  let narrativeMock: NarrativeDirector;
  let triggeredEvents: string[] = [];
  let currentPrompt: string | null = null;
  let companionAction: string | null = null;
  let currentStepInfo: TutorialStepInfo | null = null;
  let tutorial: TutorialDirector;

  const mockContext: NarrativeContext = {
    sector: { x: 0, y: 0, z: 0 },
    currentSystemName: 'Aurelia',
    flightPhase: 'SYSTEM_CRUISE',
    systemsVisited: 1,
    discoveriesCount: 0,
    resonanceFlags: [],
  };

  beforeEach(() => {
    triggeredEvents = [];
    currentPrompt = null;
    companionAction = null;
    currentStepInfo = null;

    narrativeMock = {
      trigger: vi.fn(async (type: string) => {
        triggeredEvents.push(type);
      }),
    } as unknown as NarrativeDirector;

    tutorial = new TutorialDirector(narrativeMock, () => mockContext);
    tutorial.setCallbacks(
      (prompt) => {
        currentPrompt = prompt;
      },
      (action) => {
        companionAction = action;
      }
    );
    tutorial.setOnStepChange((info) => {
      currentStepInfo = info;
    });
  });

  it('starts tutorial at WAKE_INTRO and triggers first_wake dialogue', () => {
    tutorial.start();
    const state = tutorial.getState();
    expect(state.started).toBe(true);
    expect(state.step).toBe('WAKE_INTRO');
    expect(triggeredEvents).toContain('first_wake');
    expect(currentStepInfo?.title).toBe('SYSTEM INITIALIZATION');
  });

  it('progresses through flight inputs (STEER -> THROTTLE -> SCAN)', () => {
    tutorial.start();
    (tutorial as any).advanceTo('STEER_INPUT');
    expect(tutorial.getState().step).toBe('STEER_INPUT');

    tutorial.onPlayerSteer();
    expect(triggeredEvents).toContain('first_steer');
    expect(tutorial.getState().step).toBe('THROTTLE_INPUT');

    tutorial.onPlayerThrottle();
    expect(triggeredEvents).toContain('first_throttle');
    expect(tutorial.getState().step).toBe('SCAN_ACTION');

    tutorial.onPlayerScan();
    expect(triggeredEvents).toContain('first_scan');
    expect(tutorial.getState().step).toBe('RADAR_TARGET');
  });

  it('progresses through full sandbox loop: radar -> map -> orbit -> land -> dock -> trade -> craft -> upgrade -> homescreen -> completed', () => {
    tutorial.start();
    (tutorial as any).advanceTo('RADAR_TARGET');

    tutorial.onPlayerTargetCycle();
    expect(tutorial.getState().step).toBe('OPEN_MAP');

    tutorial.onPlayerOpenMap();
    expect(tutorial.getState().step).toBe('ENGAGE_CRUISE');

    tutorial.onPlayerEngageCruise('Aurelia Prime');
    expect(tutorial.getState().step).toBe('APPROACH_PLANET');

    tutorial.onPlayerOrbit();
    expect(tutorial.getState().step).toBe('LAND_SURFACE');

    tutorial.onPlayerLand();
    expect(tutorial.getState().step).toBe('SCAN_DISCOVERY');

    tutorial.onPlayerDiscovery();
    expect(tutorial.getState().step).toBe('DOCK_STATION');

    tutorial.onPlayerDock('Aurelia Orbital Gateway');
    expect(tutorial.getState().step).toBe('TRADE_MARKET');

    tutorial.onPlayerTrade();
    expect(tutorial.getState().step).toBe('CRAFT_FABRICATOR');

    tutorial.onPlayerCraft();
    expect(tutorial.getState().step).toBe('SHIP_UPGRADE');

    tutorial.onPlayerUpgrade();
    expect(tutorial.getState().step).toBe('PWA_HOMESCREEN');

    tutorial.onCompleteHomescreenGuide();
    expect(tutorial.getState().step).toBe('COMPLETED');
    expect(tutorial.isComplete()).toBe(true);
  });

  it('provides highlight selectors and rich metadata per step', () => {
    tutorial.setInputMode('touch');
    const steerInfo = tutorial.getStepInfo('STEER_INPUT');
    expect(steerInfo.badge).toBe('JOYSTICK');
    expect(steerInfo.highlightSelector).toBe('#touch-joystick-zone');

    const throttleInfo = tutorial.getStepInfo('THROTTLE_INPUT');
    expect(throttleInfo.highlightSelector).toBe('#touch-throttle-zone');

    const scanInfo = tutorial.getStepInfo('SCAN_ACTION');
    expect(scanInfo.highlightSelector).toBe('#touch-btn-scan');

    const homescreenInfo = tutorial.getStepInfo('PWA_HOMESCREEN');
    expect(homescreenInfo.badge).toBe('HOMESCREEN');
    expect(homescreenInfo.canManuallyAdvance).toBe(true);
  });

  it('supports skipStep advancing sequentially', () => {
    tutorial.start();
    (tutorial as any).advanceTo('STEER_INPUT');
    tutorial.skipStep();
    expect(tutorial.getState().step).toBe('THROTTLE_INPUT');
  });

  it('supports companion mode prompts and hints', () => {
    tutorial.setInputMode('companion');
    tutorial.start();
    (tutorial as any).advanceTo('STEER_INPUT');

    expect(currentPrompt).toContain('Joystick');
    expect(companionAction).toBe('joystick');
  });

  it('allows skipping tutorial completely', () => {
    tutorial.start();
    expect(tutorial.isComplete()).toBe(false);

    tutorial.skip();
    expect(tutorial.isComplete()).toBe(true);
    expect(tutorial.getState().skipped).toBe(true);
    expect(currentPrompt).toBeNull();
  });

  it('persists and restores tutorial state correctly', () => {
    const savedState: Partial<TutorialState> = {
      started: true,
      completed: false,
      step: 'SET_COURSE',
      skipped: false,
    };

    tutorial.loadState(savedState);
    expect(tutorial.getState().step).toBe('SET_COURSE');
  });

  it('ShipComputerGuidanceHUD renders, applies highlight class, and handles skips', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const testBtn = document.createElement('button');
    testBtn.id = 'touch-btn-scan';
    container.appendChild(testBtn);

    const hud = new ShipComputerGuidanceHUD(container);
    let skipFired = false;
    let nextFired = false;
    hud.setCallbacks(
      () => { skipFired = true; },
      () => { nextFired = true; }
    );

    tutorial.setInputMode('touch');
    const info = tutorial.getStepInfo('SCAN_ACTION');
    hud.showStep(info);

    expect(testBtn.classList.contains('tutorial-target-highlight')).toBe(true);

    const btnSkipStep = container.querySelector('#btn-tutorial-skip-step') as HTMLButtonElement;
    btnSkipStep?.click();
    expect(nextFired).toBe(true);

    const btnSkipTutorial = container.querySelector('#btn-skip-tutorial') as HTMLButtonElement;
    btnSkipTutorial?.click();
    expect(skipFired).toBe(true);

    hud.dispose();
    expect(testBtn.classList.contains('tutorial-target-highlight')).toBe(false);
    container.remove();
  });
});
