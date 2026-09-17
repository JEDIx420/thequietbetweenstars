export enum FlightPhase {
  DEEP_SPACE = 'DEEP_SPACE',
  SYSTEM_CRUISE = 'SYSTEM_CRUISE',
  PLANET_APPROACH = 'PLANET_APPROACH',
  ORBIT = 'ORBIT',
  ENTRY = 'ENTRY',
  SURFACE_FLIGHT = 'SURFACE_FLIGHT',
  ASCENT = 'ASCENT',
  STELLAR_CRUISE = 'STELLAR_CRUISE',
}

export type StateChangeCallback = (from: FlightPhase, to: FlightPhase) => void;

export class FlightStateMachine {
  private currentPhase: FlightPhase = FlightPhase.SYSTEM_CRUISE;
  private listeners: StateChangeCallback[] = [];

  constructor(initialPhase: FlightPhase = FlightPhase.SYSTEM_CRUISE) {
    this.currentPhase = initialPhase;
  }

  public getPhase(): FlightPhase {
    return this.currentPhase;
  }

  public onPhaseChange(cb: StateChangeCallback): void {
    this.listeners.push(cb);
  }

  public canTransition(target: FlightPhase): boolean {
    const from = this.currentPhase;
    if (from === target) return false;

    switch (from) {
      case FlightPhase.DEEP_SPACE:
        return target === FlightPhase.SYSTEM_CRUISE || target === FlightPhase.STELLAR_CRUISE;
      case FlightPhase.SYSTEM_CRUISE:
        return target === FlightPhase.DEEP_SPACE || target === FlightPhase.PLANET_APPROACH || target === FlightPhase.STELLAR_CRUISE;
      case FlightPhase.STELLAR_CRUISE:
        return target === FlightPhase.SYSTEM_CRUISE || target === FlightPhase.DEEP_SPACE || target === FlightPhase.PLANET_APPROACH;
      case FlightPhase.PLANET_APPROACH:
        return target === FlightPhase.SYSTEM_CRUISE || target === FlightPhase.ORBIT || target === FlightPhase.STELLAR_CRUISE;
      case FlightPhase.ORBIT:
        return target === FlightPhase.SYSTEM_CRUISE || target === FlightPhase.ENTRY || target === FlightPhase.STELLAR_CRUISE;
      case FlightPhase.ENTRY:
        return target === FlightPhase.SURFACE_FLIGHT || target === FlightPhase.ORBIT;
      case FlightPhase.SURFACE_FLIGHT:
        return target === FlightPhase.ASCENT;
      case FlightPhase.ASCENT:
        return target === FlightPhase.ORBIT;
      default:
        return false;
    }
  }

  public transitionTo(target: FlightPhase): boolean {
    if (!this.canTransition(target)) {
      console.warn(`[FlightStateMachine] Invalid transition from ${this.currentPhase} to ${target}`);
      return false;
    }

    const previous = this.currentPhase;
    this.currentPhase = target;

    for (const cb of this.listeners) {
      cb(previous, target);
    }
    return true;
  }

  /**
   * Directly sets the phase when restoring state on load
   */
  public forcePhase(phase: FlightPhase): void {
    const prev = this.currentPhase;
    this.currentPhase = phase;
    for (const cb of this.listeners) {
      cb(prev, phase);
    }
  }
}
