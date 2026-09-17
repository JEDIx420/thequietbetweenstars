import { describe, it, expect } from 'vitest';
import { TouchInput } from '../src/game/input/TouchInput';
import { InputManager } from '../src/game/input/InputManager';

describe('Touch Input Normalization', () => {
  it('updates normalized axes and throttle accurately with clamping', () => {
    const touch = new TouchInput();

    touch.setAxes({ x: 0.85, y: -0.65 });
    touch.setThrottle(0.75);

    const state = touch.getInputState();
    expect(state.axes.x).toBeCloseTo(0.85);
    expect(state.axes.y).toBeCloseTo(-0.65);
    expect(state.throttle).toBe(0.75);
    expect(touch.isConnected).toBe(true);

    // Test out of bounds clamping
    touch.setAxes({ x: 1.5, y: -2.0 });
    touch.setThrottle(1.8);
    const clampedState = touch.getInputState();
    expect(clampedState.axes.x).toBe(1.0);
    expect(clampedState.axes.y).toBe(-1.0);
    expect(clampedState.throttle).toBe(1.0);
  });

  it('queues and consumes discrete actions once and supports action holding', () => {
    const touch = new TouchInput();

    // Trigger discrete action
    touch.triggerAction('scan');
    expect(touch.consumeAction('scan')).toBe(true);
    expect(touch.consumeAction('scan')).toBe(false);

    // Hold continuous action (e.g. tractor beam)
    touch.setActionState('tractor', true);
    expect(touch.isActionPressed('tractor')).toBe(true);
    touch.setActionState('tractor', false);
    expect(touch.isActionPressed('tractor')).toBe(false);
  });
});

describe('Unified Input Manager', () => {
  it('supports hybrid input merging from keyboard and touch', () => {
    const manager = new InputManager();
    expect(manager.getMode()).toBe('hybrid');

    const touch = manager.getTouchSource();
    touch.setAxes({ x: 0.5, y: 0.3 });
    touch.setThrottle(0.6);

    const input = manager.getNormalizedInput();
    expect(input.axes.x).toBeCloseTo(0.5);
    expect(input.axes.y).toBeCloseTo(0.3);
    expect(input.throttle).toBe(0.6);
  });

  it('consumes actions from either keyboard or touch source', () => {
    const manager = new InputManager();
    const touch = manager.getTouchSource();

    touch.triggerAction('map');
    expect(manager.consumeAction('map')).toBe(true);
    expect(manager.consumeAction('map')).toBe(false);

    touch.setActionState('tractor', true);
    expect(manager.isActionPressed('tractor')).toBe(true);
    touch.setActionState('tractor', false);
    expect(manager.isActionPressed('tractor')).toBe(false);
  });

  it('allows explicit mode switches and notifications', () => {
    const manager = new InputManager();
    let modeChangedTo = '';
    manager.onModeChange((mode) => {
      modeChangedTo = mode;
    });

    manager.setMode('touch');
    expect(manager.getMode()).toBe('touch');
    expect(modeChangedTo).toBe('touch');
  });
});
