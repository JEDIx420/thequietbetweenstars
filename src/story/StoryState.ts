import type { StoryState } from './StoryTypes';

export const DEFAULT_STORY_STATE: StoryState = {
  activeChapter: 1,
  currentBeat: 'beat_0_awakening',
  completedBeats: [],
  resonanceFragments: [],
  unlockedCodexEntries: ['codex_the_quiet_intro'],
  npcMemories: {
    ship_ai: {
      npcId: 'ship_ai',
      speciesId: 'synthetic',
      name: 'Ship Interface: Mnemosyne',
      timesMet: 1,
      lastMet: Date.now(),
      topicsDiscussed: ['system_diagnostics'],
      factsRevealed: ['harmonic_subcarrier_detected'],
      familiarity: 0.8,
    },
    dr_vance: {
      npcId: 'dr_vance',
      speciesId: 'human',
      name: 'Dr. Valeria Vance',
      timesMet: 0,
      lastMet: 0,
      topicsDiscussed: [],
      factsRevealed: [],
      familiarity: 0.0,
    },
    captain_zephyr: {
      npcId: 'captain_zephyr',
      speciesId: 'nomad_avian',
      name: 'Captain Zephyr',
      timesMet: 0,
      lastMet: 0,
      topicsDiscussed: [],
      factsRevealed: [],
      familiarity: 0.0,
    },
  },
  visitedStations: [],
  harmonicRelayState: {
    discovered: false,
    systemSeed: 'RELAY-PRIME-01',
    coordinates: { x: 3500, y: -400, z: -5200 },
    alignedPillars: [],
    activated: false,
  },
  systemsSinceLastResonance: 0,
  activeVesselId: null,
};

export function cloneStoryState(state: StoryState): StoryState {
  return JSON.parse(JSON.stringify(state));
}
