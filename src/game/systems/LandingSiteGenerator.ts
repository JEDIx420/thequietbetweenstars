import { SeededRandom } from '../universe/SeededRandom';
import type { PlanetDescriptor } from './PlanetDescriptor';
import { LandingRegionGenerator, type LandingRegionProfile } from '../planets/LandingRegionProfile';

export interface LandingSite {
  id: string;
  name: string;
  latitude: number;   // -90 to +90
  longitude: number;  // -180 to +180
  biome: string;
  terrainType: string;
  safetyRating: 'Stable' | 'Moderate Winds' | 'Thermal Activity' | 'Rough Terrain' | 'Low Visibility';
  interestingSignals: string[];
  localHeightScale: number; // Modifies chunk elevation per site
  localRoughness: number;   // Modifies surface roughness
  region: LandingRegionProfile; // Comprehensive regional climate, morphology, flora & fauna profile
}

export class LandingSiteGenerator {
  public static generateSites(planet: PlanetDescriptor): LandingSite[] {
    if (!planet.isLandable) {
      planet.isLandable = true;
    }

    const rng = new SeededRandom(planet.seed + 9876);
    const regions = LandingRegionGenerator.generateRegions(planet.profile, planet.seed);
    const sites: LandingSite[] = [];
    const count = Math.min(regions.length, rng.rangeInt(3, 5));

    for (let i = 0; i < count; i++) {
      const region = regions[i % regions.length];
      const lat = Math.round(rng.range(-65, 65) * 10) / 10;
      const lon = Math.round(rng.range(-170, 170) * 10) / 10;

      sites.push({
        id: `site-${planet.id}-${region.id}`,
        name: region.name,
        latitude: lat,
        longitude: lon,
        biome: region.biomeName,
        terrainType: planet.profile.family,
        safetyRating: region.safetyRating,
        interestingSignals: [...region.interestingSignals],
        localHeightScale: region.heightScale,
        localRoughness: region.roughness,
        region: { ...region },
      });
    }

    // Guarantee at least one cultural signal landing site on sentient worlds
    const isSentient = planet.profile.biosignature === 'anomalous' || (planet.profile.biosignature === 'complex-ecosystem' && planet.profile.temperatureKelvin >= 240 && planet.profile.temperatureKelvin <= 340 && planet.profile.oceanCoverage >= 0.12);
    if (isSentient && sites.length > 0) {
      const culturalNames = [
        'Observatory Basin',
        'Cultural Signal Valley',
        'Inhabited Sanctuary Basin',
        'Communal Spire Plateau',
        'Acoustic Transmission Source',
      ];
      const cName = rng.pick(culturalNames);
      sites[0].name = cName;
      sites[0].region.name = cName;
      if (!sites[0].interestingSignals.some(s => s.includes('CULTURAL') || s.includes('INTELLIGENT'))) {
        sites[0].interestingSignals.unshift('CULTURAL ACTIVITY', 'INTELLIGENT SIGNAL');
      }
    }

    return sites;
  }
}
