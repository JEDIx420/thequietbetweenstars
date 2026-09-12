export type PlanetType =
  | 'terrestrial-temperate'
  | 'terrestrial-ocean'
  | 'terrestrial-desert'
  | 'terrestrial-ice'
  | 'volcanic'
  | 'gas-giant'
  | 'barren-moon'
  | 'exotic';

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

export interface StarSystemDescriptor {
  id: string;
  seed: number;
  name: string;
  sectorX: number;
  sectorY: number;
  sectorZ: number;
  star: StarDescriptor;
  planets: PlanetDescriptor[];
}
