import type { GameAction, RealtimeInputMessage, ActionMessage } from '../../protocol';
import type { InputSource, NormalizedInputState } from './InputSource';
import { clamp, applyDeadzone } from '../../protocol';

export class CompanionInput implements InputSource {
  public readonly id = 'companion';
  public isConnected = false;

  private latestAxes = { x: 0, y: 0 };
  private latestRoll = 0;
  private latestThrottle = 0;

  private actionQueue = new Set<GameAction>();
  private activeActions = new Set<GameAction>();

  public handleRealtimeInput(msg: RealtimeInputMessage): void {
    this.isConnected = true;
    this.latestAxes = {
      x: applyDeadzone(clamp(msg.axes.x, -1, 1)),
      y: applyDeadzone(clamp(msg.axes.y, -1, 1)),
    };
    this.latestThrottle = clamp(msg.throttle, 0, 1);
  }

  public handleAction(msg: ActionMessage): void {
    this.isConnected = true;
    if (msg.state === 'down' || msg.state === 'trigger') {
      this.actionQueue.add(msg.action);
      this.activeActions.add(msg.action);
    } else if (msg.state === 'up') {
      this.activeActions.delete(msg.action);
    }
  }

  public getInputState(): NormalizedInputState {
    return {
      axes: { ...this.latestAxes },
      roll: this.latestRoll,
      throttle: this.latestThrottle,
    };
  }

  public consumeAction(action: GameAction): boolean {
    if (this.actionQueue.has(action)) {
      this.actionQueue.delete(action);
      return true;
    }
    return false;
  }

  public isActionPressed(action: GameAction): boolean {
    return this.activeActions.has(action);
  }

  public reset(): void {
    this.latestAxes = { x: 0, y: 0 };
    this.latestRoll = 0;
    this.latestThrottle = 0;
    this.actionQueue.clear();
    this.activeActions.clear();
    this.isConnected = false;
  }

  public dispose(): void {
    this.reset();
  }
}
