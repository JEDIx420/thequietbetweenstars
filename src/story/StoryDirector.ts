import type {
  StoryBeatId,
  StoryEvent,
  StoryEventListener,
  StoryState,
  ResonanceFragment,
} from './StoryTypes';
import { DEFAULT_STORY_STATE, cloneStoryState } from './StoryState';
import { CHAPTER_1_BEATS } from './chapters/Chapter1Resonance';

export class StoryDirector {
  private static instance: StoryDirector | null = null;
  private state: StoryState;
  private listeners: Set<StoryEventListener> = new Set();
  private npcMemoriesRef: Record<string, any> | null = null;

  public static getInstance(): StoryDirector {
    if (!StoryDirector.instance) {
      StoryDirector.instance = new StoryDirector();
    }
    return StoryDirector.instance;
  }

  constructor(initialState?: StoryState) {
    this.state = initialState ? cloneStoryState(initialState) : cloneStoryState(DEFAULT_STORY_STATE);
  }

  public setNpcMemories(memories: Record<string, any>): void {
    this.npcMemoriesRef = memories;
  }

  public reset(): void {
    this.state = cloneStoryState(DEFAULT_STORY_STATE);
  }

  public getState(): StoryState {
    return this.state;
  }

  public loadState(state: StoryState): boolean {
    this.state = cloneStoryState(state);
    return this.reconcileState();
  }

  public reconcileState(): boolean {
    let repaired = false;
    const relay = this.state.harmonicRelayState;
    if (relay) {
      if (Array.isArray(relay.alignedPillars)) {
        // Sanitize and deduplicate pillar indices
        relay.alignedPillars = Array.from(
          new Set(relay.alignedPillars.filter((p) => p === 0 || p === 1 || p === 2))
        ).sort((a, b) => a - b);
      } else {
        relay.alignedPillars = [];
      }

      if (relay.alignedPillars.length >= 3) {
        relay.activated = true;
      }

      // Canonical condition: if all 3 pillars aligned OR relay activated,
      // and player is on Beat 5 or Beat 6, advance to Beat 7
      if (relay.activated || relay.alignedPillars.length >= 3) {
        if (
          this.state.currentBeat === 'beat_5_relay_coordinates' ||
          this.state.currentBeat === 'beat_6_relay_alignment'
        ) {
          if (!this.state.completedBeats.includes('beat_5_relay_coordinates')) {
            this.state.completedBeats.push('beat_5_relay_coordinates');
          }
          if (!this.state.completedBeats.includes('beat_6_relay_alignment')) {
            this.state.completedBeats.push('beat_6_relay_alignment');
          }
          this.state.currentBeat = 'beat_7_chapter1_climax';
          repaired = true;
        }
      }
    }
    return repaired;
  }

  public isChapter1Complete(): boolean {
    return (
      this.state.completedBeats.includes('beat_7_chapter1_climax') ||
      (this.state.currentBeat === 'beat_7_chapter1_climax' &&
        !!this.state.harmonicRelayState?.activated &&
        this.state.completedBeats.includes('beat_6_relay_alignment'))
    );
  }

  public markBeatCompleted(beat: StoryBeatId): void {
    if (!this.state.completedBeats.includes(beat)) {
      this.state.completedBeats.push(beat);
      this.emit({
        type: 'STORY_BEAT_TRIGGERED',
        payload: { newBeat: this.state.currentBeat, completedBeats: this.state.completedBeats },
        timestamp: Date.now(),
      });
    }
  }

  public isFreeExploration(): boolean {
    return this.state.freeExplorationMode ?? false;
  }

  public setFreeExploration(enabled: boolean): void {
    this.state.freeExplorationMode = enabled;
    this.emit({
      type: 'FREE_EXPLORATION_TOGGLED',
      payload: { enabled },
      timestamp: Date.now(),
    });
  }

  public getActiveObjectiveTarget(): { targetId: string; label: string } | null {
    if (this.state.freeExplorationMode) return null;
    switch (this.state.currentBeat) {
      case 'beat_1_first_whisper':
        return { targetId: 'story_anom_resonance_alpha', label: 'Resonance Monolith Prime' };
      case 'beat_2_station_contact':
        return { targetId: 'station_epsilon_7', label: 'Research Outpost Epsilon-7' };
      case 'beat_3_fragment_alpha':
        return { targetId: 'story_anom_derelict_beta', label: 'Derelict Survey Craft Alpha-9' };
      case 'beat_4_decryption':
        return { targetId: 'station_epsilon_7', label: 'Research Outpost Epsilon-7' };
      case 'beat_5_relay_coordinates':
        return { targetId: 'harmonic_relay_prime', label: 'First Harmonic Relay: Spires of the Quiet' };
      case 'beat_6_relay_alignment':
        if (this.state.harmonicRelayState.activated || this.state.harmonicRelayState.alignedPillars.length >= 3) {
          return null;
        }
        return { targetId: 'harmonic_relay_prime', label: 'First Harmonic Relay: Spires of the Quiet' };
      case 'beat_7_chapter1_climax':
      default:
        return null;
    }
  }

  public subscribe(listener: StoryEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public emit(event: StoryEvent): void {
    this.processEvent(event);
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[StoryDirector] Error in listener:', err);
      }
    }
  }

  private processEvent(event: StoryEvent): void {
    switch (event.type) {
      case 'SYSTEM_ENTERED': {
        this.state.systemsSinceLastResonance++;
        break;
      }

      case 'FRAGMENT_RECOVERED': {
        const fragment: ResonanceFragment = event.payload?.fragment;
        if (fragment && !this.state.resonanceFragments.some((f) => f.id === fragment.id)) {
          this.state.resonanceFragments.push(fragment);
          this.state.systemsSinceLastResonance = 0;

          if (fragment.id === 'fragment_alpha' && this.state.currentBeat === 'beat_1_first_whisper') {
            this.advanceBeat('beat_2_station_contact');
          } else if (fragment.id === 'fragment_beta' && this.state.currentBeat === 'beat_3_fragment_alpha') {
            this.advanceBeat('beat_4_decryption');
          }
        }
        break;
      }

      case 'FRAGMENT_DECRYPTED': {
        const fragmentId = event.payload?.fragmentId;
        const target = this.state.resonanceFragments.find((f) => f.id === fragmentId);
        if (target) {
          target.decrypted = true;
          if (target.codexId && !this.state.unlockedCodexEntries.includes(target.codexId)) {
            this.state.unlockedCodexEntries.push(target.codexId);
          }
        }

        const allDecrypted = this.state.resonanceFragments.length >= 2 &&
          this.state.resonanceFragments.every((f) => f.decrypted);
        if (allDecrypted && this.state.currentBeat === 'beat_4_decryption') {
          this.advanceBeat('beat_5_relay_coordinates');
        }
        break;
      }

      case 'STATION_DOCKED': {
        const stationId = event.payload?.stationId;
        if (stationId && !this.state.visitedStations.includes(stationId)) {
          this.state.visitedStations.push(stationId);
        }
        if (this.state.currentBeat === 'beat_2_station_contact') {
          this.advanceBeat('beat_3_fragment_alpha');
        }
        // Update Dr. Vance memory in canonical repository
        const mems = this.npcMemoriesRef || this.state.npcMemories;
        if (mems) {
          if (!mems['dr_vance']) {
            mems['dr_vance'] = {
              npcId: 'dr_vance',
              speciesId: 'human',
              name: 'Dr. Valeria Vance',
              timesMet: 0,
              lastMet: 0,
              topicsDiscussed: [],
              factsRevealed: [],
              familiarity: 0.0,
            };
          }
          const vance = mems['dr_vance'];
          vance.timesMet++;
          vance.lastMet = Date.now();
          vance.familiarity = Math.min(1.0, vance.familiarity + 0.3);
        }
        break;
      }

      case 'VESSEL_HAILED': {
        const vesselId = event.payload?.vesselId;
        if (vesselId === 'the_wanderer_7') {
          const mems = this.npcMemoriesRef || this.state.npcMemories;
          if (mems) {
            if (!mems['captain_zephyr']) {
              mems['captain_zephyr'] = {
                npcId: 'captain_zephyr',
                speciesId: 'nomad_avian',
                name: 'Captain Zephyr',
                timesMet: 0,
                lastMet: 0,
                topicsDiscussed: [],
                factsRevealed: [],
                familiarity: 0.0,
              };
            }
            const zephyr = mems['captain_zephyr'];
            zephyr.timesMet++;
            zephyr.lastMet = Date.now();
            zephyr.familiarity = Math.min(1.0, zephyr.familiarity + 0.35);
          }
          if (this.state.currentBeat === 'beat_5_relay_coordinates') {
            if (
              this.state.harmonicRelayState.activated ||
              this.state.harmonicRelayState.alignedPillars.length >= 3
            ) {
              this.advanceBeat('beat_7_chapter1_climax');
            } else {
              this.advanceBeat('beat_6_relay_alignment');
            }
          }
        }
        break;
      }

      case 'RELAY_PILLAR_ALIGNED': {
        const pillarIndex: number = event.payload?.pillarIndex;
        if (
          typeof pillarIndex === 'number' &&
          !this.state.harmonicRelayState.alignedPillars.includes(pillarIndex)
        ) {
          this.state.harmonicRelayState.alignedPillars.push(pillarIndex);
          this.state.harmonicRelayState.alignedPillars.sort((a, b) => a - b);
        }
        if (this.state.harmonicRelayState.alignedPillars.length >= 3) {
          this.state.harmonicRelayState.activated = true;
          this.emit({
            type: 'RELAY_ACTIVATED',
            payload: { systemSeed: this.state.harmonicRelayState.systemSeed },
            timestamp: Date.now(),
          });
          if (
            this.state.currentBeat === 'beat_5_relay_coordinates' ||
            this.state.currentBeat === 'beat_6_relay_alignment'
          ) {
            this.advanceBeat('beat_7_chapter1_climax');
          }
        }
        break;
      }

      case 'RELAY_ACTIVATED': {
        this.state.harmonicRelayState.activated = true;
        if (
          this.state.currentBeat === 'beat_5_relay_coordinates' ||
          this.state.currentBeat === 'beat_6_relay_alignment'
        ) {
          this.advanceBeat('beat_7_chapter1_climax');
        }
        break;
      }
    }
  }

  public advanceBeat(nextBeat: StoryBeatId): void {
    if (this.state.currentBeat === nextBeat) return;
    if (!this.state.completedBeats.includes(this.state.currentBeat)) {
      this.state.completedBeats.push(this.state.currentBeat);
    }
    this.state.currentBeat = nextBeat;

    const beatDef = CHAPTER_1_BEATS[nextBeat];
    if (beatDef?.codexReward && !this.state.unlockedCodexEntries.includes(beatDef.codexReward.id)) {
      this.state.unlockedCodexEntries.push(beatDef.codexReward.id);
    }

    this.emit({
      type: 'STORY_BEAT_TRIGGERED',
      payload: { newBeat: nextBeat, completedBeats: this.state.completedBeats },
      timestamp: Date.now(),
    });
  }

  public isBeatCompleted(beat: StoryBeatId): boolean {
    return this.state.completedBeats.includes(beat);
  }

  public shouldInjectStoryAnomaly(): boolean {
    // If player is on beat 1 and has entered >= 2 systems without encountering the first resonance whisper
    if (this.state.currentBeat === 'beat_1_first_whisper' && this.state.systemsSinceLastResonance >= 2) {
      return true;
    }
    // If player is on beat 3 and looking for fragment beta
    if (this.state.currentBeat === 'beat_3_fragment_alpha' && this.state.systemsSinceLastResonance >= 2) {
      return true;
    }
    return false;
  }

  public resetSoftGuarantee(): void {
    this.state.systemsSinceLastResonance = 0;
  }
}
