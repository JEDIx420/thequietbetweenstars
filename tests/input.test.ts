import { describe, it, expect } from 'vitest';
import { CompanionInput } from '../src/game/input/CompanionInput';
import { InputManager } from '../src/game/input/InputManager';

describe('Companion Input Normalization', () => {
  it('updates normalized axes and throttle from realtime packets', () => {
    const companion = new CompanionInput();

    companion.handleRealtimeInput({
      type: 'realtime_input',
      seq: 1,
      timestamp: Date.now(),
      axes: { x: 0.8, y: -0.6 },
      look: { x: 0, y: 0 },
      throttle: 0.75,
    });

    const state = companion.getInputState();
    expect(state.axes.x).toBeGreaterThan(0.7);
    expect(state.axes.y).toBeLessThan(-0.5);
    expect(state.throttle).toBe(0.75);
    expect(companion.isConnected).toBe(true);
  });

  it('queues and consumes discrete actions once', () => {
    const companion = new CompanionInput();

    companion.handleAction({
      type: 'action',
      seq: 1,
      action: 'scan',
      state: 'down',
      timestamp: Date.now(),
    });

    expect(companion.isActionPressed('scan')).toBe(true);
    // First consume returns true
    expect(companion.consumeAction('scan')).toBe(true);
    // Subsequent consume returns false (consumed)
    expect(companion.consumeAction('scan')).toBe(false);
  });
});

describe('Input Manager', () => {
  it('switches between keyboard and companion modes', () => {
    const manager = new InputManager();
    expect(manager.getMode()).toBe('keyboard');

    let modeChangedTo = '';
    manager.onModeChange((mode) => {
      modeChangedTo = mode;
    });

    manager.setMode('companion');
    expect(manager.getMode()).toBe('companion');
    expect(modeChangedTo).toBe('companion');
  });

  it('falls back to keyboard input when companion is not connected', () => {
    const manager = new InputManager();
    manager.setMode('companion');

    // Companion is not connected yet, should provide safe neutral state
    const input = manager.getNormalizedInput();
    expect(input.axes.x).toBe(0);
    expect(input.axes.y).toBe(0);
    expect(input.throttle).toBe(0);
  });
});
