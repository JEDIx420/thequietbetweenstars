import type { PlanetEnvironmentProfile, PlanetFamily } from '../planets/PlanetEnvironmentProfile';

export type PlanetType = PlanetFamily;

export interface PlanetPalette {
  primary: string;       // Primary surface / band color
  secondary: string;     // Secondary continental / band color
  ocean?: string;        // Ocean color if applicable
  atmosphereGlow: string;// Rayleigh limb glow color
  cloudColor: string;    // Cloud layer color
  ringColor?: string;    // Rings color if present
}

export interface PlanetDescriptor {
  id: string;
  seed: number;
  name: string;
  type: PlanetType;
  radius: number;           // Visual radius in render units
  gravity: number;          // Surface gravity in m/s^2 (e.g. 9.8)
  hasAtmosphere: boolean;
  atmosphereDensity: number;// 0.0 to 2.0
  temperatureKelvin: number;// e.g. 288 K
  surfacePressureAtm: number;
  oceanCoverage: number;    // 0.0 to 1.0
  cloudCoverage: number;    // 0.0 to 1.0
  biosignature: 'none' | 'microbial' | 'primitive-flora' | 'complex-ecosystem' | 'anomalous';
  hasRings: boolean;
  moonsCount: number;
  palette: PlanetPalette;
  shortDescription: string;
  isLandable: boolean;
  profile: PlanetEnvironmentProfile; // Full coherent environmental profile
}

export interface StarDescriptor {
  id: string;
  name: string;
  spectralClass: 'O' | 'B' | 'A' | 'F' | 'G' | 'K' | 'M';
  radius: number;
  lightColor: number;
  temperature: number;
  coronaColor: number;
}

export interface ResonanceSignature {
  frequency: number; // Harmonic kHz
  intensity: number; // 0.0 to 1.0
  harmonicPattern: string; // e.g. "Phi-3.141-Oscillation"
  loreFragment?: string;
}

export type SpaceAnomalyType =
  | 'derelict_probe'
  | 'cometary_nucleus'
  | 'dense_asteroid_cluster'
  | 'resonance_monolith'
  | 'drifting_beacon'
  | 'nebula_pocket';

export interface SpaceAnomalyDescriptor {
  id: string;
  name: string;
  type: SpaceAnomalyType;
  distanceFromStar: number; // Approximate AU / units from primary
  angle: number;
  description: string;
  scanned: boolean;
  hasResonance: boolean;
  resonance?: ResonanceSignature;
}

export interface StarSystemDescriptor {
  id: string;
  seed: number;
  name: string;
  sectorX: number;
  sectorY: number;
  sectorZ: number;
  star: StarDescriptor;
  planets: PlanetDescriptor[];
  anomalies?: SpaceAnomalyDescriptor[];
}
