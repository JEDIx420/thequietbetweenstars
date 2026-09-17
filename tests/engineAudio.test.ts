import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Web Audio API for headless testing
class MockAudioParam {
  value = 0;
  setValueAtTime = vi.fn((val: number) => { this.value = val; });
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
  setTargetAtTime = vi.fn((val: number) => { this.value = val; });
  rampTo = vi.fn();
}

class MockAudioNode {
  connect = vi.fn().mockReturnThis();
  disconnect = vi.fn();
}

class MockGainNode extends MockAudioNode {
  gain = new MockAudioParam();
}

class MockBiquadFilterNode extends MockAudioNode {
  frequency = new MockAudioParam();
  Q = new MockAudioParam();
  type = 'lowpass';
}

class MockOscillatorNode extends MockAudioNode {
  frequency = new MockAudioParam();
  type = 'sine';
  start = vi.fn();
  stop = vi.fn();
}

class MockAudioBuffer {
  private data: Float32Array;
  constructor(_channels: number, length: number, _sampleRate: number) {
    this.data = new Float32Array(length);
  }
  getChannelData() {
    return this.data;
  }
}

class MockAudioBufferSourceNode extends MockAudioNode {
  buffer: any = null;
  loop = false;
  start = vi.fn();
  stop = vi.fn();
}

let activeMockAudioContext: MockAudioContext | null = null;

class MockAudioContext {
  currentTime = 1.0;
  sampleRate = 44100;
  state = 'running';
  destination = new MockAudioNode();

  constructor() {
    activeMockAudioContext = this;
  }

  createGain() { return new MockGainNode(); }
  createBiquadFilter() { return new MockBiquadFilterNode(); }
  createOscillator() { return new MockOscillatorNode(); }
  createBuffer(c: number, l: number, s: number) { return new MockAudioBuffer(c, l, s); }
  createBufferSource() { return new MockAudioBufferSourceNode(); }
  resume = vi.fn().mockResolvedValue(undefined);
}

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = globalThis;
}
(globalThis as any).AudioContext = MockAudioContext;
(globalThis.window as any).AudioContext = MockAudioContext;

import { audio } from '../src/audio/AudioEngine';

describe('AudioEngine: Spacecraft Propulsion, Throttle & Warp Acoustics', () => {
  beforeEach(() => {
    (globalThis.window as any).AudioContext = MockAudioContext;
    if (activeMockAudioContext) {
      activeMockAudioContext.currentTime += 2.0;
    }
  });

  it('exposes audio singleton with correct initial mute status', () => {
    expect(audio).toBeDefined();
    expect(audio.getIsMuted()).toBe(false);
  });

  it('toggles mute state correctly', () => {
    const muted = audio.toggleMute();
    expect(muted).toBe(true);
    expect(audio.getIsMuted()).toBe(true);

    const unmuted = audio.toggleMute();
    expect(unmuted).toBe(false);
    expect(audio.getIsMuted()).toBe(false);
  });

  it('handles updateThrottle smoothly across idle and full throttle', async () => {
    await audio.start();

    // Idle
    expect(() => audio.updateThrottle(0.0)).not.toThrow();

    // Smooth climb
    expect(() => audio.updateThrottle(0.25)).not.toThrow();
    expect(() => audio.updateThrottle(0.50)).not.toThrow();
    expect(() => audio.updateThrottle(0.75)).not.toThrow();
    expect(() => audio.updateThrottle(1.0)).not.toThrow();

    // Boundary clamp handling
    expect(() => audio.updateThrottle(-0.5)).not.toThrow();
    expect(() => audio.updateThrottle(1.5)).not.toThrow();
  });

  it('triggers acceleration transient when rapidly throttling up', async () => {
    await audio.start();
    const accelSpy = vi.spyOn(audio, 'playAccelerationTransient');

    if (activeMockAudioContext) activeMockAudioContext.currentTime += 1.0;
    audio.updateThrottle(0.1);

    if (activeMockAudioContext) activeMockAudioContext.currentTime += 1.0;
    // Rapid throttle jump > 0.10
    audio.updateThrottle(0.85);

    expect(accelSpy).toHaveBeenCalled();
    accelSpy.mockRestore();
  });

  it('triggers deceleration transient when rapidly throttling down / braking', async () => {
    await audio.start();
    const decelSpy = vi.spyOn(audio, 'playDecelerationTransient');

    if (activeMockAudioContext) activeMockAudioContext.currentTime += 1.0;
    audio.updateThrottle(0.9);

    if (activeMockAudioContext) activeMockAudioContext.currentTime += 1.0;
    // Rapid throttle drop > 0.12
    audio.updateThrottle(0.1);

    expect(decelSpy).toHaveBeenCalled();
    decelSpy.mockRestore();
  });

  it('executes warp drive countdown ticks (5 down to 1) with energetic acoustics', async () => {
    await audio.start();
    for (let count = 5; count >= 1; count--) {
      expect(() => audio.playWarpCountdownTick(count)).not.toThrow();
    }
  });

  it('handles warp entry, slipstream, and exit lifecycle cleanly', async () => {
    await audio.start();

    // 1. Warp jump entry
    expect(() => audio.playWarpEntry()).not.toThrow();

    // 2. Continuous 5s slipstream transit
    expect(() => audio.startWarpSlipstream()).not.toThrow();

    // 3. Stop slipstream
    expect(() => audio.stopWarpSlipstream()).not.toThrow();

    // 4. Warp exit arrival sonic boom
    expect(() => audio.playWarpExit()).not.toThrow();
  });

  it('transitions music and engine contexts smoothly without error', async () => {
    await audio.start();

    const contexts = ['title', 'cruise', 'approach', 'orbit', 'surface', 'deep_cruise', 'sentient'] as const;
    for (const ctx of contexts) {
      expect(() => audio.setContext(ctx)).not.toThrow();
    }
  });
});
