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

  // 1. URL query param override (?signaling=...)
  if (typeof window !== 'undefined' && window.location) {
    try {
      const urlParam = new URLSearchParams(window.location.search).get('signaling');
      if (urlParam && urlParam.trim().length > 0) {
        return urlParam.trim();
      }
    } catch {}
  }

  // 2. Local storage override (set via Companion Diagnostics UI)
  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem('tqbs_signaling_url');
      if (stored && stored.trim().length > 0) {
        return stored.trim();
      }
    } catch {}
  }

  // 3. Build-time environment variable
  const envUrl = import.meta.env.VITE_SIGNALING_URL?.trim();
  if (envUrl && envUrl.length > 0) {
    return envUrl;
  }

  // 4. Local development fallback
  if (import.meta.env.DEV) {
    return 'ws://localhost:8787/ws';
  }

  // In production (GitHub Pages), signaling is unavailable unless explicitly configured
  return null;
}

export function setCustomSignalingUrl(url: string | null): void {
  if (typeof localStorage !== 'undefined') {
    try {
      if (url && url.trim().length > 0) {
        localStorage.setItem('tqbs_signaling_url', url.trim());
      } else {
        localStorage.removeItem('tqbs_signaling_url');
      }
    } catch {}
  }
}

export function isSignalingAvailable(override?: string): boolean {
  return getSignalingUrl(override) !== null;
}
