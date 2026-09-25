export type StationArchetype =
  | 'TRADE_HUB'
  | 'MINING_REFINERY'
  | 'RESEARCH_ARRAY'
  | 'SHIPYARD'
  | 'ORBITAL_HABITAT'
  | 'ALIEN_BIOSTATION';

export type StationServiceType =
  | 'MARKET'
  | 'FABRICATOR'
  | 'SHIPYARD'
  | 'SERVICES'
  | 'COMMS';

export interface StationDescriptor {
  entityKind: 'STATION';
  id: string;
  name: string;
  archetype: StationArchetype;
  faction: string;
  position: { x: number; y: number; z: number };
  services: StationServiceType[];
  marketProfileId: string;
  captureRadius: number;
  approachDistance: number;
  greeting: string;
  lore: string;
}

export type VesselArchetype =
  | 'SOLAR_SAIL'
  | 'INDUSTRIAL_HAULER'
  | 'ROTATING_RING'
  | 'ORGANIC_BIO'
  | 'MANTA_WING'
  | 'CATHEDRAL_CAPITAL';

export type VesselSizeClass =
  | 'SCOUT'
  | 'SHUTTLE'
  | 'TRADER'
  | 'FRIGATE'
  | 'CRUISER'
  | 'CARRIER'
  | 'CAPITAL';

export interface NPCVesselDescriptor {
  entityKind: 'VESSEL';
  id: string;
  name: string;
  captainName: string;
  species: string;
  faction?: string;
  archetype: VesselArchetype;
  sizeClass: VesselSizeClass;
  position: { x: number; y: number; z: number };
  patrolRadius: number;
  hailRadius: number;
  isDockable: boolean;
  captureRadius?: number;
  approachDistance?: number;
  dialogueTopic: string;
  greeting: string;
  lore: string;
  services?: StationServiceType[];
  marketArchetype?: StationArchetype;
}

export interface SystemPopulationDescriptor {
  systemId: string;
  systemName: string;
  stations: StationDescriptor[];
  vessels: NPCVesselDescriptor[];
  populationDescription: string;
}
