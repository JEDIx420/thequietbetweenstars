import type { GameAction } from '../../protocol';
import type { NormalizedInputState } from './InputSource';
import { KeyboardInput } from './KeyboardInput';
import { CompanionInput } from './CompanionInput';

export type ActiveInputMode = 'companion' | 'keyboard';

export class InputManager {
  private keyboard: KeyboardInput;
  private companion: CompanionInput;
  private mode: ActiveInputMode = 'keyboard';
  private onModeChangeCallbacks: Array<(mode: ActiveInputMode) => void> = [];

  constructor() {
    this.keyboard = new KeyboardInput();
    this.companion = new CompanionInput();
  }

  public getKeyboardSource(): KeyboardInput {
    return this.keyboard;
  }

  public getCompanionSource(): CompanionInput {
    return this.companion;
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
    if (this.mode === 'companion' && this.companion.isConnected) {
      return this.companion.getInputState();
    }
    return this.keyboard.getInputState();
  }

  public consumeAction(action: GameAction): boolean {
    if (this.mode === 'companion' && this.companion.isConnected) {
      return this.companion.consumeAction(action) || this.keyboard.consumeAction(action);
    }
    return this.keyboard.consumeAction(action);
  }

  public isActionPressed(action: GameAction): boolean {
    if (this.mode === 'companion' && this.companion.isConnected) {
      return this.companion.isActionPressed(action) || this.keyboard.isActionPressed(action);
    }
    return this.keyboard.isActionPressed(action);
  }

  public dispose(): void {
    this.keyboard.dispose();
    this.companion.dispose();
    this.onModeChangeCallbacks = [];
  }
}
