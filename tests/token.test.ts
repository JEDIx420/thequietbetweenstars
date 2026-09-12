import { describe, it, expect } from 'vitest';
import {
  generateSessionCode,
  generateSecureToken,
  isValidSessionCode,
} from '../src/connection/token';

describe('Token and Session Security', () => {
  it('generates session codes with correct length and characters', () => {
    const code = generateSessionCode(6);
    expect(code).toHaveLength(6);
    // Should only contain unambiguous characters (no 0, O, 1, I)
    expect(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(code)).toBe(true);
  });

  it('generates unique session codes across multiple invocations', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(generateSessionCode(6));
    }
    expect(codes.size).toBe(100);
  });

  it('generates secure 32-character hex tokens', () => {
    const token = generateSecureToken();
    expect(token).toHaveLength(32);
    expect(/^[0-9a-f]{32}$/.test(token)).toBe(true);
  });

  it('validates session code format correctly', () => {
    expect(isValidSessionCode('7K9M4X')).toBe(true);
    expect(isValidSessionCode('ABCD')).toBe(true);
    expect(isValidSessionCode('12')).toBe(false); // too short
    expect(isValidSessionCode('')).toBe(false);
    expect(isValidSessionCode('STAR-492')).toBe(false); // contains dash
  });
});
