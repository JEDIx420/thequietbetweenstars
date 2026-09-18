import type { NPCMemory } from '../persistence/SaveManager';

export type StoryBeatId =
  | 'beat_0_awakening'
  | 'beat_1_first_whisper'
  | 'beat_2_station_contact'
  | 'beat_3_fragment_alpha'
  | 'beat_4_decryption'
  | 'beat_5_relay_coordinates'
  | 'beat_6_relay_alignment'
  | 'beat_7_chapter1_climax';

export interface ResonanceFragment {
  id: string;
  name: string;
  frequency: number; // e.g., 432.8 Hz
  originBeat: StoryBeatId;
  description: string;
  dataPayload: string;
  decrypted: boolean;
  codexId: string;
  recoveredAt: number;
}

export interface StationState {
  id: string;
  name: string;
  systemSeed: string;
  faction: string;
  visited: boolean;
  services: ('signal_lab' | 'concourse' | 'archive' | 'dockyard' | 'supply')[];
}

export interface NamedVesselState {
  id: string;
  name: string;
  captainName: string;
  species: string;
  silhouetteType: 'avian_solar_sail' | 'organic_bio_hull' | 'counter_rotating_rings';
  timesHailed: number;
  lastEncounteredSystem?: string;
  trustLevel: number; // -1.0 to 1.0
}

export interface HarmonicRelayState {
  discovered: boolean;
  systemSeed: string;
  coordinates: { x: number; y: number; z: number };
  alignedPillars: number[]; // indices of aligned pillars e.g. [0, 1, 2]
  activated: boolean;
}

export interface StoryState {
  activeChapter: number;
  currentBeat: StoryBeatId;
  completedBeats: StoryBeatId[];
  resonanceFragments: ResonanceFragment[];
  unlockedCodexEntries: string[];
  npcMemories: Record<string, NPCMemory>;
  visitedStations: string[];
  harmonicRelayState: HarmonicRelayState;
  systemsSinceLastResonance: number;
  activeVesselId: string | null;
  freeExplorationMode?: boolean;
}

export type StoryEventType =
  | 'STORY_BEAT_TRIGGERED'
  | 'FRAGMENT_RECOVERED'
  | 'FRAGMENT_DECRYPTED'
  | 'STATION_DOCKED'
  | 'VESSEL_HAILED'
  | 'RELAY_PILLAR_ALIGNED'
  | 'RELAY_ACTIVATED'
  | 'SYSTEM_ENTERED'
  | 'FREE_EXPLORATION_TOGGLED';

export interface StoryEvent {
  type: StoryEventType;
  payload?: any;
  timestamp: number;
}

export type StoryEventListener = (event: StoryEvent) => void;
