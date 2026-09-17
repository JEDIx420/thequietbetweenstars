/**
 * THE QUIET BETWEEN STARS - Input Types & Normalization Utilities
 */

export type GameContext = 'space-flight' | 'planet-exploration' | 'dialogue' | 'menu';

export type GameAction =
  | 'scan'
  | 'map'
  | 'autopilot'
  | 'interact'
  | 'pause'
  | 'confirm'
  | 'cancel'
  | 'journal'
  | 'cycle_target'
  | 'help'
  | 'supply'
  | 'talk'
  | 'altitude_up'
  | 'altitude_down'
  | 'tractor';

export type ActionState = 'down' | 'up' | 'trigger';

export interface NormalizedAxes {
  x: number; // -1.0 (left) to 1.0 (right)
  y: number; // -1.0 (down/pitch-down) to 1.0 (up/pitch-up)
}

/**
 * Clamps a number between min and max
 */
export function clamp(val: number, min: number, max: number): number {
  if (Number.isNaN(val)) return 0;
  return Math.max(min, Math.min(max, val));
}

/**
 * Applies deadzone to an axis value (-1 to 1)
 */
export function applyDeadzone(value: number, deadzone = 0.08): number {
  const abs = Math.abs(value);
  if (abs <= deadzone) return 0;
  const scaled = (abs - deadzone) / (1 - deadzone);
  return Math.sign(value) * clamp(scaled, 0, 1);
}

/**
 * Normalizes and clamps axes with deadzone
 */
export function sanitizeAxes(axes: Partial<NormalizedAxes>, deadzone = 0.08): NormalizedAxes {
  return {
    x: applyDeadzone(clamp(axes.x ?? 0, -1, 1), deadzone),
    y: applyDeadzone(clamp(axes.y ?? 0, -1, 1), deadzone),
  };
}
