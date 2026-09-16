import type { GameAction } from '../../protocol';
import type { InputSource, NormalizedInputState } from './InputSource';
import { clamp } from '../../protocol';

export class KeyboardInput implements InputSource {
  public readonly id = 'keyboard';
  public isConnected = true;

  private activeKeys = new Set<string>();
  private triggeredActions = new Set<GameAction>();

  private smoothedPitch = 0;
  private smoothedYaw = 0;
  private smoothedRoll = 0;
  private currentThrottle = 0;

  private onKeyDownBound: ((e: KeyboardEvent) => void) | null = null;
  private onKeyUpBound: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.onKeyDownBound = (e) => this.handleKeyDown(e);
      this.onKeyUpBound = (e) => this.handleKeyUp(e);

      window.addEventListener('keydown', this.onKeyDownBound);
      window.addEventListener('keyup', this.onKeyUpBound);
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Prevent default for game keys to avoid scrolling
    const code = e.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
      e.preventDefault();
    }

    this.activeKeys.add(code);

    if (code === 'Space') {
      this.triggeredActions.add('scan');
    } else if (code === 'KeyM') {
      this.triggeredActions.add('map');
    } else if (code === 'KeyJ') {
      this.triggeredActions.add('journal');
    } else if (code === 'Tab') {
      e.preventDefault();
      this.triggeredActions.add('cycle_target');
    } else if (code === 'KeyX') {
      this.triggeredActions.add('autopilot');
    } else if (code === 'KeyP' || code === 'Escape') {
      this.triggeredActions.add('pause');
    } else if (code === 'KeyE') {
      this.triggeredActions.add('interact');
    } else if (code === 'KeyU') {
      this.triggeredActions.add('supply');
    } else if (code === 'KeyH' || code === 'Slash') {
      this.triggeredActions.add('help');
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.activeKeys.delete(e.code);
  }

  public getInputState(): NormalizedInputState {
    let targetPitch = 0;
    let targetYaw = 0;
    let targetRoll = 0;

    // Pitch: W / Up (pitch down), S / Down (pitch up)
    if (this.activeKeys.has('KeyW') || this.activeKeys.has('ArrowUp')) {
      targetPitch += 1;
    }
    if (this.activeKeys.has('KeyS') || this.activeKeys.has('ArrowDown')) {
      targetPitch -= 1;
    }

    // Yaw: A / Left (turn left), D / Right (turn right)
    if (this.activeKeys.has('KeyA') || this.activeKeys.has('ArrowLeft')) {
      targetYaw -= 1;
    }
    if (this.activeKeys.has('KeyD') || this.activeKeys.has('ArrowRight')) {
      targetYaw += 1;
    }

    // Roll: Q / E
    if (this.activeKeys.has('KeyQ')) {
      targetRoll -= 1;
    }
    if (this.activeKeys.has('KeyE') && !this.activeKeys.has('KeyW')) {
      // Allow E for roll when not interacting
      targetRoll += 1;
    }

    // Throttle adjustments: Real accelerator pedal dynamics
    // Holding Shift increases thrust smoothly up towards 1.0 (100%).
    // Releasing Shift automatically reduces thrust smoothly back down towards 0.0 (idle).
    // Ctrl / Alt / Backspace applies active retro-thrust braking.
    const isAccelerating = this.activeKeys.has('ShiftLeft') || this.activeKeys.has('ShiftRight');
    const isBraking = this.activeKeys.has('ControlLeft') || this.activeKeys.has('ControlRight') || this.activeKeys.has('AltLeft') || this.activeKeys.has('Backspace');

    if (isAccelerating) {
      // Rapid acceleration response up to 100%
      this.currentThrottle = clamp(this.currentThrottle + 0.035, 0, 1);
    } else if (isBraking) {
      // Fast active retro-braking
      this.currentThrottle = clamp(this.currentThrottle - 0.07, 0, 1);
    } else {
      // Natural accelerator release: smoothly reduce throttle back down to 0
      if (this.currentThrottle > 0) {
        this.currentThrottle = Math.max(0, this.currentThrottle - 0.025);
      }
    }

    // Smooth response
    const smoothFactor = 0.15;
    this.smoothedPitch += (targetPitch - this.smoothedPitch) * smoothFactor;
    this.smoothedYaw += (targetYaw - this.smoothedYaw) * smoothFactor;
    this.smoothedRoll += (targetRoll - this.smoothedRoll) * smoothFactor;

    return {
      axes: {
        x: clamp(this.smoothedYaw, -1, 1),
        y: clamp(this.smoothedPitch, -1, 1),
      },
      roll: clamp(this.smoothedRoll, -1, 1),
      throttle: this.currentThrottle,
    };
  }

  public consumeAction(action: GameAction): boolean {
    if (this.triggeredActions.has(action)) {
      this.triggeredActions.delete(action);
      return true;
    }
    return false;
  }

  public isActionPressed(action: GameAction): boolean {
    if (action === 'scan') return this.activeKeys.has('Space');
    if (action === 'map') return this.activeKeys.has('KeyM');
    if (action === 'autopilot') return this.activeKeys.has('KeyX');
    if (action === 'pause') return this.activeKeys.has('KeyP') || this.activeKeys.has('Escape');
    return false;
  }

  public setThrottle(val: number): void {
    this.currentThrottle = clamp(val, 0, 1);
  }

  public dispose(): void {
    if (typeof window !== 'undefined') {
      if (this.onKeyDownBound) window.removeEventListener('keydown', this.onKeyDownBound);
      if (this.onKeyUpBound) window.removeEventListener('keyup', this.onKeyUpBound);
    }
    this.activeKeys.clear();
    this.triggeredActions.clear();
  }
}
