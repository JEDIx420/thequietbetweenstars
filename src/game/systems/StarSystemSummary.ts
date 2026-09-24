import type { StarDescriptor } from './PlanetDescriptor';

export interface StarSystemSummary {
  id: string;
  seed: number;
  name: string;
  sectorX: number;
  sectorY: number;
  sectorZ: number;
  star: StarDescriptor;
  planetCount: number;
  hasAnomalies: boolean;
  estimatedStations?: number;
  estimatedVessels?: number;
}
