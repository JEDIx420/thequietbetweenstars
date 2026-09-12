/**
 * Cryptographically secure session credentials
 */

const SAFE_ALPHANUMERIC = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Generates an easy-to-read, unambiguous 6-character session code (e.g., "7K9M4X")
 */
export function generateSessionCode(length = 6): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  let code = '';
  for (let i = 0; i < length; i++) {
    code += SAFE_ALPHANUMERIC[bytes[i] % SAFE_ALPHANUMERIC.length];
  }
  return code;
}

/**
 * Generates a high-entropy secret token for session authorization (32 hex characters)
 */
export function generateSecureToken(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Validates session code format
 */
export function isValidSessionCode(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  const clean = code.trim().toUpperCase();
  return /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4,10}$/.test(clean);
}
