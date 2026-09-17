import type { NarrativeDirector } from '../narrative/NarrativeDirector';
import type { NarrativeContext } from '../narrative/NarrativeTypes';

export type TutorialStep =
  | 'WAKE_INTRO'
  | 'STEER_INPUT'
  | 'THROTTLE_INPUT'
  | 'SCAN_ACTION'
  | 'RADAR_TARGET'
  | 'OPEN_MAP'
  | 'SET_COURSE'
  | 'ENGAGE_CRUISE'
  | 'ARRIVAL'
  | 'APPROACH_PLANET'
  | 'LAND_SURFACE'
  | 'SCAN_DISCOVERY'
  | 'OPEN_JOURNAL'
  | 'COMPLETED';

export interface TutorialState {
  started: boolean;
  completed: boolean;
  step: TutorialStep;
  skipped: boolean;
}

export class TutorialDirector {
  private narrative: NarrativeDirector;
  private state: TutorialState = {
    started: false,
    completed: false,
    step: 'WAKE_INTRO',
    skipped: false,
  };

  private onPromptChangeCallback: ((prompt: string | null) => void) | null = null;
  private onCompanionHintCallback: ((action: string, prompt: string) => void) | null = null;
  private getContextFn: () => NarrativeContext;
  private inputMode: 'keyboard' | 'companion' = 'keyboard';
  private stepTimer = 0;

  constructor(narrative: NarrativeDirector, getContextFn: () => NarrativeContext) {
    this.narrative = narrative;
    this.getContextFn = getContextFn;
  }

  public setCallbacks(
    onPrompt: (prompt: string | null) => void,
    onCompanionHint?: (action: string, prompt: string) => void
  ): void {
    this.onPromptChangeCallback = onPrompt;
    if (onCompanionHint) this.onCompanionHintCallback = onCompanionHint;
  }

  public setInputMode(mode: 'keyboard' | 'companion'): void {
    this.inputMode = mode;
    if (this.state.started && !this.state.completed && !this.state.skipped) {
      this.updatePromptForCurrentStep();
    }
  }

  public loadState(state: Partial<TutorialState>): void {
    this.state = { ...this.state, ...state };
    if (this.state.started && !this.state.completed && !this.state.skipped) {
      this.updatePromptForCurrentStep();
    }
  }

  public getState(): TutorialState {
    return { ...this.state };
  }

  public isComplete(): boolean {
    return this.state.completed || this.state.skipped;
  }

  public reset(): void {
    this.state = {
      started: false,
      completed: false,
      step: 'WAKE_INTRO',
      skipped: false,
    };
    if (this.onPromptChangeCallback) this.onPromptChangeCallback(null);
  }

  public start(): void {
    if (this.state.completed || this.state.skipped) return;
    this.state.started = true;
    this.state.step = 'WAKE_INTRO';
    this.stepTimer = performance.now();

    // Trigger ship computer wake dialogue
    this.narrative.trigger('first_wake', {}, this.getContextFn(), {
      forceOnce: true,
      priority: 'urgent',
    });

    this.updatePromptForCurrentStep();
  }

  public skip(): void {
    this.state.skipped = true;
    this.state.completed = true;
    if (this.onPromptChangeCallback) this.onPromptChangeCallback(null);
  }

  public update(): void {
    if (!this.state.started || this.state.completed || this.state.skipped) return;

    // Advance automatically from WAKE_INTRO after dialogue starts
    if (this.state.step === 'WAKE_INTRO') {
      if (performance.now() - this.stepTimer > 4000) {
        this.advanceTo('STEER_INPUT');
      }
    }
  }

  // Called when real player actions are detected in the engine
  public onPlayerSteer(): void {
    if (this.state.step === 'STEER_INPUT') {
      this.narrative.trigger('first_steer', {}, this.getContextFn(), { forceOnce: true });
      this.advanceTo('THROTTLE_INPUT');
    }
  }

  public onPlayerThrottle(): void {
    if (this.state.step === 'THROTTLE_INPUT') {
      this.narrative.trigger('first_throttle', {}, this.getContextFn(), { forceOnce: true });
      this.advanceTo('SCAN_ACTION');
    }
  }

  public onPlayerScan(): void {
    if (this.state.step === 'SCAN_ACTION') {
      this.narrative.trigger('first_scan', {}, this.getContextFn(), { forceOnce: true });
      this.advanceTo('RADAR_TARGET');
    }
  }

  public onPlayerTargetCycle(): void {
    if (this.state.step === 'RADAR_TARGET') {
      this.advanceTo('OPEN_MAP');
    }
  }

  public onPlayerOpenMap(): void {
    if (this.state.step === 'OPEN_MAP') {
      this.narrative.trigger('first_map_open', {}, this.getContextFn(), { forceOnce: true });
      this.advanceTo('SET_COURSE');
    }
  }

  public onPlayerSetCourse(systemName: string, distance: string): void {
    if (this.state.step === 'SET_COURSE') {
      this.narrative.trigger('course_set', { systemName, distance }, this.getContextFn());
      this.advanceTo('ENGAGE_CRUISE');
    }
  }

  public onPlayerEngageCruise(systemName: string): void {
    if (this.state.step === 'ENGAGE_CRUISE') {
      this.narrative.trigger('deep_cruise_start', { systemName }, this.getContextFn());
      this.advanceTo('ARRIVAL');
    }
  }

  public onPlayerArrival(systemName: string, planetCount: number): void {
    if (this.state.step === 'ARRIVAL') {
      this.narrative.trigger(
        'deep_cruise_arrival',
        { systemName, planetCount },
        this.getContextFn(),
        { priority: 'urgent' }
      );
      this.advanceTo('APPROACH_PLANET');
    }
  }

  public onPlayerOrbit(): void {
    if (this.state.step === 'APPROACH_PLANET') {
      this.advanceTo('LAND_SURFACE');
    }
  }

  public onPlayerLand(): void {
    if (this.state.step === 'LAND_SURFACE') {
      this.advanceTo('SCAN_DISCOVERY');
    }
  }

  public onPlayerDiscovery(): void {
    if (this.state.step === 'SCAN_DISCOVERY') {
      this.advanceTo('OPEN_JOURNAL');
    }
  }

  public onPlayerOpenJournal(): void {
    if (this.state.step === 'OPEN_JOURNAL') {
      this.complete();
    }
  }

  private advanceTo(nextStep: TutorialStep): void {
    this.state.step = nextStep;
    this.stepTimer = performance.now();
    this.updatePromptForCurrentStep();
  }

  private complete(): void {
    this.state.completed = true;
    if (this.onPromptChangeCallback) {
      this.onPromptChangeCallback('EXPEDITION ACTIVE // This is a cosmic road trip. Pick somewhere and fly.');
      setTimeout(() => {
        if (this.onPromptChangeCallback) this.onPromptChangeCallback(null);
      }, 5000);
    }
  }

  private updatePromptForCurrentStep(): void {
    if (!this.onPromptChangeCallback) return;
    const isKb = this.inputMode === 'keyboard';

    let text = '';
    let companionAction = '';

    switch (this.state.step) {
      case 'WAKE_INTRO':
        text = 'SYSTEMS INITIALIZING...';
        break;

      case 'STEER_INPUT':
        text = isKb ? 'GUIDANCE: Test flight pitch and yaw [W / S / A / D]' : 'GUIDANCE: Gently nudge the left Joystick';
        companionAction = 'joystick';
        break;

      case 'THROTTLE_INPUT':
        text = isKb ? 'PROPULSION: Advance throttle forward [Hold Shift to Accelerate]' : 'PROPULSION: Slide the Throttle control up';
        companionAction = 'throttle';
        break;

      case 'SCAN_ACTION':
        text = isKb ? 'SENSORS: Emit acoustic resonance scanner pulse [Space]' : 'SENSORS: Tap SCAN on your controller';
        companionAction = 'scan';
        break;

      case 'RADAR_TARGET':
        text = isKb ? 'NAVIGATION: Cycle celestial bodies on radar [Tab]' : 'NAVIGATION: Tap TARGET on your controller';
        companionAction = 'target';
        break;

      case 'OPEN_MAP':
        text = isKb ? 'CARTOGRAPHY: Open the galactic star chart [M]' : 'CARTOGRAPHY: Tap MAP on your controller';
        companionAction = 'map';
        break;

      case 'SET_COURSE':
        text = 'CARTOGRAPHY: Select a destination in Star Chart [M] and click LOCK COURSE or ENGAGE WARP DRIVE';
        break;

      case 'ENGAGE_CRUISE':
        text = isKb ? 'INTERSTELLAR: Warp Drive ready — press [X] or engage via Star Chart [M]' : 'INTERSTELLAR: Tap WARP / AUTO on controller';
        companionAction = 'autopilot';
        break;

      case 'ARRIVAL':
        text = 'TRANSIT: Interstellar warp in progress...';
        break;

      case 'APPROACH_PLANET':
        text = 'EXPLORATION: Approach a celestial body and enter orbit [Space when close]';
        break;

      case 'LAND_SURFACE':
        text = 'DESCENT: Select a landing site and enter planetary atmosphere';
        break;

      case 'SCAN_DISCOVERY':
        text = isKb ? 'SURVEY: Approach a landmark, flora, or fauna and scan [Space]' : 'SURVEY: Approach local life or formations and tap SCAN';
        companionAction = 'scan';
        break;

      case 'OPEN_JOURNAL':
        text = isKb ? 'EXPEDITION LOG: Inspect recorded discoveries in Ship Log [J]' : 'EXPEDITION LOG: Tap LOG on your controller';
        companionAction = 'journal';
        break;

      case 'COMPLETED':
        text = '';
        break;
    }

    this.onPromptChangeCallback(text || null);

    if (this.onCompanionHintCallback && companionAction) {
      this.onCompanionHintCallback(companionAction, text);
    }
  }
}
