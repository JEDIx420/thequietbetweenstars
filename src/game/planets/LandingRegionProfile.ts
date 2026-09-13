import { SeededRandom } from '../universe/SeededRandom';
import type { PlanetEnvironmentProfile, LandmarkFamily } from './PlanetEnvironmentProfile';

export type RegionalMorphology =
  | 'dunes'
  | 'canyons'
  | 'salt_flat'
  | 'mesa_terrace'
  | 'alpine'
  | 'coastal'
  | 'forest_basin'
  | 'volcanic_rift'
  | 'caldera_rim'
  | 'glacier_rift'
  | 'polar_plateau'
  | 'cryo_vents'
  | 'frozen_coast'
  | 'atoll_shallows'
  | 'coral_shoal'
  | 'sulfur_basin'
  | 'caustic_badlands'
  | 'faceted_crystals'
  | 'resonant_canyon'
  | 'bioluminescent_marsh'
  | 'spore_basin'
  | 'hematite_ridges'
  | 'crater_basin'
  | 'regolith_highland';

export type VegetationArchetype =
  | 'none'
  | 'stalks'
  | 'shrubs'
  | 'mushrooms'
  | 'fans'
  | 'bulbous'
  | 'crystals'
  | 'grass';

export type FaunaArchetype =
  | 'quadruped'
  | 'tripod'
  | 'jelly'
  | 'hopping'
  | 'ray'
  | 'crawler';

export interface RegionalSurfacePalette {
  lowland: string;
  midland: string;
  highland: string;
  peak: string;
  rock: string;
  accent: string;
}

export interface LandingRegionProfile {
  id: string;
  name: string;
  regionSeed: number;
  regionType: string;
  biomeName: string;
  loreSnippet: string;
  safetyRating: 'Stable' | 'Moderate Winds' | 'Thermal Activity' | 'Rough Terrain' | 'Low Visibility';
  interestingSignals: string[];

  // Micro and Macro Terrain Parameters
  terrainMorphologyOverride: RegionalMorphology;
  heightScale: number;
  roughness: number;
  erosion: number;
  ridgeStrength: number;
  canyonStrength: number;
  duneStrength: number;
  waterLevelOffset: number; // Modifies sea level (e.g. +5 for coastal, -20 for dry upland)

  // Climate and Atmosphere
  moisture: number;         // 0.0 (dry) to 1.0 (swamp/oceanic)
  temperatureOffset: number;// Kelvin delta relative to planet average
  windStrength: number;     // 0.0 to 1.5

  // Ecological distribution
  vegetationDensity: number;// 0.0 to 1.0
  vegetationArchetype: VegetationArchetype;
  faunaDensity: number;     // 0.0 to 1.0
  faunaArchetypes: FaunaArchetype[];

  // Geological decorations
  rockDensity: number;
  landmarkFamilies: LandmarkFamily[];

  // Regional Visual Palette
  localSurfacePalette: RegionalSurfacePalette;
  fogModifier: {
    color?: string;
    densityMultiplier: number;
  };
  particleModifier: {
    type?: 'none' | 'dust' | 'snow' | 'ash' | 'spores' | 'mist';
    densityMultiplier: number;
  };
}

export class LandingRegionGenerator {
  public static generateRegions(planetProfile: PlanetEnvironmentProfile, planetSeed: number): LandingRegionProfile[] {
    const rng = new SeededRandom(planetSeed + 54321);
    const family = planetProfile.family;
    const basePalette = planetProfile.palette;

    switch (family) {
      case 'desert-dune':
        return [
          this.buildRegion({
            id: 'dune-sea',
            name: 'Equatorial Dune Sea',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Dune Sea',
            biomeName: 'Sweeping Dune Erg',
            loreSnippet: 'Colossal longitudinal sand waves sculpted by relentless equatorial wind currents.',
            safetyRating: 'Moderate Winds',
            morphology: 'dunes',
            hScale: 0.9,
            rough: 0.25,
            erosion: 0.2,
            ridgeStrength: 0.4,
            canyonStrength: 0.1,
            duneStrength: 1.8,
            waterLevelOffset: -30,
            moisture: 0.02,
            tempOffset: +14,
            wind: 1.4,
            vegDensity: 0.0,
            vegArchetype: 'none',
            faunaDensity: 0.1,
            faunaArchetypes: ['crawler'],
            rockDensity: 0.2,
            landmarks: ['stone_arches'],
            palette: {
              lowland: '#c27803',
              midland: '#d97706',
              highland: '#f59e0b',
              peak: '#fef3c7',
              rock: '#92400e',
              accent: '#fde047',
            },
            particleType: 'dust',
            particleDensity: 1.6,
          }),
          this.buildRegion({
            id: 'canyon-province',
            name: 'Eolian Canyon Province',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Canyon Province',
            biomeName: 'Layered Sandstone Ravines',
            loreSnippet: 'Towering flat-topped mesas dissected by deep wind-carved labyrinthine canyons.',
            safetyRating: 'Rough Terrain',
            morphology: 'canyons',
            hScale: 1.6,
            rough: 0.85,
            erosion: 0.8,
            ridgeStrength: 1.2,
            canyonStrength: 1.9,
            duneStrength: 0.2,
            waterLevelOffset: -20,
            moisture: 0.04,
            tempOffset: +6,
            wind: 0.7,
            vegDensity: 0.05,
            vegArchetype: 'shrubs',
            faunaDensity: 0.2,
            faunaArchetypes: ['quadruped', 'crawler'],
            rockDensity: 0.8,
            landmarks: ['stone_arches', 'ejecta_boulders'],
            palette: {
              lowland: '#78350f',
              midland: '#9a3412',
              highland: '#c2410c',
              peak: '#fed7aa',
              rock: '#451a03',
              accent: '#ea580c',
            },
            particleType: 'dust',
            particleDensity: 0.8,
          }),
          this.buildRegion({
            id: 'salt-basin',
            name: 'Bleached Salt Basin',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Salt Basin',
            biomeName: 'Desiccated Mineral Pan',
            loreSnippet: 'Vast, blindingly flat expanses of crystalline salt polygons reflecting stellar radiation.',
            safetyRating: 'Stable',
            morphology: 'salt_flat',
            hScale: 0.35,
            rough: 0.2,
            erosion: 0.1,
            ridgeStrength: 0.1,
            canyonStrength: 0.0,
            duneStrength: 0.1,
            waterLevelOffset: -40,
            moisture: 0.0,
            tempOffset: +18,
            wind: 0.5,
            vegDensity: 0.0,
            vegArchetype: 'none',
            faunaDensity: 0.0,
            faunaArchetypes: [],
            rockDensity: 0.15,
            landmarks: ['crystalline_clusters'],
            palette: {
              lowland: '#e2e8f0',
              midland: '#f1f5f9',
              highland: '#f8fafc',
              peak: '#ffffff',
              rock: '#cbd5e1',
              accent: '#38bdf8',
            },
            particleType: 'dust',
            particleDensity: 0.4,
          }),
          this.buildRegion({
            id: 'highland-mesa',
            name: 'Sunken Mesa Terrace',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Highland Mesa',
            biomeName: 'Stepped Basalt Escarpments',
            loreSnippet: 'Layered horizontal geological shelves overlooking vast arid sinkhole basins.',
            safetyRating: 'Rough Terrain',
            morphology: 'mesa_terrace',
            hScale: 1.3,
            rough: 0.7,
            erosion: 0.6,
            ridgeStrength: 0.9,
            canyonStrength: 1.1,
            duneStrength: 0.3,
            waterLevelOffset: -15,
            moisture: 0.05,
            tempOffset: 0,
            wind: 1.1,
            vegDensity: 0.08,
            vegArchetype: 'shrubs',
            faunaDensity: 0.15,
            faunaArchetypes: ['tripod', 'crawler'],
            rockDensity: 0.65,
            landmarks: ['stone_arches'],
            palette: {
              lowland: '#854d0e',
              midland: '#a16207',
              highland: '#ca8a04',
              peak: '#fef08a',
              rock: '#713f12',
              accent: '#eab308',
            },
            particleType: 'dust',
            particleDensity: 1.0,
          }),
        ];

      case 'temperate-terrestrial':
        return [
          this.buildRegion({
            id: 'coastal-shelf',
            name: 'Coastal Shelf Basin',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Coastal Shelf',
            biomeName: 'Marine Shallows & Reefs',
            loreSnippet: 'Rolling verdant coastlines meeting deep blue oceanic shelves with maritime mist.',
            safetyRating: 'Stable',
            morphology: 'coastal',
            hScale: 0.85,
            rough: 0.45,
            erosion: 0.4,
            ridgeStrength: 0.5,
            canyonStrength: 0.2,
            duneStrength: 0.0,
            waterLevelOffset: 0,
            moisture: 0.9,
            tempOffset: +4,
            wind: 0.6,
            vegDensity: 0.75,
            vegArchetype: 'stalks',
            faunaDensity: 0.7,
            faunaArchetypes: ['ray', 'quadruped'],
            rockDensity: 0.35,
            landmarks: ['alien_flora'],
            palette: {
              lowland: '#0284c7', // Azure shallows
              midland: '#16a34a', // Emerald coast
              highland: '#15803d', // Dense flora
              peak: '#f8fafc',
              rock: '#475569',
              accent: '#38bdf8',
            },
            particleType: 'mist',
            particleDensity: 1.2,
          }),
          this.buildRegion({
            id: 'alpine-valley',
            name: 'Alpine Ridge Valley',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Alpine Valley',
            biomeName: 'Glaciated Mountain Peaks',
            loreSnippet: 'Precipitous mountain crests capped with crystalline snow, framing sheltered alpine valleys.',
            safetyRating: 'Rough Terrain',
            morphology: 'alpine',
            hScale: 1.7,
            rough: 0.85,
            erosion: 0.7,
            ridgeStrength: 1.7,
            canyonStrength: 0.6,
            duneStrength: 0.0,
            waterLevelOffset: -25,
            moisture: 0.4,
            tempOffset: -16,
            wind: 1.3,
            vegDensity: 0.25,
            vegArchetype: 'grass',
            faunaDensity: 0.4,
            faunaArchetypes: ['quadruped', 'hopping'],
            rockDensity: 0.85,
            landmarks: ['stone_arches', 'ice_shards'],
            palette: {
              lowland: '#1e293b',
              midland: '#475569',
              highland: '#94a3b8',
              peak: '#ffffff', // Permanent snow
              rock: '#334155',
              accent: '#bae6fd',
            },
            particleType: 'snow',
            particleDensity: 1.1,
          }),
          this.buildRegion({
            id: 'forest-basin',
            name: 'Verdant Forest Basin',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Forest Basin',
            biomeName: 'Dense Biome Canopy',
            loreSnippet: 'Lush interior lowlands blanketed in towering spore-bearing flora and tranquil streams.',
            safetyRating: 'Stable',
            morphology: 'forest_basin',
            hScale: 0.95,
            rough: 0.5,
            erosion: 0.3,
            ridgeStrength: 0.3,
            canyonStrength: 0.1,
            duneStrength: 0.0,
            waterLevelOffset: -5,
            moisture: 0.85,
            tempOffset: +2,
            wind: 0.4,
            vegDensity: 0.9,
            vegArchetype: 'mushrooms',
            faunaDensity: 0.85,
            faunaArchetypes: ['quadruped', 'tripod', 'hopping'],
            rockDensity: 0.3,
            landmarks: ['alien_flora'],
            palette: {
              lowland: '#065f46',
              midland: '#059669',
              highland: '#10b981',
              peak: '#6ee7b7',
              rock: '#1f2937',
              accent: '#34d399',
            },
            particleType: 'spores',
            particleDensity: 1.3,
          }),
          this.buildRegion({
            id: 'volcanic-upland',
            name: 'Volcanic Rift Upland',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Volcanic Upland',
            biomeName: 'Basalt Fault Plateau',
            loreSnippet: 'Geothermally active highlands where dark obsidian shields are broken by fumaroles.',
            safetyRating: 'Thermal Activity',
            morphology: 'volcanic_rift',
            hScale: 1.35,
            rough: 0.8,
            erosion: 0.6,
            ridgeStrength: 1.2,
            canyonStrength: 1.3,
            duneStrength: 0.0,
            waterLevelOffset: -18,
            moisture: 0.2,
            tempOffset: +22,
            wind: 0.9,
            vegDensity: 0.12,
            vegArchetype: 'shrubs',
            faunaDensity: 0.2,
            faunaArchetypes: ['crawler'],
            rockDensity: 0.75,
            landmarks: ['basalt_columns'],
            palette: {
              lowland: '#18181b',
              midland: '#27272a',
              highland: '#451a03',
              peak: '#f97316', // Glowing vent
              rock: '#09090b',
              accent: '#ea580c',
            },
            particleType: 'ash',
            particleDensity: 1.0,
          }),
        ];

      case 'cryogenic-ice':
        return [
          this.buildRegion({
            id: 'glacier-rift',
            name: 'Glacial Crevasse Rift',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Glacier Rift',
            biomeName: 'Fractured Ice Crevasse',
            loreSnippet: 'Deep azure fracture chasms plunging miles into compressed cryo-tectonic ice sheets.',
            safetyRating: 'Rough Terrain',
            morphology: 'glacier_rift',
            hScale: 1.5,
            rough: 0.85,
            erosion: 0.8,
            ridgeStrength: 1.6,
            canyonStrength: 1.8,
            duneStrength: 0.0,
            waterLevelOffset: -10,
            moisture: 0.6,
            tempOffset: -12,
            wind: 1.4,
            vegDensity: 0.0,
            vegArchetype: 'none',
            faunaDensity: 0.1,
            faunaArchetypes: ['crawler'],
            rockDensity: 0.7,
            landmarks: ['ice_shards'],
            palette: {
              lowland: '#0369a1',
              midland: '#0284c7',
              highland: '#38bdf8',
              peak: '#ffffff',
              rock: '#0c4a6e',
              accent: '#7dd3fc',
            },
            particleType: 'snow',
            particleDensity: 1.5,
          }),
          this.buildRegion({
            id: 'polar-plateau',
            name: 'Polar Cryo-Plateau',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Polar Plateau',
            biomeName: 'Smooth Permafrost Plain',
            loreSnippet: 'Sub-zero plateau spanning polar latitudes with windblown cryo-frost and eerie stillness.',
            safetyRating: 'Low Visibility',
            morphology: 'polar_plateau',
            hScale: 0.45,
            rough: 0.3,
            erosion: 0.1,
            ridgeStrength: 0.2,
            canyonStrength: 0.0,
            duneStrength: 0.3,
            waterLevelOffset: -30,
            moisture: 0.2,
            tempOffset: -28,
            wind: 1.2,
            vegDensity: 0.0,
            vegArchetype: 'none',
            faunaDensity: 0.0,
            faunaArchetypes: [],
            rockDensity: 0.2,
            landmarks: ['ice_shards'],
            palette: {
              lowland: '#bae6fd',
              midland: '#e0f2fe',
              highland: '#f0f9ff',
              peak: '#ffffff',
              rock: '#7dd3fc',
              accent: '#c084fc',
            },
            particleType: 'snow',
            particleDensity: 1.8,
          }),
          this.buildRegion({
            id: 'cryo-vents',
            name: 'Sub-Zero Geyser Basin',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Cryo Vents',
            biomeName: 'Cryovolcanic Nitrogen Geysers',
            loreSnippet: 'Superheated subterranean nitrogen geysers erupting through translucent methane ice shelves.',
            safetyRating: 'Thermal Activity',
            morphology: 'cryo_vents',
            hScale: 1.1,
            rough: 0.65,
            erosion: 0.5,
            ridgeStrength: 0.8,
            canyonStrength: 0.7,
            duneStrength: 0.0,
            waterLevelOffset: -5,
            moisture: 0.7,
            tempOffset: +8,
            wind: 0.8,
            vegDensity: 0.05,
            vegArchetype: 'crystals',
            faunaDensity: 0.25,
            faunaArchetypes: ['jelly'],
            rockDensity: 0.5,
            landmarks: ['crystalline_clusters', 'ice_shards'],
            palette: {
              lowland: '#4c1d95',
              midland: '#6d28d9',
              highland: '#8b5cf6',
              peak: '#c4b5fd',
              rock: '#2e1065',
              accent: '#a78bfa',
            },
            particleType: 'spores',
            particleDensity: 1.2,
          }),
        ];

      case 'volcanic-basalt':
        return [
          this.buildRegion({
            id: 'pyroclastic-fissure',
            name: 'Pyroclastic Fissure Basin',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Lava Fissures',
            biomeName: 'Molten Basalt Rifts',
            loreSnippet: 'Active volcanic fissures oozing glowing magma across cracked obsidian sheets.',
            safetyRating: 'Thermal Activity',
            morphology: 'volcanic_rift',
            hScale: 1.4,
            rough: 0.9,
            erosion: 0.7,
            ridgeStrength: 1.4,
            canyonStrength: 1.6,
            duneStrength: 0.0,
            waterLevelOffset: -10,
            moisture: 0.0,
            tempOffset: +45,
            wind: 0.9,
            vegDensity: 0.0,
            vegArchetype: 'none',
            faunaDensity: 0.1,
            faunaArchetypes: ['crawler'],
            rockDensity: 0.9,
            landmarks: ['basalt_columns'],
            palette: {
              lowland: '#18181b',
              midland: '#27272a',
              highland: '#7f1d1d',
              peak: '#ea580c',
              rock: '#09090b',
              accent: '#f97316',
            },
            particleType: 'ash',
            particleDensity: 1.8,
          }),
          this.buildRegion({
            id: 'caldera-rim',
            name: 'Caldera Rim Landing Zone',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Caldera Rim',
            biomeName: 'Precipitous Crater Wall',
            loreSnippet: 'Ancient super-volcano rim towering over sulfur plumes and volcanic glass dunes.',
            safetyRating: 'Rough Terrain',
            morphology: 'caldera_rim',
            hScale: 1.7,
            rough: 0.8,
            erosion: 0.8,
            ridgeStrength: 1.8,
            canyonStrength: 0.9,
            duneStrength: 0.2,
            waterLevelOffset: -30,
            moisture: 0.0,
            tempOffset: +20,
            wind: 1.4,
            vegDensity: 0.0,
            vegArchetype: 'none',
            faunaDensity: 0.0,
            faunaArchetypes: [],
            rockDensity: 0.85,
            landmarks: ['basalt_columns', 'ejecta_boulders'],
            palette: {
              lowland: '#27272a',
              midland: '#3f3f46',
              highland: '#71717a',
              peak: '#dc2626',
              rock: '#18181b',
              accent: '#ef4444',
            },
            particleType: 'ash',
            particleDensity: 1.3,
          }),
        ];

      default:
        // Generic multi-region fallback derived coherently from planetProfile
        return [
          this.buildRegion({
            id: 'survey-plain',
            name: `${planetProfile.family.replace('-', ' ').toUpperCase()} Survey Plain`,
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Lowland Plain',
            biomeName: 'Equilibrated Basin Floor',
            loreSnippet: 'Expansive geological lowlands providing smooth terrain for exploratory flight.',
            safetyRating: 'Stable',
            morphology: 'forest_basin',
            hScale: 0.8,
            rough: 0.45,
            erosion: 0.3,
            ridgeStrength: 0.4,
            canyonStrength: 0.2,
            duneStrength: 0.0,
            waterLevelOffset: 0,
            moisture: 0.5,
            tempOffset: 0,
            wind: 0.5,
            vegDensity: planetProfile.biosignature !== 'none' ? 0.6 : 0.0,
            vegArchetype: planetProfile.biosignature !== 'none' ? 'stalks' : 'none',
            faunaDensity: planetProfile.biosignature === 'complex-ecosystem' ? 0.6 : 0.0,
            faunaArchetypes: ['quadruped', 'crawler'],
            rockDensity: 0.4,
            landmarks: [planetProfile.landmark],
            palette: {
              lowland: basePalette.surfaceLowland,
              midland: basePalette.surfaceMidland,
              highland: basePalette.surfaceHighland,
              peak: basePalette.surfacePeak,
              rock: '#334155',
              accent: basePalette.accentMineral,
            },
            particleType: planetProfile.atmosphere.particleType,
            particleDensity: 1.0,
          }),
          this.buildRegion({
            id: 'ridge-valley',
            name: `${planetProfile.family.replace('-', ' ').toUpperCase()} Highland Ridge`,
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Highland Ridge',
            biomeName: 'Elevated Tectonic Scarp',
            loreSnippet: 'Jagged highlands with dramatic relief and complex rock formations.',
            safetyRating: 'Rough Terrain',
            morphology: 'alpine',
            hScale: 1.6,
            rough: 0.85,
            erosion: 0.7,
            ridgeStrength: 1.5,
            canyonStrength: 0.8,
            duneStrength: 0.0,
            waterLevelOffset: -20,
            moisture: 0.3,
            tempOffset: -8,
            wind: 1.2,
            vegDensity: planetProfile.biosignature !== 'none' ? 0.2 : 0.0,
            vegArchetype: 'grass',
            faunaDensity: planetProfile.biosignature === 'complex-ecosystem' ? 0.3 : 0.0,
            faunaArchetypes: ['hopping'],
            rockDensity: 0.8,
            landmarks: [planetProfile.landmark, 'stone_arches'],
            palette: {
              lowland: basePalette.surfaceMidland,
              midland: basePalette.surfaceHighland,
              highland: basePalette.surfacePeak,
              peak: '#ffffff',
              rock: '#1e293b',
              accent: basePalette.accentMineral,
            },
            particleType: planetProfile.atmosphere.particleType,
            particleDensity: 1.2,
          }),
          this.buildRegion({
            id: 'fault-rift',
            name: `${planetProfile.family.replace('-', ' ').toUpperCase()} Fault Rift`,
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Fault Rift',
            biomeName: 'Subsidence Chasm',
            loreSnippet: 'Deep tectonic depression exposing primordial bedrock and mineral veins.',
            safetyRating: 'Thermal Activity',
            morphology: 'canyons',
            hScale: 1.4,
            rough: 0.75,
            erosion: 0.5,
            ridgeStrength: 0.9,
            canyonStrength: 1.6,
            duneStrength: 0.0,
            waterLevelOffset: -10,
            moisture: 0.4,
            tempOffset: +5,
            wind: 0.8,
            vegDensity: planetProfile.biosignature !== 'none' ? 0.15 : 0.0,
            vegArchetype: 'shrubs',
            faunaDensity: planetProfile.biosignature === 'complex-ecosystem' ? 0.2 : 0.0,
            faunaArchetypes: ['crawler'],
            rockDensity: 0.9,
            landmarks: [planetProfile.landmark],
            palette: {
              lowland: '#0f172a',
              midland: basePalette.surfaceLowland,
              highland: basePalette.surfaceMidland,
              peak: basePalette.accentMineral,
              rock: '#020617',
              accent: basePalette.accentMineral,
            },
            particleType: planetProfile.atmosphere.particleType,
            particleDensity: 1.1,
          }),
        ];
    }
  }

  private static buildRegion(config: {
    id: string;
    name: string;
    seed: number;
    regionType: string;
    biomeName: string;
    loreSnippet: string;
    safetyRating: LandingRegionProfile['safetyRating'];
    morphology: RegionalMorphology;
    hScale: number;
    rough: number;
    erosion: number;
    ridgeStrength: number;
    canyonStrength: number;
    duneStrength: number;
    waterLevelOffset: number;
    moisture: number;
    tempOffset: number;
    wind: number;
    vegDensity: number;
    vegArchetype: VegetationArchetype;
    faunaDensity: number;
    faunaArchetypes: FaunaArchetype[];
    rockDensity: number;
    landmarks: LandmarkFamily[];
    palette: RegionalSurfacePalette;
    particleType?: 'none' | 'dust' | 'snow' | 'ash' | 'spores' | 'mist';
    particleDensity: number;
  }): LandingRegionProfile {
    return {
      id: config.id,
      name: config.name,
      regionSeed: config.seed,
      regionType: config.regionType,
      biomeName: config.biomeName,
      loreSnippet: config.loreSnippet,
      safetyRating: config.safetyRating,
      interestingSignals: [
        'Geological structural anomaly',
        'Atmospheric density gradient',
        'Trace electromagnetic resonance',
      ],
      terrainMorphologyOverride: config.morphology,
      heightScale: config.hScale,
      roughness: config.rough,
      erosion: config.erosion,
      ridgeStrength: config.ridgeStrength,
      canyonStrength: config.canyonStrength,
      duneStrength: config.duneStrength,
      waterLevelOffset: config.waterLevelOffset,
      moisture: config.moisture,
      temperatureOffset: config.tempOffset,
      windStrength: config.wind,
      vegetationDensity: config.vegDensity,
      vegetationArchetype: config.vegArchetype,
      faunaDensity: config.faunaDensity,
      faunaArchetypes: config.faunaArchetypes,
      rockDensity: config.rockDensity,
      landmarkFamilies: config.landmarks,
      localSurfacePalette: config.palette,
      fogModifier: {
        color: config.palette.lowland,
        densityMultiplier: 1.0 + (config.moisture * 0.5),
      },
      particleModifier: {
        type: config.particleType || 'none',
        densityMultiplier: config.particleDensity,
      },
    };
  }
}
