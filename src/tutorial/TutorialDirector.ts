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
  | 'DOCK_STATION'
  | 'TRADE_MARKET'
  | 'CRAFT_FABRICATOR'
  | 'SHIP_UPGRADE'
  | 'PWA_HOMESCREEN'
  | 'COMPLETED';

export interface TutorialStepInfo {
  step: TutorialStep;
  stepIndex: number;
  totalSteps: number;
  title: string;
  instruction: string;
  detail: string;
  badge: string;
  highlightSelector?: string;
  canManuallyAdvance?: boolean;
}

export interface TutorialState {
  started: boolean;
  completed: boolean;
  step: TutorialStep;
  skipped: boolean;
}

const ORDERED_STEPS: TutorialStep[] = [
  'WAKE_INTRO',
  'STEER_INPUT',
  'THROTTLE_INPUT',
  'SCAN_ACTION',
  'RADAR_TARGET',
  'OPEN_MAP',
  'ENGAGE_CRUISE',
  'APPROACH_PLANET',
  'LAND_SURFACE',
  'SCAN_DISCOVERY',
  'DOCK_STATION',
  'TRADE_MARKET',
  'CRAFT_FABRICATOR',
  'SHIP_UPGRADE',
  'PWA_HOMESCREEN',
  'COMPLETED',
];

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
  private onStepChangeCallback: ((info: TutorialStepInfo) => void) | null = null;
  private getContextFn: () => NarrativeContext;
  private inputMode: 'keyboard' | 'companion' | 'touch' = 'keyboard';
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

  public setOnStepChange(cb: (info: TutorialStepInfo) => void): void {
    this.onStepChangeCallback = cb;
  }

  public setInputMode(mode: 'keyboard' | 'companion' | 'touch'): void {
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
    if (this.onStepChangeCallback) {
      this.onStepChangeCallback(this.getStepInfo('COMPLETED'));
    }
  }

  public skipStep(): void {
    const currentIndex = ORDERED_STEPS.indexOf(this.state.step);
    if (currentIndex >= 0 && currentIndex < ORDERED_STEPS.length - 1) {
      this.advanceTo(ORDERED_STEPS[currentIndex + 1]);
    } else {
      this.complete();
    }
  }

  public update(): void {
    if (!this.state.started || this.state.completed || this.state.skipped) return;

    // Advance automatically from WAKE_INTRO after initial greeting
    if (this.state.step === 'WAKE_INTRO') {
      if (performance.now() - this.stepTimer > 3500) {
        this.advanceTo('STEER_INPUT');
      }
    }
  }

  // ==========================================
  // Milestone / Input Action Triggers
  // ==========================================
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
    } else if (this.state.step === 'SCAN_DISCOVERY') {
      this.advanceTo('DOCK_STATION');
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
      this.advanceTo('ENGAGE_CRUISE');
    }
  }

  public onPlayerSetCourse(systemName: string, distance: string): void {
    if (this.state.step === 'SET_COURSE' || this.state.step === 'OPEN_MAP') {
      this.narrative.trigger('course_set', { systemName, distance }, this.getContextFn());
      this.advanceTo('ENGAGE_CRUISE');
    }
  }

  public onPlayerEngageCruise(systemName: string): void {
    if (this.state.step === 'ENGAGE_CRUISE' || this.state.step === 'SET_COURSE') {
      this.narrative.trigger('deep_cruise_start', { systemName }, this.getContextFn());
      this.advanceTo('APPROACH_PLANET');
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
    if (this.state.step === 'APPROACH_PLANET' || this.state.step === 'ENGAGE_CRUISE') {
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
      this.advanceTo('DOCK_STATION');
    }
  }

  public onPlayerOpenJournal(): void {
    if (this.state.step === 'OPEN_JOURNAL') {
      this.advanceTo('DOCK_STATION');
    }
  }

  public onPlayerDock(_targetName?: string): void {
    if (this.state.step === 'DOCK_STATION') {
      this.advanceTo('TRADE_MARKET');
    }
  }

  public onPlayerTrade(): void {
    if (this.state.step === 'TRADE_MARKET') {
      this.advanceTo('CRAFT_FABRICATOR');
    }
  }

  public onPlayerCraft(): void {
    if (this.state.step === 'CRAFT_FABRICATOR') {
      this.advanceTo('SHIP_UPGRADE');
    }
  }

  public onPlayerUpgrade(): void {
    if (this.state.step === 'SHIP_UPGRADE') {
      this.advanceTo('PWA_HOMESCREEN');
    }
  }

  public onCompleteHomescreenGuide(): void {
    if (this.state.step === 'PWA_HOMESCREEN') {
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
    this.state.step = 'COMPLETED';
    const finalInfo = this.getStepInfo('COMPLETED');
    if (this.onStepChangeCallback) {
      this.onStepChangeCallback(finalInfo);
    }
    if (this.onPromptChangeCallback) {
      this.onPromptChangeCallback('EXPEDITION ACTIVE // Free exploration authorized across the stars.');
      setTimeout(() => {
        if (this.onPromptChangeCallback) this.onPromptChangeCallback(null);
      }, 5000);
    }
  }

  public getStepInfo(step: TutorialStep): TutorialStepInfo {
    const isTouch = this.inputMode === 'touch' || this.inputMode === 'companion';
    const stepIdx = Math.max(1, ORDERED_STEPS.indexOf(step) + 1);
    const totalSteps = ORDERED_STEPS.length - 1; // excluding COMPLETED

    switch (step) {
      case 'WAKE_INTRO':
        return {
          step,
          stepIndex: stepIdx,
          totalSteps,
          title: 'SYSTEM INITIALIZATION',
          instruction: 'Vessel systems online. Ship computer telemetry calibrating...',
          detail: 'Welcome to the cockpit, Pilot. Initializing flight diagnostics.',
          badge: 'INITIALIZING',
        };

      case 'STEER_INPUT':
        return {
          step,
          stepIndex: stepIdx,
          totalSteps,
          title: 'FLIGHT ATTITUDE: PITCH & YAW',
          instruction: isTouch
            ? 'Gently move the flight Joystick on the left to rotate your vessel.'
            : 'Use [W / S / A / D] or Arrow keys to steer and change flight heading.',
          detail: 'Attitude thrusters respond smoothly to directional inputs.',
          badge: isTouch ? 'JOYSTICK' : 'W / S / A / D',
          highlightSelector: isTouch ? '#touch-joystick-zone' : undefined,
        };

      case 'THROTTLE_INPUT':
        return {
          step,
          stepIndex: 3,
          totalSteps,
          title: 'IMPULSE PROPULSION: SPEED',
          instruction: isTouch
            ? 'Slide the vertical Throttle bar upward on the right to accelerate forward.'
            : 'Hold [Shift] to increase engine thrust, [Ctrl] to brake or reverse.',
          detail: 'Dual ion thrusters deliver sublight forward momentum.',
          badge: isTouch ? 'THROTTLE' : 'HOLD SHIFT',
          highlightSelector: isTouch ? '#touch-throttle-zone' : undefined,
        };

      case 'SCAN_ACTION':
        return {
          step,
          stepIndex: 4,
          totalSteps,
          title: 'RESONANCE SENSORS: PING',
          instruction: isTouch
            ? 'Tap the SCAN button to emit an acoustic sensor pulse across local space.'
            : 'Press [Spacebar] to emit an acoustic resonance sensor ping.',
          detail: 'Sensor echoes illuminate nearby planets, structures, and resource deposits.',
          badge: isTouch ? 'SCAN' : 'SPACEBAR',
          highlightSelector: isTouch ? '#touch-btn-scan' : undefined,
        };

      case 'RADAR_TARGET':
        return {
          step,
          stepIndex: 5,
          totalSteps,
          title: 'NAVIGATION RADAR & TRACKING',
          instruction: isTouch
            ? 'Tap TARGET on the bottom-left to cycle celestial objects and contacts.'
            : 'Press [Tab] or [T] to lock onto planets, stations, or starships.',
          detail: 'The holographic spherical radar tracks direction and distance.',
          badge: isTouch ? 'TARGET' : 'TAB / T',
          highlightSelector: isTouch ? '#touch-btn-target' : '#nav-radar-canvas',
        };

      case 'OPEN_MAP':
        return {
          step,
          stepIndex: 6,
          totalSteps,
          title: 'CARTOGRAPHY: STAR CHART',
          instruction: isTouch
            ? 'Tap MAP on your flight console to view the galactic sector map.'
            : 'Press [M] or click MAP to consult the interstellar star chart.',
          detail: 'Discover solar systems, spectral classes, and planetary orbits.',
          badge: isTouch ? 'MAP' : 'MAP [M]',
          highlightSelector: isTouch ? '#touch-btn-map' : '#btn-open-chart',
        };

      case 'ENGAGE_CRUISE':
      case 'SET_COURSE':
        return {
          step: 'ENGAGE_CRUISE',
          stepIndex: 7,
          totalSteps,
          title: 'INTERSTELLAR WARP DRIVE',
          instruction: isTouch
            ? 'Select a celestial destination in the Star Chart and engage Warp Drive.'
            : 'Select a destination star in the Star Chart [M] and press [X] or click ENGAGE WARP.',
          detail: 'Warp curvature folds space for rapid system-to-system travel.',
          badge: 'WARP DRIVE',
          canManuallyAdvance: true,
        };

      case 'APPROACH_PLANET':
        return {
          step,
          stepIndex: 8,
          totalSteps,
          title: 'ORBITAL INSERTION',
          instruction: isTouch
            ? 'Fly toward a planet and tap ORBIT when close to enter parking orbit.'
            : 'Approach a planet and press [Space] to enter stable orbital inspection.',
          detail: 'Orbital velocity lets you scan surface biomes and select landing sites.',
          badge: isTouch ? 'ORBIT' : 'ORBIT [SPACE]',
          highlightSelector: isTouch ? '#touch-btn-orbit' : undefined,
          canManuallyAdvance: true,
        };

      case 'LAND_SURFACE':
        return {
          step,
          stepIndex: 9,
          totalSteps,
          title: 'ATMOSPHERIC ENTRY & LANDING',
          instruction: 'Select a landing sector from orbit and commence descent.',
          detail: 'Thermal heat shields absorb friction during atmospheric entry.',
          badge: 'DESCENT',
          canManuallyAdvance: true,
        };

      case 'SCAN_DISCOVERY':
        return {
          step,
          stepIndex: 10,
          totalSteps,
          title: 'SURFACE RECON & SAMPLING',
          instruction: isTouch
            ? 'Fly low across the terrain and tap SCAN near mineral or organic sites.'
            : 'Fly low over planetary surface features and press [Space] to collect samples.',
          detail: 'Raw planetary samples can be sold on station markets or refined.',
          badge: isTouch ? 'SCAN' : 'SPACEBAR',
          highlightSelector: isTouch ? '#touch-btn-scan' : undefined,
          canManuallyAdvance: true,
        };

      case 'DOCK_STATION':
        return {
          step,
          stepIndex: 11,
          totalSteps,
          title: 'ORBITAL DOCKING',
          instruction: 'Fly within docking capture radius of a Space Station or Capital Ship.',
          detail: 'Magnetic docking clamps will engage and open the station terminal.',
          badge: 'DOCKING',
          canManuallyAdvance: true,
        };

      case 'TRADE_MARKET':
        return {
          step,
          stepIndex: 12,
          totalSteps,
          title: 'COMMERCE: STATION MARKET',
          instruction: 'Open the MARKET tab while docked to trade commodities and samples.',
          detail: 'Buy industrial goods at refineries and sell for profit at trade hubs.',
          badge: 'MARKET',
          canManuallyAdvance: true,
        };

      case 'CRAFT_FABRICATOR':
        return {
          step,
          stepIndex: 13,
          totalSteps,
          title: 'SYNTHESIS: SHIP FABRICATOR',
          instruction: 'Use the FABRICATOR tab to forge advanced items from collected materials.',
          detail: 'Turn raw minerals and organic matter into specialized components.',
          badge: 'FABRICATOR',
          canManuallyAdvance: true,
        };

      case 'SHIP_UPGRADE':
        return {
          step,
          stepIndex: 14,
          totalSteps,
          title: 'HARDWARE UPGRADES & STATS',
          instruction: 'Install ship upgrades like Expanded Cargo Hold or Ion Propulsion.',
          detail: 'Installed modules mount physical 3D attachments visible on your hull.',
          badge: 'SHIPYARD',
          canManuallyAdvance: true,
        };

      case 'PWA_HOMESCREEN':
        return {
          step,
          stepIndex: 15,
          totalSteps,
          title: 'COSMIC APP: ADD TO HOMESCREEN',
          instruction: 'Add The Quiet Between Stars to your device homescreen for a fullscreen experience.',
          detail: 'Pinning the app removes browser URL bars and displays the custom abstract cosmic logo.',
          badge: 'HOMESCREEN',
          canManuallyAdvance: true,
        };

      case 'COMPLETED':
      default:
        return {
          step: 'COMPLETED',
          stepIndex: totalSteps,
          totalSteps,
          title: 'EXPEDITION AUTHORIZED',
          instruction: 'Flight diagnostics complete. Free exploration authorized across the stars.',
          detail: 'Navigate at your own pace. Safe travels in the quiet between stars.',
          badge: 'FREE ROAM',
        };
    }
  }

  private updatePromptForCurrentStep(): void {
    const info = this.getStepInfo(this.state.step);

    if (this.onStepChangeCallback) {
      this.onStepChangeCallback(info);
    }

    if (this.onPromptChangeCallback) {
      this.onPromptChangeCallback(info.instruction);
    }

    if (this.onCompanionHintCallback && info.badge) {
      this.onCompanionHintCallback(info.badge.toLowerCase(), info.instruction);
    }
  }
}
