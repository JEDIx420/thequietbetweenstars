/**
 * Centralized Signaling Configuration
 * 
 * Defines deterministic signaling endpoint resolution:
 * - In DEVELOPMENT: Uses VITE_SIGNALING_URL if set; otherwise defaults to ws://localhost:8787/ws
 * - In PRODUCTION: Uses VITE_SIGNALING_URL if set; otherwise returns null (signaling unavailable).
 *   Never attempts to connect to static hosts (like GitHub Pages) as a WebSocket server.
 */

export function getSignalingUrl(override?: string): string | null {
  if (override && override.trim().length > 0) {
    return override.trim();
  }

  const envUrl = import.meta.env.VITE_SIGNALING_URL?.trim();
  if (envUrl && envUrl.length > 0) {
    return envUrl;
  }

  // Local development fallback
  if (import.meta.env.DEV) {
    return 'ws://localhost:8787/ws';
  }

  // In production (GitHub Pages), signaling is unavailable unless explicitly configured
  return null;
}

export function isSignalingAvailable(override?: string): boolean {
  return getSignalingUrl(override) !== null;
}
