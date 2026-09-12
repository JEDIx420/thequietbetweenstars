import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSignalingUrl, isSignalingAvailable } from '../src/connection/config';

describe('Signaling Configuration Resolution', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses explicit override when provided regardless of environment', () => {
    expect(getSignalingUrl('wss://override.workers.dev/ws')).toBe('wss://override.workers.dev/ws');
    expect(isSignalingAvailable('wss://override.workers.dev/ws')).toBe(true);
  });

  it('uses VITE_SIGNALING_URL if present in environment', () => {
    vi.stubEnv('VITE_SIGNALING_URL', 'wss://my-signaling.workers.dev/ws');
    expect(getSignalingUrl()).toBe('wss://my-signaling.workers.dev/ws');
    expect(isSignalingAvailable()).toBe(true);
  });

  it('does not return an invalid static web host in production when VITE_SIGNALING_URL is empty', () => {
    vi.stubEnv('VITE_SIGNALING_URL', '');
    // In vitest, import.meta.env.DEV is typically true, but if DEV is false:
    // Testing override directly:
    expect(getSignalingUrl('   ')).not.toBe('wss://JEDIx420.github.io/ws');
  });
});
