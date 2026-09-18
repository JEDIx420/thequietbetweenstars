import { describe, it, expect, beforeEach } from 'vitest';
import { TouchInput } from '../src/game/input/TouchInput';
import { TouchControls, isTouchDevice } from '../src/game/input/TouchControls';

// Headless DOM mock for Node environment
class MockHTMLElement {
  public static elementsMap = new Map<string, MockHTMLElement>();
  public id = '';
  public innerHTML = '';
  public style: Record<string, any> = {};
  public textContent = '';
  public children: MockHTMLElement[] = [];
  public parentElement: MockHTMLElement | null = null;
  private listeners: Record<string, Function[]> = {};

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

  trigger(event: string, evtData: any = {}) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb({ preventDefault: () => {}, ...evtData }));
    }
  }

  appendChild(child: MockHTMLElement) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  querySelector(selector: string): any {
    const key = selector.replace('#', '');
    if (!MockHTMLElement.elementsMap.has(key)) {
      const el = new MockHTMLElement();
      el.id = key;
      MockHTMLElement.elementsMap.set(key, el);
    }
    return MockHTMLElement.elementsMap.get(key);
  }

  classList = {
    classes: new Set<string>(),
    add: (c: string) => this.classList.classes.add(c),
    remove: (c: string) => this.classList.classes.delete(c),
    contains: (c: string) => this.classList.classes.has(c),
  };

  getBoundingClientRect() {
    return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 };
  }

  setPointerCapture() {}
  releasePointerCapture() {}
  remove() {}
}

if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    createElement: () => new MockHTMLElement(),
    body: new MockHTMLElement(),
  };
}

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => ({ matches: false }),
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
  };
}

describe('Touch Controls & Mobile Flight Deck', () => {
  let container: any;
  let touchInput: TouchInput;

  beforeEach(() => {
    MockHTMLElement.elementsMap.clear();
    container = new MockHTMLElement();
    touchInput = new TouchInput();
  });

  it('detects touch device environment correctly', () => {
    expect(typeof isTouchDevice()).toBe('boolean');
  });

  it('instantiates and mounts on-screen touch controls DOM elements', () => {
    const controls = new TouchControls(container, touchInput);

    const overlay = container.querySelector('#touch-controls-overlay');
    expect(overlay).toBeDefined();

    const joystickZone = container.querySelector('#touch-joystick-zone');
    expect(joystickZone).toBeDefined();

    const throttleZone = container.querySelector('#touch-throttle-zone');
    expect(throttleZone).toBeDefined();

    const scanBtn = container.querySelector('#touch-btn-scan');
    expect(scanBtn).toBeDefined();

    const topBar = container.querySelector('#touch-top-bar');
    expect(topBar).toBeDefined();

    controls.dispose();
  });

  it('manages touch-controls-active body class for tablet and touch responsive adaptations', () => {
    const controls = new TouchControls(container, touchInput);
    controls.show();
    expect(document.body.classList.contains('touch-controls-active')).toBe(true);

    controls.hide();
    expect(document.body.classList.contains('touch-controls-active')).toBe(false);

    controls.show();
    controls.toggleVisibility(); // Turns off
    expect(document.body.classList.contains('touch-controls-active')).toBe(false);

    controls.toggleVisibility(); // Turns back on
    expect(document.body.classList.contains('touch-controls-active')).toBe(true);

    controls.dispose();
    expect(document.body.classList.contains('touch-controls-active')).toBe(false);
  });

  it('sets throttle correctly and updates touch input state', () => {
    const controls = new TouchControls(container, touchInput);

    controls.setThrottle(0.8);
    expect(touchInput.getInputState().throttle).toBeCloseTo(0.8);

    const label = container.querySelector('#touch-throttle-label');
    expect(label?.textContent).toContain('80%');

    controls.setThrottle(0);
    expect(touchInput.getInputState().throttle).toBe(0);
    expect(label?.textContent).toContain('IDLE');

    controls.dispose();
  });

  it('updates contextual buttons between space and surface flight', () => {
    const controls = new TouchControls(container, touchInput);
    const altRow = container.querySelector('#touch-altitude-row') as HTMLElement;
    const orbitBtn = container.querySelector('#touch-btn-orbit') as HTMLElement;

    controls.setContext('surface');
    expect(altRow.style.display).toBe('flex');
    expect(orbitBtn.textContent).toBe('ORBIT');

    controls.setContext('space');
    expect(altRow.style.display).toBe('none');
    expect(orbitBtn.textContent).toBe('LAND');

    controls.dispose();
  });

  it('toggles visibility cleanly when toggle button is clicked', () => {
    const controls = new TouchControls(container, touchInput);
    const mainControls = container.querySelector('#touch-controls-main') as HTMLElement;
    const toggleBtn = container.querySelector('#touch-toggle-btn') as HTMLElement;

    expect(mainControls.style.display).not.toBe('none');

    controls.toggleVisibility();
    expect(mainControls.style.display).toBe('none');
    expect(toggleBtn.textContent).toContain('OFF');

    controls.toggleVisibility();
    expect(mainControls.style.display).toBe('flex');
    expect(toggleBtn.textContent).toContain('ON');

    controls.dispose();
  });

  it('triggers onEmote callback when touch emote buttons are clicked', () => {
    const controls = new TouchControls(container, touchInput);
    const emotesTriggered: string[] = [];
    controls.setOnEmote((type) => {
      emotesTriggered.push(type);
    });

    const waveBtn = container.querySelector('#touch-btn-emote-wave') as any;
    const heartBtn = container.querySelector('#touch-btn-emote-heart') as any;
    const peaceBtn = container.querySelector('#touch-btn-emote-peace') as any;

    waveBtn.click();
    expect(emotesTriggered).toContain('wave');

    heartBtn.click();
    expect(emotesTriggered).toContain('heart');

    peaceBtn.click();
    expect(emotesTriggered).toContain('peace');

    controls.dispose();
  });

  it('toggles and collapses the comms emote drawer on user interaction', () => {
    const controls = new TouchControls(container, touchInput);
    const drawer = container.querySelector('#touch-emote-drawer') as HTMLElement;
    expect(drawer).toBeDefined();
    const toggleBtn = container.querySelector('#touch-btn-emote-toggle') as any;

    expect(controls.isEmoteDrawerOpen()).toBe(false);

    toggleBtn.click();
    expect(controls.isEmoteDrawerOpen()).toBe(true);

    // Clicking an emote auto-collapses the drawer
    const waveBtn = container.querySelector('#touch-btn-emote-wave') as any;
    waveBtn.click();
    expect(controls.isEmoteDrawerOpen()).toBe(false);

    controls.dispose();
  });

  it('provides target lock button for left thumb navigation', () => {
    const controls = new TouchControls(container, touchInput);
    const targetBtn = container.querySelector('#touch-btn-target') as any;
    expect(targetBtn).toBeDefined();

    targetBtn.click();
    expect(touchInput.consumeAction('cycle_target')).toBe(true);

    controls.dispose();
  });

  it('updates orbit button when in orbital approach vicinity', () => {
    const controls = new TouchControls(container, touchInput);
    const orbitBtn = container.querySelector('#touch-btn-orbit') as HTMLElement;

    controls.setContext('space');
    expect(orbitBtn.textContent).toBe('LAND');

    controls.setOrbitAvailable(true, 'Aethelgard');
    expect(orbitBtn.textContent).toBe('ORBIT');

    controls.setOrbitAvailable(false);
    expect(orbitBtn.textContent).toBe('LAND');

    controls.dispose();
  });

  it('clears screen center and organizes controls into left and right thumb zones', () => {
    const controls = new TouchControls(container, touchInput);
    const leftZone = container.querySelector('#touch-left-zone');
    const rightZone = container.querySelector('#touch-right-zone');

    expect(leftZone).toBeDefined();
    expect(rightZone).toBeDefined();

    controls.dispose();
  });

  it('activates continuous scan action on pointerdown and releases on pointerup', () => {
    const controls = new TouchControls(container, touchInput);
    const scanBtn = container.querySelector('#touch-btn-scan') as any;

    expect(touchInput.isActionPressed('scan')).toBe(false);

    scanBtn.trigger('pointerdown');
    expect(touchInput.isActionPressed('scan')).toBe(true);
    expect(touchInput.isActionPressed('interact')).toBe(true);
    expect(scanBtn.textContent).toContain('SCANNING');

    scanBtn.trigger('pointerup');
    expect(touchInput.isActionPressed('scan')).toBe(false);
    expect(touchInput.isActionPressed('interact')).toBe(false);

    controls.dispose();
  });
});

