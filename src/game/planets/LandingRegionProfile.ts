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
  | 'regolith_highland'
  | 'bioluminescent_archipelago'
  | 'obsidian_caldera'
  | 'glacial_chasm'
  | 'floating_mesas'
  | 'spore_grotto'
  | 'plasma_fractures'
  | 'fungal_canopy'
  | 'shattered_monoliths'
  | 'primordial_jungle'
  | 'neon_badlands';

export type VegetationArchetype =
  | 'none'
  | 'stalks'
  | 'shrubs'
  | 'mushrooms'
  | 'fans'
  | 'bulbous'
  | 'crystals'
  | 'grass'
  | 'spore_tree'
  | 'bioluminescent_tendril'
  | 'crystalline_lotus'
  | 'giant_kelp_spire'
  | 'spiral_fern'
  | 'floating_spore_orb'
  | 'mycelial_colossus_cap'
  | 'plasma_tendril_flower'
  | 'crystal_spire_bloom'
  | 'spiral_spore_stalk'
  | 'ancient_jungle_canopy';

export type FaunaArchetype =
  | 'quadruped'
  | 'tripod'
  | 'jelly'
  | 'hopping'
  | 'ray'
  | 'crawler'
  | 'sky_whale'
  | 'titan_strider'
  | 'spore_medusa'
  | 'crystal_scuttler'
  | 'dune_serpent'
  | 'avian_flock'
  | 'biped_stalker'
  | 'ocean_leviathan'
  | 'lithic_behemoth'
  | 'zephyr_leviathan'
  | 'archipelago_swimmer'
  | 'crystal_behemoth'
  | 'mycelial_chimera'
  | 'plasma_kite'
  | 'magma_drake'
  | 'abyssal_drifter'
  | 'strider_colossus'
  | 'sand_scythe'
  | 'floating_aegis'
  | 'chitin_burrower';

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
    type?: 'none' | 'dust' | 'snow' | 'ash' | 'spores' | 'mist' | 'plasma_sparks' | 'geiger_glow';
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
            faunaDensity: 0.15,
            faunaArchetypes: ['dune_serpent', 'crawler'],
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
            vegDensity: 0.1,
            vegArchetype: 'shrubs',
            faunaDensity: 0.35,
            faunaArchetypes: ['avian_flock', 'crystal_scuttler', 'quadruped'],
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
            vegDensity: 0.05,
            vegArchetype: 'crystals',
            faunaDensity: 0.15,
            faunaArchetypes: ['crystal_scuttler'],
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
            vegDensity: 0.12,
            vegArchetype: 'fans',
            faunaDensity: 0.25,
            faunaArchetypes: ['tripod', 'biped_stalker', 'crawler'],
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
            vegArchetype: 'fans',
            faunaDensity: 0.7,
            faunaArchetypes: ['sky_whale', 'ray', 'avian_flock'],
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
            vegDensity: 0.35,
            vegArchetype: 'grass',
            faunaDensity: 0.5,
            faunaArchetypes: ['titan_strider', 'biped_stalker', 'hopping'],
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
            vegDensity: 0.95,
            vegArchetype: 'spore_tree',
            faunaDensity: 0.9,
            faunaArchetypes: ['sky_whale', 'spore_medusa', 'titan_strider', 'avian_flock'],
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
            vegDensity: 0.08,
            vegArchetype: 'crystals',
            faunaDensity: 0.25,
            faunaArchetypes: ['crystal_scuttler', 'crawler'],
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
            faunaDensity: 0.15,
            faunaArchetypes: ['sky_whale'],
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
            vegDensity: 0.15,
            vegArchetype: 'crystals',
            faunaDensity: 0.4,
            faunaArchetypes: ['spore_medusa', 'crystal_scuttler', 'jelly'],
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
            vegDensity: 0.04,
            vegArchetype: 'bulbous',
            faunaDensity: 0.25,
            faunaArchetypes: ['crystal_scuttler', 'crawler'],
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
            faunaDensity: 0.2,
            faunaArchetypes: ['biped_stalker', 'crystal_scuttler'],
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

      case 'gas-giant':
        return [
          this.buildRegion({
            id: 'jovian-aerostat',
            name: 'Upper Jovian Aerostat Platform',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Aerostat City',
            biomeName: 'High Stratosphere Cloud Deck',
            loreSnippet: 'Floating scientific mooring station suspended in buoyant upper ammonia cloud bands.',
            safetyRating: 'Moderate Winds',
            morphology: 'mesa_terrace',
            hScale: 0.6,
            rough: 0.2,
            erosion: 0.1,
            ridgeStrength: 0.2,
            canyonStrength: 0.1,
            duneStrength: 1.2,
            waterLevelOffset: -40,
            moisture: 0.8,
            tempOffset: -20,
            wind: 2.2,
            vegDensity: 0.0,
            vegArchetype: 'none',
            faunaDensity: 0.4,
            faunaArchetypes: ['sky_whale', 'avian_flock'],
            rockDensity: 0.1,
            landmarks: ['coastal_monoliths'],
            palette: {
              lowland: basePalette.surfaceLowland,
              midland: basePalette.surfaceMidland,
              highland: basePalette.surfaceHighland,
              peak: basePalette.surfacePeak,
              rock: '#1e293b',
              accent: basePalette.accentMineral,
            },
            particleType: 'mist',
            particleDensity: 2.5,
          }),
          this.buildRegion({
            id: 'cloud-siphon',
            name: 'Metallic Hydrogen Cloud Rift',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Atmospheric Siphon',
            biomeName: 'Ionized Vapor Trench',
            loreSnippet: 'Deep atmospheric circulation rift harvested by autonomous gas siphoning arrays.',
            safetyRating: 'Thermal Activity',
            morphology: 'dunes',
            hScale: 1.1,
            rough: 0.4,
            erosion: 0.2,
            ridgeStrength: 0.6,
            canyonStrength: 0.4,
            duneStrength: 1.8,
            waterLevelOffset: -20,
            moisture: 0.9,
            tempOffset: +15,
            wind: 2.8,
            vegDensity: 0.0,
            vegArchetype: 'none',
            faunaDensity: 0.2,
            faunaArchetypes: ['sky_whale'],
            rockDensity: 0.05,
            landmarks: ['mineral_chimneys'],
            palette: {
              lowland: basePalette.surfaceLowland,
              midland: basePalette.surfaceMidland,
              highland: basePalette.surfaceHighland,
              peak: '#fef08a',
              rock: '#334155',
              accent: '#38bdf8',
            },
            particleType: 'mist',
            particleDensity: 3.0,
          }),
          this.buildRegion({
            id: 'stratospheric-haven',
            name: 'Stratospheric Skim Haven',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Skim Mooring',
            biomeName: 'Laminar Cloud Plains',
            loreSnippet: 'Tranquil boundary layer offering stable hover reconnaissance over sweeping planetary bands.',
            safetyRating: 'Stable',
            morphology: 'salt_flat',
            hScale: 0.4,
            rough: 0.15,
            erosion: 0.05,
            ridgeStrength: 0.1,
            canyonStrength: 0.0,
            duneStrength: 0.6,
            waterLevelOffset: -30,
            moisture: 0.7,
            tempOffset: -5,
            wind: 1.1,
            vegDensity: 0.0,
            vegArchetype: 'none',
            faunaDensity: 0.35,
            faunaArchetypes: ['avian_flock', 'sky_whale'],
            rockDensity: 0.05,
            landmarks: ['stone_arches'],
            palette: {
              lowland: basePalette.surfaceLowland,
              midland: basePalette.surfaceMidland,
              highland: basePalette.surfaceHighland,
              peak: basePalette.surfacePeak,
              rock: '#0f172a',
              accent: '#facc15',
            },
            particleType: 'mist',
            particleDensity: 1.8,
          }),
        ];

      case 'aurora-plasma':
        return [
          this.buildRegion({
            id: 'aurora-strand',
            name: 'Ionized Aurora Strand',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Ionized Strand',
            biomeName: 'Plasma-Swept Dunes',
            loreSnippet: 'Crackling auroral discharge curtains ripple over iridescent neon dunes charged by strong magnetic flux.',
            safetyRating: 'Thermal Activity',
            morphology: 'plasma_fractures',
            hScale: 1.2,
            rough: 0.7,
            erosion: 0.4,
            ridgeStrength: 1.1,
            canyonStrength: 0.9,
            duneStrength: 1.4,
            waterLevelOffset: -15,
            moisture: 0.35,
            tempOffset: +8,
            wind: 1.4,
            vegDensity: 0.4,
            vegArchetype: 'plasma_tendril_flower',
            faunaDensity: 0.6,
            faunaArchetypes: ['plasma_kite', 'avian_flock', 'crystal_behemoth'],
            rockDensity: 0.5,
            landmarks: ['plasma_spires', 'crystalline_clusters'],
            palette: {
              lowland: '#0f172a',
              midland: '#3b0764',
              highland: '#06b6d4',
              peak: '#a855f7',
              rock: '#1e1b4b',
              accent: '#38bdf8',
            },
            particleType: 'plasma_sparks',
            particleDensity: 2.2,
          }),
          this.buildRegion({
            id: 'magnetic-rift',
            name: 'Electromagnetic Ley Chasm',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Magnetic Chasm',
            biomeName: 'Ion Trough Basin',
            loreSnippet: 'Deep tectonic fissure conducting planetary electric currents directly into liquid crystal beds.',
            safetyRating: 'Low Visibility',
            morphology: 'canyons',
            hScale: 1.6,
            rough: 0.85,
            erosion: 0.6,
            ridgeStrength: 1.4,
            canyonStrength: 1.8,
            duneStrength: 0.1,
            waterLevelOffset: -5,
            moisture: 0.5,
            tempOffset: -4,
            wind: 0.9,
            vegDensity: 0.3,
            vegArchetype: 'crystalline_lotus',
            faunaDensity: 0.5,
            faunaArchetypes: ['floating_aegis', 'ray', 'zephyr_leviathan'],
            rockDensity: 0.7,
            landmarks: ['plasma_spires'],
            palette: {
              lowland: '#020617',
              midland: '#1e1b4b',
              highland: '#67e8f9',
              peak: '#c084fc',
              rock: '#0f172a',
              accent: '#06b6d4',
            },
            particleType: 'plasma_sparks',
            particleDensity: 1.8,
          }),
          this.buildRegion({
            id: 'aurora-pinnacles',
            name: 'Aurora Corona Pinnacles',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Ionized Highlands',
            biomeName: 'Plasma Needle Range',
            loreSnippet: 'Needle-sharp conductive peaks that channel solar flares into sweeping emerald and violet auroras.',
            safetyRating: 'Thermal Activity',
            morphology: 'plasma_fractures',
            hScale: 1.8,
            rough: 0.9,
            erosion: 0.5,
            ridgeStrength: 1.6,
            canyonStrength: 1.2,
            duneStrength: 0.2,
            waterLevelOffset: -30,
            moisture: 0.2,
            tempOffset: +12,
            wind: 1.6,
            vegDensity: 0.2,
            vegArchetype: 'plasma_tendril_flower',
            faunaDensity: 0.5,
            faunaArchetypes: ['plasma_kite', 'floating_aegis', 'sand_scythe'],
            rockDensity: 0.85,
            landmarks: ['plasma_spires'],
            palette: {
              lowland: '#1e1b4b',
              midland: '#4c1d95',
              highland: '#06b6d4',
              peak: '#f43f5e',
              rock: '#0f172a',
              accent: '#38bdf8',
            },
            particleType: 'plasma_sparks',
            particleDensity: 2.5,
          }),
        ];

      case 'fungal-mycelium':
        return [
          this.buildRegion({
            id: 'mycelial-canopy',
            name: 'Colossal Mycelial Canopy',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Fungal Forest',
            biomeName: 'Velvet Spore Forest',
            loreSnippet: 'Towering hundred-meter bioluminescent mushroom caps sheltering dense undergrowth from cosmic rays.',
            safetyRating: 'Moderate Winds',
            morphology: 'fungal_canopy',
            hScale: 1.1,
            rough: 0.55,
            erosion: 0.35,
            ridgeStrength: 0.8,
            canyonStrength: 0.6,
            duneStrength: 0.3,
            waterLevelOffset: 0,
            moisture: 0.75,
            tempOffset: +3,
            wind: 0.8,
            vegDensity: 0.85,
            vegArchetype: 'mycelial_colossus_cap',
            faunaDensity: 0.75,
            faunaArchetypes: ['mycelial_chimera', 'spore_medusa', 'titan_strider'],
            rockDensity: 0.3,
            landmarks: ['giant_spore_caps', 'spore_spires'],
            palette: {
              lowland: '#064e3b',
              midland: '#701a75',
              highland: '#059669',
              peak: '#d946ef',
              rock: '#2e1065',
              accent: '#34d399',
            },
            particleType: 'spores',
            particleDensity: 2.8,
          }),
          this.buildRegion({
            id: 'spore-wetlands',
            name: 'Phosphor Spore Wetlands',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Spore Basin',
            biomeName: 'Bioluminescent Silt Marsh',
            loreSnippet: 'Rich organic wetlands fed by sub-crust geothermal vents, glowing with hypnotic viridian light.',
            safetyRating: 'Stable',
            morphology: 'spore_grotto',
            hScale: 0.9,
            rough: 0.45,
            erosion: 0.4,
            ridgeStrength: 0.5,
            canyonStrength: 0.3,
            duneStrength: 0.2,
            waterLevelOffset: +5,
            moisture: 0.9,
            tempOffset: +5,
            wind: 0.5,
            vegDensity: 0.7,
            vegArchetype: 'spiral_spore_stalk',
            faunaDensity: 0.7,
            faunaArchetypes: ['abyssal_drifter', 'chitin_burrower', 'hopping'],
            rockDensity: 0.25,
            landmarks: ['giant_spore_caps'],
            palette: {
              lowland: '#042f2e',
              midland: '#065f46',
              highland: '#86198f',
              peak: '#f472b6',
              rock: '#134e4a',
              accent: '#2dd4bf',
            },
            particleType: 'spores',
            particleDensity: 2.0,
          }),
          this.buildRegion({
            id: 'hyphae-ridge',
            name: 'Ancient Hyphae Ridge',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Fungal Highlands',
            biomeName: 'Petrified Shelf Ridge',
            loreSnippet: 'Massive petrified fungal stalks forming stepped ridges high above the spore mist.',
            safetyRating: 'Rough Terrain',
            morphology: 'fungal_canopy',
            hScale: 1.5,
            rough: 0.75,
            erosion: 0.45,
            ridgeStrength: 1.3,
            canyonStrength: 0.9,
            duneStrength: 0.1,
            waterLevelOffset: -20,
            moisture: 0.6,
            tempOffset: -2,
            wind: 1.1,
            vegDensity: 0.6,
            vegArchetype: 'mycelial_colossus_cap',
            faunaDensity: 0.6,
            faunaArchetypes: ['mycelial_chimera', 'strider_colossus', 'chitin_burrower'],
            rockDensity: 0.5,
            landmarks: ['giant_spore_caps', 'spore_spires'],
            palette: {
              lowland: '#064e3b',
              midland: '#581c87',
              highland: '#047857',
              peak: '#e879f9',
              rock: '#1e1b4b',
              accent: '#34d399',
            },
            particleType: 'spores',
            particleDensity: 2.2,
          }),
        ];

      case 'shattered-shards':
        return [
          this.buildRegion({
            id: 'monolith-reach',
            name: 'Levitating Monolith Reach',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Tectonic Rift',
            biomeName: 'Anti-Gravity Plateau',
            loreSnippet: 'Gigantic fractured stone monoliths hovering silently in equilibrium with planetary diamagnetism.',
            safetyRating: 'Rough Terrain',
            morphology: 'shattered_monoliths',
            hScale: 1.8,
            rough: 0.9,
            erosion: 0.6,
            ridgeStrength: 1.6,
            canyonStrength: 1.7,
            duneStrength: 0.1,
            waterLevelOffset: -25,
            moisture: 0.2,
            tempOffset: -8,
            wind: 1.3,
            vegDensity: 0.25,
            vegArchetype: 'crystal_spire_bloom',
            faunaDensity: 0.5,
            faunaArchetypes: ['crystal_behemoth', 'crystal_scuttler', 'lithic_behemoth'],
            rockDensity: 0.9,
            landmarks: ['levitating_monoliths', 'crystalline_clusters'],
            palette: {
              lowland: '#18181b',
              midland: '#27272a',
              highland: '#7e22ce',
              peak: '#38bdf8',
              rock: '#09090b',
              accent: '#f43f5e',
            },
            particleType: 'none',
            particleDensity: 0.5,
          }),
          this.buildRegion({
            id: 'crystal-abyss',
            name: 'Prismatic Void Chasm',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Abyssal Trench',
            biomeName: 'Resonant Crystal Trench',
            loreSnippet: 'Steep sheer cliffs of quartz and amethyst amplifying subtle acoustic vibrations of the core.',
            safetyRating: 'Low Visibility',
            morphology: 'glacial_chasm',
            hScale: 1.5,
            rough: 0.8,
            erosion: 0.5,
            ridgeStrength: 1.3,
            canyonStrength: 1.8,
            duneStrength: 0.0,
            waterLevelOffset: -10,
            moisture: 0.3,
            tempOffset: -12,
            wind: 1.0,
            vegDensity: 0.35,
            vegArchetype: 'crystalline_lotus',
            faunaDensity: 0.45,
            faunaArchetypes: ['floating_aegis', 'tripod', 'ray'],
            rockDensity: 0.85,
            landmarks: ['levitating_monoliths'],
            palette: {
              lowland: '#09090b',
              midland: '#3b0764',
              highland: '#9333ea',
              peak: '#67e8f9',
              rock: '#18181b',
              accent: '#c084fc',
            },
            particleType: 'none',
            particleDensity: 0.3,
          }),
          this.buildRegion({
            id: 'shard-monolith-vale',
            name: 'Shattered Monolith Vale',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Fractured Basin',
            biomeName: 'Geode Shard Plain',
            loreSnippet: 'A crystalline basin strewn with shattered tectonic prisms that hum with harmonic frequencies.',
            safetyRating: 'Stable',
            morphology: 'shattered_monoliths',
            hScale: 1.2,
            rough: 0.7,
            erosion: 0.4,
            ridgeStrength: 0.9,
            canyonStrength: 0.8,
            duneStrength: 0.2,
            waterLevelOffset: -15,
            moisture: 0.35,
            tempOffset: -4,
            wind: 0.8,
            vegDensity: 0.4,
            vegArchetype: 'crystal_spire_bloom',
            faunaDensity: 0.55,
            faunaArchetypes: ['crystal_behemoth', 'floating_aegis', 'crawler'],
            rockDensity: 0.75,
            landmarks: ['levitating_monoliths', 'crystalline_clusters'],
            palette: {
              lowland: '#18181b',
              midland: '#3f3f46',
              highland: '#9333ea',
              peak: '#38bdf8',
              rock: '#09090b',
              accent: '#f43f5e',
            },
            particleType: 'none',
            particleDensity: 0.4,
          }),
        ];

      case 'chlorophyll-jungle':
        return [
          this.buildRegion({
            id: 'primordial-canopy',
            name: 'Primordial Jungle Canopy',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Dense Jungle',
            biomeName: 'Emerald Mega-Canopy',
            loreSnippet: 'Dense primeval forest teeming with symbiotic organisms, spiral fern canopies, and warm morning mist.',
            safetyRating: 'Moderate Winds',
            morphology: 'primordial_jungle',
            hScale: 1.1,
            rough: 0.6,
            erosion: 0.4,
            ridgeStrength: 0.7,
            canyonStrength: 0.5,
            duneStrength: 0.2,
            waterLevelOffset: +8,
            moisture: 0.85,
            tempOffset: +6,
            wind: 0.7,
            vegDensity: 0.9,
            vegArchetype: 'ancient_jungle_canopy',
            faunaDensity: 0.85,
            faunaArchetypes: ['strider_colossus', 'biped_stalker', 'avian_flock'],
            rockDensity: 0.3,
            landmarks: ['ancient_fossil_ribs', 'alien_flora'],
            palette: {
              lowland: '#064e3b',
              midland: '#15803d',
              highland: '#166534',
              peak: '#facc15',
              rock: '#14532d',
              accent: '#22c55e',
            },
            particleType: 'mist',
            particleDensity: 1.8,
          }),
          this.buildRegion({
            id: 'swamp-archipelago',
            name: 'Misty Mangrove Delta',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Wetland Delta',
            biomeName: 'Shallow Estuary Delta',
            loreSnippet: 'Interlaced aquatic labyrinth of warm tidal channels where amphibious leviathans glide.',
            safetyRating: 'Stable',
            morphology: 'bioluminescent_archipelago',
            hScale: 0.7,
            rough: 0.45,
            erosion: 0.35,
            ridgeStrength: 0.4,
            canyonStrength: 0.3,
            duneStrength: 0.1,
            waterLevelOffset: +15,
            moisture: 0.95,
            tempOffset: +4,
            wind: 0.6,
            vegDensity: 0.8,
            vegArchetype: 'giant_kelp_spire',
            faunaDensity: 0.8,
            faunaArchetypes: ['archipelago_swimmer', 'abyssal_drifter', 'ocean_leviathan'],
            rockDensity: 0.2,
            landmarks: ['coastal_monoliths'],
            palette: {
              lowland: '#022c22',
              midland: '#047857',
              highland: '#0f766e',
              peak: '#fef08a',
              rock: '#064e3b',
              accent: '#34d399',
            },
            particleType: 'mist',
            particleDensity: 2.2,
          }),
          this.buildRegion({
            id: 'misty-fern-plateau',
            name: 'Cloud-Fern Highland Plateau',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Highland Rainforest',
            biomeName: 'Mist-Veiled Canopy Heights',
            loreSnippet: 'High-altitude cloud forest where primordial spiral ferns reach into dense vapor streams.',
            safetyRating: 'Low Visibility',
            morphology: 'primordial_jungle',
            hScale: 1.5,
            rough: 0.7,
            erosion: 0.5,
            ridgeStrength: 1.2,
            canyonStrength: 0.8,
            duneStrength: 0.1,
            waterLevelOffset: -10,
            moisture: 0.9,
            tempOffset: +1,
            wind: 1.0,
            vegDensity: 0.95,
            vegArchetype: 'ancient_jungle_canopy',
            faunaDensity: 0.8,
            faunaArchetypes: ['strider_colossus', 'avian_flock', 'quadruped'],
            rockDensity: 0.35,
            landmarks: ['ancient_fossil_ribs'],
            palette: {
              lowland: '#022c22',
              midland: '#166534',
              highland: '#15803d',
              peak: '#fde047',
              rock: '#064e3b',
              accent: '#4ade80',
            },
            particleType: 'mist',
            particleDensity: 2.5,
          }),
        ];

      case 'radioactive-abyss':
        return [
          this.buildRegion({
            id: 'uranium-badlands',
            name: 'Supercritical Uranium Badlands',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Irradiated Badlands',
            biomeName: 'Fluorescent Slag Basin',
            loreSnippet: 'Eroded basalt plateaus infused with high-energy radioisotopes glowing in spectral green phosphorescence.',
            safetyRating: 'Thermal Activity',
            morphology: 'neon_badlands',
            hScale: 1.4,
            rough: 0.9,
            erosion: 0.65,
            ridgeStrength: 1.3,
            canyonStrength: 1.2,
            duneStrength: 0.4,
            waterLevelOffset: -18,
            moisture: 0.25,
            tempOffset: +16,
            wind: 1.2,
            vegDensity: 0.2,
            vegArchetype: 'crystals',
            faunaDensity: 0.45,
            faunaArchetypes: ['magma_drake', 'chitin_burrower', 'sand_scythe'],
            rockDensity: 0.85,
            landmarks: ['prismatic_geodes', 'mineral_chimneys'],
            palette: {
              lowland: '#1c1917',
              midland: '#3f6212',
              highland: '#65a30d',
              peak: '#84cc16',
              rock: '#0c0a09',
              accent: '#facc15',
            },
            particleType: 'geiger_glow',
            particleDensity: 2.4,
          }),
          this.buildRegion({
            id: 'pitchblende-crater',
            name: 'Pitchblende Caldera Sink',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Nuclear Caldera',
            biomeName: 'Vitriol Lava Caldera',
            loreSnippet: 'A vast impact sinkhole where subterranean radioactive heat has liquefied mineral salts into glowing pools.',
            safetyRating: 'Thermal Activity',
            morphology: 'obsidian_caldera',
            hScale: 1.6,
            rough: 0.85,
            erosion: 0.7,
            ridgeStrength: 1.5,
            canyonStrength: 1.4,
            duneStrength: 0.1,
            waterLevelOffset: -10,
            moisture: 0.4,
            tempOffset: +22,
            wind: 0.9,
            vegDensity: 0.15,
            vegArchetype: 'bioluminescent_tendril',
            faunaDensity: 0.5,
            faunaArchetypes: ['crystal_behemoth', 'crawler', 'lithic_behemoth'],
            rockDensity: 0.9,
            landmarks: ['prismatic_geodes'],
            palette: {
              lowland: '#0a0a0a',
              midland: '#14532d',
              highland: '#4d7c0f',
              peak: '#a3e635',
              rock: '#18181b',
              accent: '#eab308',
            },
            particleType: 'geiger_glow',
            particleDensity: 2.6,
          }),
          this.buildRegion({
            id: 'isotope-needle-range',
            name: 'Isotope Needle Highlands',
            seed: rng.rangeInt(1000, 999999),
            regionType: 'Radioactive Needles',
            biomeName: 'Phosphorescent Ridge Crags',
            loreSnippet: 'Towering needles of enriched pitchblende emitting continuous ionic glow into the ionosphere.',
            safetyRating: 'Low Visibility',
            morphology: 'neon_badlands',
            hScale: 1.8,
            rough: 0.95,
            erosion: 0.6,
            ridgeStrength: 1.7,
            canyonStrength: 1.5,
            duneStrength: 0.2,
            waterLevelOffset: -30,
            moisture: 0.15,
            tempOffset: +18,
            wind: 1.5,
            vegDensity: 0.1,
            vegArchetype: 'crystals',
            faunaDensity: 0.4,
            faunaArchetypes: ['sand_scythe', 'magma_drake', 'chitin_burrower'],
            rockDensity: 0.95,
            landmarks: ['prismatic_geodes'],
            palette: {
              lowland: '#14532d',
              midland: '#365314',
              highland: '#65a30d',
              peak: '#a3e635',
              rock: '#052e16',
              accent: '#fde047',
            },
            particleType: 'geiger_glow',
            particleDensity: 2.8,
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
            vegArchetype: planetProfile.biosignature !== 'none' ? 'spore_tree' : 'none',
            faunaDensity: planetProfile.biosignature === 'complex-ecosystem' ? 0.6 : 0.0,
            faunaArchetypes: ['sky_whale', 'avian_flock', 'quadruped', 'crawler'],
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
            faunaDensity: planetProfile.biosignature === 'complex-ecosystem' ? 0.35 : 0.0,
            faunaArchetypes: ['titan_strider', 'biped_stalker', 'hopping'],
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
            vegArchetype: 'crystals',
            faunaDensity: planetProfile.biosignature === 'complex-ecosystem' ? 0.25 : 0.0,
            faunaArchetypes: ['crystal_scuttler', 'dune_serpent', 'crawler'],
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
    particleType?: 'none' | 'dust' | 'snow' | 'ash' | 'spores' | 'mist' | 'plasma_sparks' | 'geiger_glow';
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
