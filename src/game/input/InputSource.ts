import type { GameAction, NormalizedAxes } from '../../protocol';

export interface NormalizedInputState {
  axes: NormalizedAxes; // x: yaw (-1 left, +1 right), y: pitch (-1 down, +1 up)
  roll: number;         // -1 left, +1 right
  throttle: number;     // 0.0 to 1.0 (or -1.0 to 1.0 for reverse)
}

export interface InputSource {
  readonly id: string;
  readonly isConnected: boolean;
  getInputState(): NormalizedInputState;
  consumeAction(action: GameAction): boolean;
  isActionPressed(action: GameAction): boolean;
  dispose(): void;
}
