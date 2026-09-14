import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TutorialDirector, type TutorialState } from '../src/tutorial/TutorialDirector';
import type { NarrativeDirector } from '../src/narrative/NarrativeDirector';
import type { NarrativeContext } from '../src/narrative/NarrativeTypes';

describe('TutorialDirector Flow & Progression', () => {
  let narrativeMock: NarrativeDirector;
  let triggeredEvents: string[] = [];
  let currentPrompt: string | null = null;
  let companionAction: string | null = null;
  let tutorial: TutorialDirector;

  const mockContext: NarrativeContext = {
    sector: { x: 0, y: 0, z: 0 },
    currentSystemName: 'Aurelia',
    flightPhase: 'SYSTEM_CRUISE',
    systemsVisited: 1,
    discoveriesCount: 0,
    resonanceFlags: [],
  };

  beforeEach(() => {
    triggeredEvents = [];
    currentPrompt = null;
    companionAction = null;

    narrativeMock = {
      trigger: vi.fn(async (type: string) => {
        triggeredEvents.push(type);
      }),
    } as unknown as NarrativeDirector;

    tutorial = new TutorialDirector(narrativeMock, () => mockContext);
    tutorial.setCallbacks(
      (prompt) => {
        currentPrompt = prompt;
      },
      (action) => {
        companionAction = action;
      }
    );
  });

  it('starts tutorial at WAKE_INTRO and triggers first_wake dialogue', () => {
    tutorial.start();
    const state = tutorial.getState();
    expect(state.started).toBe(true);
    expect(state.step).toBe('WAKE_INTRO');
    expect(triggeredEvents).toContain('first_wake');
  });

  it('progresses through flight inputs (STEER -> THROTTLE -> SCAN)', () => {
    tutorial.start();
    // Simulate advance to steer
    (tutorial as any).advanceTo('STEER_INPUT');
    expect(tutorial.getState().step).toBe('STEER_INPUT');

    tutorial.onPlayerSteer();
    expect(triggeredEvents).toContain('first_steer');
    expect(tutorial.getState().step).toBe('THROTTLE_INPUT');

    tutorial.onPlayerThrottle();
    expect(triggeredEvents).toContain('first_throttle');
    expect(tutorial.getState().step).toBe('SCAN_ACTION');

    tutorial.onPlayerScan();
    expect(triggeredEvents).toContain('first_scan');
    expect(tutorial.getState().step).toBe('RADAR_TARGET');
  });

  it('supports companion mode prompts and hints', () => {
    tutorial.setInputMode('companion');
    tutorial.start();
    (tutorial as any).advanceTo('STEER_INPUT');

    expect(currentPrompt).toContain('Joystick');
    expect(companionAction).toBe('joystick');
  });

  it('allows skipping tutorial completely', () => {
    tutorial.start();
    expect(tutorial.isComplete()).toBe(false);

    tutorial.skip();
    expect(tutorial.isComplete()).toBe(true);
    expect(tutorial.getState().skipped).toBe(true);
    expect(currentPrompt).toBeNull();
  });

  it('persists and restores tutorial state correctly', () => {
    const savedState: Partial<TutorialState> = {
      started: true,
      completed: false,
      step: 'SET_COURSE',
      skipped: false,
    };

    tutorial.loadState(savedState);
    expect(tutorial.getState().step).toBe('SET_COURSE');
  });
});
