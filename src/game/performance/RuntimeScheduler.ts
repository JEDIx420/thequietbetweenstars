import { FlightPhase } from '../flight/FlightStateMachine';

export type PauseReason = 'modal' | 'orientation' | 'hidden' | 'title' | 'custom';

export class RuntimeScheduler {
  private pauseReasons: Set<string> = new Set();
  private currentPhase: FlightPhase = FlightPhase.SYSTEM_CRUISE;

  // Cadence timing accumulators
  private simAccumulator = 0;
  private ambientAccumulator = 0;
  private telemetryAccumulator = 0;

  // Cadence intervals in seconds
  public readonly simInterval = 1 / 30; // ~33.3ms (30 Hz)
  public readonly ambientInterval = 1 / 8; // ~125ms (8 Hz)
  public readonly telemetryInterval = 1 / 10; // 100ms (10 Hz)
  public readonly maxClampedDt = 0.1; // Max 100ms per frame to prevent simulation explosion

  // Callbacks
  private simulationCallbacks: Array<(dt: number) => void> = [];
  private ambientCallbacks: Array<(dt: number) => void> = [];
  private telemetryCallbacks: Array<() => void> = [];

  constructor() {}

  public setPhase(phase: FlightPhase): void {
    this.currentPhase = phase;
  }

  public getPhase(): FlightPhase {
    return this.currentPhase;
  }

  public addPauseReason(reason: PauseReason | string): void {
    this.pauseReasons.add(reason);
  }

  public removePauseReason(reason: PauseReason | string): void {
    this.pauseReasons.delete(reason);
  }

  public hasPauseReason(reason: PauseReason | string): boolean {
    return this.pauseReasons.has(reason);
  }

  public isPaused(): boolean {
    return this.pauseReasons.size > 0;
  }

  public resetTiming(): void {
    this.simAccumulator = 0;
    this.ambientAccumulator = 0;
    this.telemetryAccumulator = 0;
  }

  public onSimulation(cb: (dt: number) => void): () => void {
    this.simulationCallbacks.push(cb);
    return () => {
      this.simulationCallbacks = this.simulationCallbacks.filter((c) => c !== cb);
    };
  }

  public onAmbient(cb: (dt: number) => void): () => void {
    this.ambientCallbacks.push(cb);
    return () => {
      this.ambientCallbacks = this.ambientCallbacks.filter((c) => c !== cb);
    };
  }

  public onTelemetry(cb: () => void): () => void {
    this.telemetryCallbacks.push(cb);
    return () => {
      this.telemetryCallbacks = this.telemetryCallbacks.filter((c) => c !== cb);
    };
  }

  /**
   * Evaluates phase runtime isolation policies.
   */
  public shouldRunSpaceFlight(): boolean {
    return (
      this.currentPhase === FlightPhase.SYSTEM_CRUISE ||
      this.currentPhase === FlightPhase.PLANET_APPROACH ||
      this.currentPhase === FlightPhase.STELLAR_CRUISE
    );
  }

  public shouldRunSurfaceFlight(): boolean {
    return this.currentPhase === FlightPhase.SURFACE_FLIGHT;
  }

  public shouldRunOrbit(): boolean {
    return this.currentPhase === FlightPhase.ORBIT;
  }

  public shouldRunEntry(): boolean {
    return this.currentPhase === FlightPhase.ENTRY;
  }

  public shouldRunAscent(): boolean {
    return this.currentPhase === FlightPhase.ASCENT;
  }

  /**
   * Advances scheduler cadence clocks and triggers domain callbacks.
   * Returns sanitized/clamped dt.
   */
  public advance(rawDt: number): {
    dt: number;
    didSimTick: boolean;
    didAmbientTick: boolean;
    didTelemetryTick: boolean;
  } {
    const dt = Math.min(rawDt, this.maxClampedDt);

    if (this.isPaused()) {
      return { dt: 0, didSimTick: false, didAmbientTick: false, didTelemetryTick: false };
    }

    this.simAccumulator += dt;
    this.ambientAccumulator += dt;
    this.telemetryAccumulator += dt;

    let didSimTick = false;
    let didAmbientTick = false;
    let didTelemetryTick = false;

    if (this.simAccumulator >= this.simInterval) {
      const simDt = this.simAccumulator;
      this.simAccumulator = 0;
      didSimTick = true;
      for (const cb of this.simulationCallbacks) {
        cb(simDt);
      }
    }

    if (this.ambientAccumulator >= this.ambientInterval) {
      const ambDt = this.ambientAccumulator;
      this.ambientAccumulator = 0;
      didAmbientTick = true;
      for (const cb of this.ambientCallbacks) {
        cb(ambDt);
      }
    }

    if (this.telemetryAccumulator >= this.telemetryInterval) {
      this.telemetryAccumulator = 0;
      didTelemetryTick = true;
      for (const cb of this.telemetryCallbacks) {
        cb();
      }
    }

    return { dt, didSimTick, didAmbientTick, didTelemetryTick };
  }

  public dispose(): void {
    this.simulationCallbacks = [];
    this.ambientCallbacks = [];
    this.telemetryCallbacks = [];
    this.pauseReasons.clear();
  }
}
