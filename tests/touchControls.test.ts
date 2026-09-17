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

    controls.dispose();
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
});
