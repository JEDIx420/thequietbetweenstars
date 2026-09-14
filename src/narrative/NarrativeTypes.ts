import type { SectorCoord } from '../game/universe/WorldPosition';

export type NarrativePriority = 'urgent' | 'high' | 'normal' | 'ambient';

export type NarrativeEventType =
  | 'first_wake'
  | 'first_steer'
  | 'first_throttle'
  | 'first_scan'
  | 'first_target_selected'
  | 'first_map_open'
  | 'course_set'
  | 'deep_cruise_start'
  | 'deep_cruise_arrival'
  | 'planet_approach'
  | 'orbit_established'
  | 'surface_landing'
  | 'scanned_flora'
  | 'scanned_fauna'
  | 'scanned_landmark'
  | 'scanned_anomaly'
  | 'resonance_first_hint'
  | 'resonance_second_hint'
  | 'ambient_deep_space';

export interface WorldFact {
  [key: string]: string | number | boolean | undefined;
}

export interface NarrativeEvent {
  id?: string;
  type: NarrativeEventType;
  priority: NarrativePriority;
  facts: WorldFact;
  tone?: 'curious' | 'reassuring' | 'dry' | 'philosophical' | 'mysterious';
  timestamp?: number;
}

export interface NarrativeLine {
  speaker: string;
  text: string;
  durationMs?: number;
  audioTone?: 'normal' | 'chime' | 'warning' | 'mystery';
}

export interface NarrativeContext {
  sector: SectorCoord;
  currentSystemName?: string;
  flightPhase: string;
  systemsVisited: number;
  discoveriesCount: number;
  resonanceFlags: string[];
}

export interface NarrativeTextProvider {
  generate(event: NarrativeEvent, context: NarrativeContext): Promise<NarrativeLine[]>;
}
