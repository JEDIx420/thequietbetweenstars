import { SeededRandom } from '../universe/SeededRandom';
import type { PlanetDescriptor } from './PlanetDescriptor';

export interface LandingSite {
  id: string;
  name: string;
  latitude: number;   // -90 to +90
  longitude: number;  // -180 to +180
  biome: string;
  terrainType: string;
  safetyRating: 'Stable' | 'Moderate Winds' | 'Thermal Activity' | 'Rough Terrain';
  interestingSignals: string[];
}

export class LandingSiteGenerator {
  public static generateSites(planet: PlanetDescriptor): LandingSite[] {
    if (!planet.isLandable) return [];

    const rng = new SeededRandom(planet.seed + 9876);
    const count = rng.rangeInt(3, 5);
    const sites: LandingSite[] = [];

    const biomesByType: Record<string, string[]> = {
      'terrestrial-temperate': ['Coastal Plain', 'Verdant Basin', 'Highland Steppe', 'River Delta', 'Forest Canopy Valley'],
      'terrestrial-ocean': ['Volcanic Archipelago', 'Coral Shelf Atoll', 'Deep Ridge Shallows', 'Pelagic Sandbar'],
      'terrestrial-desert': ['Dune Sea Oasis', 'Sunken Canyon Bed', 'Mesa Plateau', 'Crystalline Dry Lake'],
      'terrestrial-ice': ['Glacial Shelf', 'Sub-Zero Geyser Field', 'Blue Ice Crevasse Basin', 'Frozen Fjord Basin'],
      'volcanic': ['Basalt Obsidian Plain', 'Caldera Rim Landing Zone', 'Cooled Lava Field', 'Ash Valley Terrace'],
      'exotic': ['Luminescent Flora Basin', 'Resonant Crystal Spire Plain', 'Harmonic Rift Valley', 'Ethereal Terrace'],
      'barren-moon': ['Impact Basin Rim', 'Regolith Sea', 'Central Peak Shelf', 'Lava Tube Skylight'],
    };

    const biomes = biomesByType[planet.type] || ['Uncharted Sector', 'Smooth Basin', 'Plateau Shelf'];

    const signalPool = [
      'Weak electromagnetic pulse detected',
      'Concentrated crystalline resonance',
      'Atmospheric moisture condensation',
      'Localized magnetic anomaly',
      'Organic biological trace signatures',
      'Subterranean tectonic echo',
      'Thermal gradient variance',
    ];

    const safetyPool: LandingSite['safetyRating'][] = ['Stable', 'Moderate Winds', 'Thermal Activity', 'Rough Terrain'];

    for (let i = 0; i < count; i++) {
      const biome = biomes[i % biomes.length];
      const lat = Math.round(rng.range(-65, 65) * 10) / 10;
      const lon = Math.round(rng.range(-170, 170) * 10) / 10;

      const signals = [rng.pick(signalPool)];
      if (rng.chance(0.5)) signals.push(rng.pick(signalPool));

      sites.push({
        id: `site-${planet.id}-${i + 1}`,
        name: `${biome} Site ${['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'][i]}`,
        latitude: lat,
        longitude: lon,
        biome,
        terrainType: planet.type,
        safetyRating: rng.pick(safetyPool),
        interestingSignals: signals,
      });
    }

    return sites;
  }
}
