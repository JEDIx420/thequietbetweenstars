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
  localHeightScale: number; // Modifies chunk elevation per site
  localRoughness: number;   // Modifies surface roughness
}

export class LandingSiteGenerator {
  public static generateSites(planet: PlanetDescriptor): LandingSite[] {
    if (!planet.isLandable) return [];

    const rng = new SeededRandom(planet.seed + 9876);
    const count = rng.rangeInt(3, 5);
    const sites: LandingSite[] = [];
    const family = planet.profile.family;

    const biomesByFamily: Record<string, Array<{ name: string; hScale: number; roughness: number }>> = {
      'temperate-terrestrial': [
        { name: 'Coastal Shelf Basin', hScale: 0.8, roughness: 0.5 },
        { name: 'Alpine Ridge Valley', hScale: 1.4, roughness: 0.85 },
        { name: 'Inland Timberland Plain', hScale: 1.0, roughness: 0.6 },
        { name: 'River Delta Shallows', hScale: 0.6, roughness: 0.4 },
      ],
      'desert-dune': [
        { name: 'Equatorial Dune Sea', hScale: 0.9, roughness: 0.4 },
        { name: 'Eolian Canyon Province', hScale: 1.5, roughness: 0.9 },
        { name: 'Bleached Salt Basin', hScale: 0.5, roughness: 0.3 },
        { name: 'Sunken Mesa Terrace', hScale: 1.2, roughness: 0.7 },
      ],
      'cryogenic-ice': [
        { name: 'Glacial Crevasse Rift', hScale: 1.3, roughness: 0.8 },
        { name: 'Polar Cryo-Plateau', hScale: 0.7, roughness: 0.4 },
        { name: 'Sub-Zero Geyser Basin', hScale: 1.1, roughness: 0.7 },
        { name: 'Permafrost Coastal Shelf', hScale: 0.9, roughness: 0.5 },
      ],
      'volcanic-basalt': [
        { name: 'Pyroclastic Fissure Field', hScale: 1.4, roughness: 0.95 },
        { name: 'Obsidian Basalt Plain', hScale: 0.8, roughness: 0.5 },
        { name: 'Caldera Rim Landing Zone', hScale: 1.6, roughness: 0.85 },
        { name: 'Cooled Magma Terrace', hScale: 1.0, roughness: 0.65 },
      ],
      'oceanic-water': [
        { name: 'Pelagic Atoll Shallows', hScale: 0.7, roughness: 0.4 },
        { name: 'Volcanic Island Shelf', hScale: 1.3, roughness: 0.8 },
        { name: 'Coral Shoal Sandbar', hScale: 0.5, roughness: 0.35 },
        { name: 'Deep Archipelago Bay', hScale: 0.9, roughness: 0.6 },
      ],
      'toxic-chemical': [
        { name: 'Sulfur Fluvial Basin', hScale: 0.9, roughness: 0.7 },
        { name: 'Caustic Badlands Ridge', hScale: 1.4, roughness: 0.9 },
        { name: 'Hydrocarbon Chimney Shelf', hScale: 1.1, roughness: 0.8 },
      ],
      'crystalline-mineral': [
        { name: 'Faceted Quartz Plain', hScale: 0.9, roughness: 0.5 },
        { name: 'Resonant Crystal Canyon', hScale: 1.5, roughness: 0.85 },
        { name: 'Amethyst Mesa Shelf', hScale: 1.2, roughness: 0.65 },
      ],
      'high-biosignature': [
        { name: 'Bioluminescent Marshes', hScale: 0.7, roughness: 0.45 },
        { name: 'Spore Canopy Basin', hScale: 1.1, roughness: 0.65 },
        { name: 'Phosphor Highland Plateau', hScale: 1.3, roughness: 0.75 },
      ],
      'metallic-iron': [
        { name: 'Hematite Valley Ridge', hScale: 1.5, roughness: 0.9 },
        { name: 'Oxidized Rust Basin', hScale: 0.8, roughness: 0.5 },
        { name: 'Copper Spire Plateau', hScale: 1.3, roughness: 0.8 },
      ],
      'barren-moon': [
        { name: 'Impact Basin Floor', hScale: 0.7, roughness: 0.6 },
        { name: 'Central Crater Peak', hScale: 1.6, roughness: 0.9 },
        { name: 'Regolith Highland Shelf', hScale: 1.1, roughness: 0.75 },
        { name: 'Ancient Ejecta Field', hScale: 1.3, roughness: 0.85 },
      ],
    };

    const biomeDefs = biomesByFamily[family] || [
      { name: 'Smooth Survey Plain', hScale: 1.0, roughness: 0.6 },
      { name: 'Highland Ridge', hScale: 1.3, roughness: 0.8 },
      { name: 'Lowland Basin', hScale: 0.7, roughness: 0.5 },
    ];

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
      const bDef = biomeDefs[i % biomeDefs.length];
      const lat = Math.round(rng.range(-65, 65) * 10) / 10;
      const lon = Math.round(rng.range(-170, 170) * 10) / 10;

      const signals = [rng.pick(signalPool)];
      if (rng.chance(0.5)) signals.push(rng.pick(signalPool));

      sites.push({
        id: `site-${planet.id}-${i + 1}`,
        name: `${bDef.name} ${['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'][i]}`,
        latitude: lat,
        longitude: lon,
        biome: bDef.name,
        terrainType: family,
        safetyRating: rng.pick(safetyPool),
        interestingSignals: signals,
        localHeightScale: bDef.hScale,
        localRoughness: bDef.roughness,
      });
    }

    return sites;
  }
}
