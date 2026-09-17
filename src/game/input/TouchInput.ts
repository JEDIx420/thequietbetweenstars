import type { GameAction, NormalizedAxes } from '../../protocol';
import type { InputSource, NormalizedInputState } from './InputSource';
import { clamp } from '../../protocol';

export class TouchInput implements InputSource {
  public readonly id = 'touch';
  public isConnected = true;

  private axes: NormalizedAxes = { x: 0, y: 0 };
  private roll = 0;
  private throttle = 0;

  private activeActions = new Set<GameAction>();
  private triggeredActions = new Set<GameAction>();

  public setAxes(axes: NormalizedAxes): void {
    this.axes = {
      x: clamp(axes.x, -1, 1),
      y: clamp(axes.y, -1, 1),
    };
  }

  public setRoll(roll: number): void {
    this.roll = clamp(roll, -1, 1);
  }

  public setThrottle(throttle: number): void {
    this.throttle = clamp(throttle, -1, 1);
  }

  public triggerAction(action: GameAction): void {
    this.triggeredActions.add(action);
  }

  public setActionState(action: GameAction, isDown: boolean): void {
    if (isDown) {
      this.activeActions.add(action);
      this.triggeredActions.add(action);
    } else {
      this.activeActions.delete(action);
    }
  }

  public getInputState(): NormalizedInputState {
    return {
      axes: { ...this.axes },
      roll: this.roll,
      throttle: this.throttle,
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
    return this.activeActions.has(action);
  }

  public dispose(): void {
    this.activeActions.clear();
    this.triggeredActions.clear();
  }
}
