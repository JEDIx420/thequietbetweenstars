/**
 * Device and role detection heuristics
 */

export function isExplicitCompanionMode(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('mode') === 'companion' || params.has('session');
}

export function isMobileOrPhoneDevice(): boolean {
  if (typeof window === 'undefined') return false;

  // Touch capability
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // Screen size check (typical phones/tablets)
  const isSmallScreen = Math.min(window.screen.width, window.screen.height) < 768;

  // User-agent hint for mobile devices
  const ua = navigator.userAgent.toLowerCase();
  const isMobileUA = /android|iphone|ipad|ipod|mobile|blackberry|iemobile|opera mini/i.test(ua);

  return (hasTouch && isSmallScreen) || (hasTouch && isMobileUA);
}

export interface PairingUrlParams {
  mode?: string;
  session?: string;
  token?: string;
  signaling?: string;
}

export function getPairingParams(): PairingUrlParams {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  return {
    mode: params.get('mode') ?? undefined,
    session: params.get('session') ?? undefined,
    token: params.get('token') ?? undefined,
    signaling: params.get('signaling') ?? undefined,
  };
}
