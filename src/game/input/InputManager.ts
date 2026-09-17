import type { GameAction } from '../../protocol';
import type { NormalizedInputState } from './InputSource';
import { KeyboardInput } from './KeyboardInput';
import { TouchInput } from './TouchInput';
import { clamp } from '../../protocol';

export type ActiveInputMode = 'keyboard' | 'touch' | 'hybrid';

export class InputManager {
  private keyboard: KeyboardInput;
  private touch: TouchInput;
  private mode: ActiveInputMode = 'hybrid';
  private onModeChangeCallbacks: Array<(mode: ActiveInputMode) => void> = [];

  constructor() {
    this.keyboard = new KeyboardInput();
    this.touch = new TouchInput();
  }

  public getKeyboardSource(): KeyboardInput {
    return this.keyboard;
  }

  public getTouchSource(): TouchInput {
    return this.touch;
  }

  public setMode(mode: ActiveInputMode): void {
    if (this.mode !== mode) {
      this.mode = mode;
      for (const cb of this.onModeChangeCallbacks) {
        cb(mode);
      }
    }
  }

  public getMode(): ActiveInputMode {
    return this.mode;
  }

  public onModeChange(cb: (mode: ActiveInputMode) => void): () => void {
    this.onModeChangeCallbacks.push(cb);
    return () => {
      this.onModeChangeCallbacks = this.onModeChangeCallbacks.filter((c) => c !== cb);
    };
  }

  public getNormalizedInput(): NormalizedInputState {
    const kb = this.keyboard.getInputState();
    const tc = this.touch.getInputState();

    if (this.mode === 'keyboard') {
      return kb;
    }
    if (this.mode === 'touch') {
      return tc;
    }

    // Hybrid mode: combine inputs seamlessly so touch and keyboard both work instantly
    const blendedThrottle = Math.abs(tc.throttle) > 0.001 ? tc.throttle : kb.throttle;

    return {
      axes: {
        x: clamp(kb.axes.x + tc.axes.x, -1, 1),
        y: clamp(kb.axes.y + tc.axes.y, -1, 1),
      },
      roll: clamp(kb.roll + tc.roll, -1, 1),
      throttle: blendedThrottle,
    };
  }

  public consumeAction(action: GameAction): boolean {
    return this.keyboard.consumeAction(action) || this.touch.consumeAction(action);
  }

  public isActionPressed(action: GameAction): boolean {
    return this.keyboard.isActionPressed(action) || this.touch.isActionPressed(action);
  }

  public dispose(): void {
    this.keyboard.dispose();
    this.touch.dispose();
    this.onModeChangeCallbacks = [];
  }
}
