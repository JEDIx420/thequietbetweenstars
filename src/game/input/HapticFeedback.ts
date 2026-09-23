import { audio } from '../../audio/AudioEngine';

/**
 * HapticFeedback
 * Unified tactical haptic and physical sensory feedback service.
 * Dispatches hardware vibration patterns on supported devices (Android, Chrome, PWA)
 * and falls back to synthesized micro-audio ticks on devices without Web Vibration API (such as iOS/iPad Safari).
 */
export class HapticFeedback {
  private static lastVibeTime = 0;
  private static minIntervalMs = 35; // Minimum interval between rapid micro-ticks

  private static canVibrate(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  }

  /**
   * Light tactile tap (e.g. button presses, flight stick engaging beyond deadzone, small clicks).
   */
  public static light(): void {
    const now = Date.now();
    if (now - this.lastVibeTime < this.minIntervalMs) return;
    this.lastVibeTime = now;

    if (this.canVibrate()) {
      try {
        navigator.vibrate(12);
      } catch {}
    } else {
      audio.playHapticTick(140, 0.015, 0.06);
    }
  }

  /**
   * Subtle notch detent (e.g. crossing 0%, 50%, or 100% on the throttle slider).
   */
  public static notch(): void {
    const now = Date.now();
    if (now - this.lastVibeTime < 45) return;
    this.lastVibeTime = now;

    if (this.canVibrate()) {
      try {
        navigator.vibrate(8);
      } catch {}
    } else {
      audio.playHapticTick(160, 0.012, 0.05);
    }
  }

  /**
   * Medium tactile pulse (e.g. target lock, radar cycle, mode toggles, brake button).
   */
  public static medium(): void {
    this.lastVibeTime = Date.now();
    if (this.canVibrate()) {
      try {
        navigator.vibrate(25);
      } catch {}
    } else {
      audio.playHapticTick(95, 0.025, 0.09);
    }
  }

  /**
   * Continuous or multi-stage scanner / tractor beam pulse.
   */
  public static scan(): void {
    this.lastVibeTime = Date.now();
    if (this.canVibrate()) {
      try {
        navigator.vibrate([15, 25, 15]);
      } catch {}
    } else {
      audio.playHapticTick(190, 0.02, 0.07);
    }
  }

  /**
   * Heavy impact or warning pulse (e.g. collisions, emergency retro-braking, atmospheric entry).
   */
  public static heavy(): void {
    this.lastVibeTime = Date.now();
    if (this.canVibrate()) {
      try {
        navigator.vibrate([40, 30, 50]);
      } catch {}
    } else {
      audio.playHapticTick(65, 0.045, 0.14);
    }
  }
}
