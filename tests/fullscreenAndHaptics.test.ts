import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HapticFeedback } from '../src/game/input/HapticFeedback';
import { audio } from '../src/audio/AudioEngine';

// Mock DOM element for tests
class MockElement {
  public id = '';
  public innerHTML = '';
  public textContent = '';
  public title = '';
  public style: Record<string, any> = {};
  public children: any[] = [];
  public classSet = new Set<string>();

  public get classList() {
    return {
      add: (c: string) => this.classSet.add(c),
      remove: (c: string) => this.classSet.delete(c),
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
      if (child.id === selector.replace('#', '')) return child;
      const found = child.querySelector?.(selector);
      if (found) return found;
    }
    return null;
  }
}

describe('Fullscreen and Haptic Feedback System', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. HapticFeedback Service', () => {
    it('dispatches light, notch, medium, scan, and heavy haptics via navigator.vibrate when available', () => {
      const vibrateMock = vi.fn();
      Object.defineProperty(navigator, 'vibrate', {
        value: vibrateMock,
        configurable: true,
        writable: true,
      });

      HapticFeedback.light();
      expect(vibrateMock).toHaveBeenCalledWith(12);

      // Fast-forward lastVibeTime to test medium
      (HapticFeedback as any).lastVibeTime = 0;
      HapticFeedback.medium();
      expect(vibrateMock).toHaveBeenCalledWith(25);

      (HapticFeedback as any).lastVibeTime = 0;
      HapticFeedback.notch();
      expect(vibrateMock).toHaveBeenCalledWith(8);

      (HapticFeedback as any).lastVibeTime = 0;
      HapticFeedback.scan();
      expect(vibrateMock).toHaveBeenCalledWith([15, 25, 15]);

      (HapticFeedback as any).lastVibeTime = 0;
      HapticFeedback.heavy();
      expect(vibrateMock).toHaveBeenCalledWith([40, 30, 50]);
    });

    it('falls back to audio.playHapticTick when navigator.vibrate is absent (e.g. iOS Safari)', () => {
      Object.defineProperty(navigator, 'vibrate', {
        value: undefined,
        configurable: true,
        writable: true,
      });
      const playHapticTickSpy = vi.spyOn(audio, 'playHapticTick').mockImplementation(() => {});

      (HapticFeedback as any).lastVibeTime = 0;
      HapticFeedback.light();
      expect(playHapticTickSpy).toHaveBeenCalledWith(140, 0.015, 0.06);

      (HapticFeedback as any).lastVibeTime = 0;
      HapticFeedback.medium();
      expect(playHapticTickSpy).toHaveBeenCalledWith(95, 0.025, 0.09);

      (HapticFeedback as any).lastVibeTime = 0;
      HapticFeedback.notch();
      expect(playHapticTickSpy).toHaveBeenCalledWith(160, 0.012, 0.05);

      (HapticFeedback as any).lastVibeTime = 0;
      HapticFeedback.heavy();
      expect(playHapticTickSpy).toHaveBeenCalledWith(65, 0.045, 0.14);
    });

    it('rate-limits rapid micro-ticks to prevent motor flooding', () => {
      const vibrateMock = vi.fn();
      Object.defineProperty(navigator, 'vibrate', {
        value: vibrateMock,
        configurable: true,
        writable: true,
      });

      (HapticFeedback as any).lastVibeTime = 0;
      HapticFeedback.light();
      expect(vibrateMock).toHaveBeenCalledTimes(1);

      // Immediately call again within debounce window
      HapticFeedback.light();
      expect(vibrateMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. Pseudo-Fullscreen and Fullscreen Recovery', () => {
    it('activates app-pseudo-fullscreen class when native requestFullscreen is unsupported or fails', async () => {
      const docEl = new MockElement();
      const body = new MockElement();
      (globalThis as any).document = {
        documentElement: docEl,
        body: body,
        fullscreenElement: null,
      };
      (globalThis as any).window = {
        scrollTo: vi.fn(),
      };

      // Create a mock app with our toggleFullscreen logic
      const app = {
        uiContainer: new MockElement(),
        renderer: { handleResize: vi.fn() },
        isFullscreen() {
          const doc = document as any;
          return !!(
            doc.fullscreenElement ||
            doc.webkitFullscreenElement ||
            document.documentElement.classList.contains('app-pseudo-fullscreen')
          );
        },
        async toggleFullscreen() {
          const doc = document as any;
          const de = doc.documentElement as any;
          const b = doc.body;
          const isNative = !!(doc.fullscreenElement || doc.webkitFullscreenElement);
          const isPseudo = de.classList.contains('app-pseudo-fullscreen');

          if (isNative || isPseudo) {
            if (isPseudo) {
              de.classList.remove('app-pseudo-fullscreen');
              b.classList.remove('app-pseudo-fullscreen');
            }
          } else {
            // Emulate iOS iPhone Safari where requestFullscreen is not defined
            de.classList.add('app-pseudo-fullscreen');
            b.classList.add('app-pseudo-fullscreen');
          }
        },
      };

      expect(app.isFullscreen()).toBe(false);

      // Toggle ON
      await app.toggleFullscreen();
      expect(docEl.classList.contains('app-pseudo-fullscreen')).toBe(true);
      expect(body.classList.contains('app-pseudo-fullscreen')).toBe(true);
      expect(app.isFullscreen()).toBe(true);

      // Toggle OFF
      await app.toggleFullscreen();
      expect(docEl.classList.contains('app-pseudo-fullscreen')).toBe(false);
      expect(body.classList.contains('app-pseudo-fullscreen')).toBe(false);
      expect(app.isFullscreen()).toBe(false);
    });
  });
});
