import { describe, it, expect } from 'vitest';
import {
  PROTOCOL_VERSION,
  deserializeMessage,
  serializeMessage,
  clamp,
  applyDeadzone,
  sanitizeAxes,
  type RealtimeInputMessage,
  type ActionMessage,
  type HandshakeMessage,
} from '../src/protocol';

describe('Protocol Serialization & Validation', () => {
  it('serializes and deserializes RealtimeInputMessage correctly', () => {
    const original: RealtimeInputMessage = {
      type: 'realtime_input',
      seq: 42,
      timestamp: 1700000000000,
      axes: { x: 0.75, y: -0.5 },
      look: { x: 0, y: 0 },
      throttle: 0.85,
    };

    const serialized = serializeMessage(original);
    const deserialized = deserializeMessage(serialized) as RealtimeInputMessage;

    expect(deserialized).not.toBeNull();
    expect(deserialized.type).toBe('realtime_input');
    expect(deserialized.seq).toBe(42);
    expect(deserialized.axes.x).toBeCloseTo(0.75);
    expect(deserialized.axes.y).toBeCloseTo(-0.5);
    expect(deserialized.throttle).toBeCloseTo(0.85);
  });

  it('serializes and deserializes ActionMessage correctly', () => {
    const actionMsg: ActionMessage = {
      type: 'action',
      seq: 10,
      action: 'scan',
      state: 'down',
      timestamp: 1700000000000,
      payload: { targetSector: 'Orion-7' },
    };

    const serialized = serializeMessage(actionMsg);
    const deserialized = deserializeMessage(serialized) as ActionMessage;

    expect(deserialized).not.toBeNull();
    expect(deserialized.action).toBe('scan');
    expect(deserialized.state).toBe('down');
    expect(deserialized.payload?.targetSector).toBe('Orion-7');
  });

  it('validates HandshakeMessage version', () => {
    const handshake: HandshakeMessage = {
      type: 'handshake',
      version: PROTOCOL_VERSION,
      role: 'companion',
      clientId: 'device-123',
      timestamp: Date.now(),
    };

    const msg = deserializeMessage(serializeMessage(handshake)) as HandshakeMessage;
    expect(msg.version).toBe(PROTOCOL_VERSION);
    expect(msg.role).toBe('companion');
  });

  it('gracefully handles malformed JSON without crashing', () => {
    expect(deserializeMessage('{ invalid json ...')).toBeNull();
    expect(deserializeMessage('')).toBeNull();
    expect(deserializeMessage('123')).toBeNull();
    expect(deserializeMessage('{"foo":"bar"}')).toBeNull(); // Missing type
  });
});

describe('Input Math Helpers', () => {
  it('clamps values correctly', () => {
    expect(clamp(1.5, -1, 1)).toBe(1);
    expect(clamp(-2.0, -1, 1)).toBe(-1);
    expect(clamp(0.4, -1, 1)).toBe(0.4);
    expect(clamp(NaN, -1, 1)).toBe(0);
  });

  it('applies deadzone to small joystick jitter', () => {
    expect(applyDeadzone(0.04, 0.08)).toBe(0);
    expect(applyDeadzone(-0.06, 0.08)).toBe(0);
    expect(applyDeadzone(0.5, 0.08)).toBeGreaterThan(0.4);
    expect(applyDeadzone(1.0, 0.08)).toBe(1.0);
    expect(applyDeadzone(-1.0, 0.08)).toBe(-1.0);
  });

  it('sanitizes and clamps axes', () => {
    const raw = { x: 1.5, y: -0.02 };
    const sanitized = sanitizeAxes(raw, 0.08);

    expect(sanitized.x).toBe(1.0);
    expect(sanitized.y).toBe(0); // within deadzone
  });
});
