import type { StoryDirector } from './StoryDirector';
import type { StoryEvent, ResonanceFragment } from './StoryTypes';
import { CHAPTER_1_BEATS } from './chapters/Chapter1Resonance';
import type { DialoguePresenter } from '../ui/DialoguePresenter';
import type { StoryObjectiveHUD } from './StoryObjectiveHUD';
import { audio } from '../audio/AudioEngine';

export interface StoryPresentationCallbacks {
  reconcileWorldState: () => void;
  highlightNavigationTarget: (targetId: string, name: string) => void;
  showHudNotice: (text: string) => void;
}

export class StoryPresentationDirector {
  private storyDirector: StoryDirector;
  private dialoguePresenter: DialoguePresenter;
  private objectiveHud: StoryObjectiveHUD;
  private callbacks: StoryPresentationCallbacks;
  private unsubscribe: (() => void) | null = null;
  private isOpeningPlaying = false;

  constructor(
    storyDirector: StoryDirector,
    dialoguePresenter: DialoguePresenter,
    objectiveHud: StoryObjectiveHUD,
    callbacks: StoryPresentationCallbacks
  ) {
    this.storyDirector = storyDirector;
    this.dialoguePresenter = dialoguePresenter;
    this.objectiveHud = objectiveHud;
    this.callbacks = callbacks;

    this.subscribeToStoryEvents();
  }

  private subscribeToStoryEvents(): void {
    this.unsubscribe = this.storyDirector.subscribe((event: StoryEvent) => {
      this.handleStoryEvent(event);
    });
  }

  private handleStoryEvent(event: StoryEvent): void {
    switch (event.type) {
      case 'STORY_BEAT_TRIGGERED': {
        const state = this.storyDirector.getState();
        this.objectiveHud.update(state, true);
        this.callbacks.reconcileWorldState();

        const beat = state.currentBeat;
        const beatDef = CHAPTER_1_BEATS[beat];

        if (beat === 'beat_1_first_whisper') {
          this.callbacks.showHudNotice(
            'ANOMALOUS SIGNAL DETECTED // 432.8 Hz harmonic carrier · Navigation solution available'
          );
          this.callbacks.highlightNavigationTarget(
            'story_anom_resonance_alpha',
            'Resonance Monolith Prime'
          );

          if (beatDef && beatDef.dialogueLines.length > 0) {
            this.dialoguePresenter.enqueue(
              beatDef.dialogueLines.map((line) => ({
                speaker: beatDef.dialogueSpeaker,
                text: line,
                durationMs: 5000,
                audioTone: 'mystery',
              }))
            );
          }
        } else if (beat === 'beat_2_station_contact') {
          this.callbacks.showHudNotice(
            'SIGNAL DECODED: Research Outpost Epsilon-7 coordinates marked on radar'
          );
          this.callbacks.highlightNavigationTarget(
            'station_epsilon_7',
            'Research Outpost Epsilon-7'
          );

          this.dialoguePresenter.enqueue([
            {
              speaker: 'Ship Interface: Mnemosyne',
              text: 'Navigational vector extracted from Fragment α. Coordinates point toward Research Outpost Epsilon-7.',
              durationMs: 5500,
              audioTone: 'chime',
            },
            {
              speaker: 'Ship Interface: Mnemosyne',
              text: 'Course plotted. Approach the station and dock at Bay 03 to confer with Dr. Valeria Vance.',
              durationMs: 5000,
              audioTone: 'chime',
            },
          ]);
        } else if (beat === 'beat_3_fragment_alpha') {
          this.callbacks.showHudNotice(
            'OBJECTIVE: Locate Derelict Survey Craft Alpha-9 in outer system'
          );
          this.callbacks.highlightNavigationTarget(
            'story_anom_derelict_beta',
            'Derelict Survey Craft Alpha-9'
          );

          if (beatDef && beatDef.dialogueLines.length > 0) {
            this.dialoguePresenter.enqueue(
              beatDef.dialogueLines.map((line) => ({
                speaker: beatDef.dialogueSpeaker,
                text: line,
                durationMs: 5500,
                audioTone: 'chime',
              }))
            );
          }
        } else if (beat === 'beat_4_decryption') {
          this.callbacks.showHudNotice(
            'OBJECTIVE: Return to Research Outpost Epsilon-7 Signal Lab to synthesize fragments'
          );
          this.callbacks.highlightNavigationTarget(
            'station_epsilon_7',
            'Research Outpost Epsilon-7'
          );

          this.dialoguePresenter.enqueue([
            {
              speaker: 'Ship Interface: Mnemosyne',
              text: 'Fragment β flight core acquired. Returning telemetry indicates full harmonic key readiness.',
              durationMs: 5000,
              audioTone: 'chime',
            },
            {
              speaker: 'Ship Interface: Mnemosyne',
              text: 'Dock with Research Outpost Epsilon-7 and access the Signal Lab to execute dual harmonic synthesis.',
              durationMs: 5000,
              audioTone: 'chime',
            },
          ]);
        } else if (beat === 'beat_5_relay_coordinates') {
          this.callbacks.showHudNotice(
            'COORDINATES DECRYPTED: First Harmonic Relay: Spires of the Quiet revealed in deep space'
          );
          this.callbacks.highlightNavigationTarget(
            'harmonic_relay_prime',
            'First Harmonic Relay: Spires of the Quiet'
          );

          if (beatDef && beatDef.dialogueLines.length > 0) {
            this.dialoguePresenter.enqueue(
              beatDef.dialogueLines.map((line) => ({
                speaker: beatDef.dialogueSpeaker,
                text: line,
                durationMs: 5500,
                audioTone: 'mystery',
              }))
            );
          }
        } else if (beat === 'beat_6_relay_alignment') {
          this.callbacks.showHudNotice(
            'OBJECTIVE: Resonate with and align the three relay spires'
          );

          if (beatDef && beatDef.dialogueLines.length > 0) {
            this.dialoguePresenter.enqueue(
              beatDef.dialogueLines.map((line) => ({
                speaker: beatDef.dialogueSpeaker,
                text: line,
                durationMs: 5500,
                audioTone: 'chime',
              }))
            );
          }
        } else if (beat === 'beat_7_chapter1_climax') {
          this.callbacks.showHudNotice(
            'GATEWAY AWAKENED // CHAPTER 1 COMPLETE: THE RESONANCE'
          );

          if (beatDef && beatDef.dialogueLines.length > 0) {
            this.dialoguePresenter.enqueue(
              beatDef.dialogueLines.map((line) => ({
                speaker: beatDef.dialogueSpeaker,
                text: line,
                durationMs: 6000,
                audioTone: 'mystery',
              }))
            );
          }

          // Subtle concluding notification
          setTimeout(() => {
            this.callbacks.showHudNotice(
              'CHAPTER 1 COMPLETE // The galaxy is vast. Your journey continues.'
            );
          }, 7000);
        }
        break;
      }

      case 'FRAGMENT_RECOVERED': {
        const fragment: ResonanceFragment = event.payload?.fragment;
        if (fragment) {
          audio.playConnectChime();
          this.callbacks.showHudNotice(
            `RESONANCE FRAGMENT RECOVERED // ${fragment.name.toUpperCase()} (${fragment.frequency} Hz)`
          );
        }
        break;
      }

      case 'RELAY_PILLAR_ALIGNED': {
        const state = this.storyDirector.getState();
        const count = state.harmonicRelayState.alignedPillars.length;
        audio.playConnectChime();
        this.callbacks.showHudNotice(
          `HARMONIC SPIRE ALIGNED // [${count}/3] SYNCHRONIZED`
        );
        break;
      }

      case 'RELAY_ACTIVATED': {
        audio.playConnectChime();
        this.callbacks.showHudNotice('ANCIENT RELAY HARMONIC PULSE DISCHARGED');
        break;
      }

      case 'FREE_EXPLORATION_TOGGLED': {
        const enabled = !!event.payload?.enabled;
        const state = this.storyDirector.getState();
        this.objectiveHud.update(state);
        audio.playConnectChime();
        this.callbacks.showHudNotice(
          enabled
            ? 'FREE ROAM MODE ACTIVE // Story objectives paused · Freely explore the galaxy'
            : 'STORY MISSIONS RESUMED // Active resonance objectives re-engaged'
        );
        break;
      }
    }
  }

  /**
   * Begins the cinematic Beat 0 (Subcarrier Whisper) opening moment.
   * Plays authored Mnemosyne dialogue and smoothly transitions to Beat 1.
   */
  public beginStoryOpening(): void {
    const state = this.storyDirector.getState();
    if (state.currentBeat !== 'beat_0_awakening') {
      this.objectiveHud.update(state);
      return;
    }

    if (this.isOpeningPlaying) return;
    this.isOpeningPlaying = true;

    this.objectiveHud.update(state, false);

    const beat0 = CHAPTER_1_BEATS['beat_0_awakening'];
    const lines = [
      'Diagnostic complete. All primary maneuvering thrusters nominal.',
      'Notice: A persistent ultra-low frequency carrier wave has been detected modulating the local hyperlane grid.',
      'It is mathematically structured. Not stellar noise.',
      'Something is answering through the quiet.',
    ];

    let currentIdx = 0;
    const deliverNext = () => {
      if (currentIdx >= lines.length) {
        this.isOpeningPlaying = false;
        // Advance to Beat 1
        this.storyDirector.advanceBeat('beat_1_first_whisper');
        return;
      }

      const text = lines[currentIdx];
      currentIdx++;

      this.dialoguePresenter.enqueue([
        {
          speaker: beat0.dialogueSpeaker,
          text,
          durationMs: 4200,
          audioTone: currentIdx === 1 ? 'chime' : 'mystery',
        },
      ]);

      // Schedule next line progression
      setTimeout(() => {
        deliverNext();
      }, 4500);
    };

    // Small delay after briefing closes before Mnemosyne initiates diagnostic chime
    setTimeout(() => {
      deliverNext();
    }, 800);
  }

  public refresh(): void {
    const state = this.storyDirector.getState();
    this.objectiveHud.update(state);
    this.callbacks.reconcileWorldState();
  }

  public dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
