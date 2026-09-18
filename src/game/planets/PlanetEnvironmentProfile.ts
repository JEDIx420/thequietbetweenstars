import { SeededRandom } from '../universe/SeededRandom';

export type PlanetFamily =
  | 'barren-moon'
  | 'cryogenic-ice'
  | 'desert-dune'
  | 'volcanic-basalt'
  | 'temperate-terrestrial'
  | 'oceanic-water'
  | 'toxic-chemical'
  | 'crystalline-mineral'
  | 'high-biosignature'
  | 'metallic-iron'
  | 'gas-giant'
  | 'aurora-plasma'
  | 'fungal-mycelium'
  | 'shattered-shards'
  | 'chlorophyll-jungle'
  | 'radioactive-abyss';

export type TerrainMorphologyType =
  | 'craters'
  | 'dunes'
  | 'volcanic_rift'
  | 'glacier_fissures'
  | 'rolling_plains'
  | 'archipelago_shallows'
  | 'corrosive_badlands'
  | 'faceted_crystals'
  | 'terraced_biomes'
  | 'sharp_ridges'
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

export type LandmarkFamily =
  | 'ejecta_boulders'
  | 'ice_shards'
  | 'stone_arches'
  | 'basalt_columns'
  | 'alien_flora'
  | 'coastal_monoliths'
  | 'mineral_chimneys'
  | 'crystalline_clusters'
  | 'spore_spires'
  | 'metallic_spikes'
  | 'giant_spore_caps'
  | 'plasma_spires'
  | 'levitating_monoliths'
  | 'ancient_fossil_ribs'
  | 'prismatic_geodes';

export interface AtmosphereProfile {
  hasAtmosphere: boolean;
  density: number;        // 0.0 (airless) to 2.5
  skyZenith: string;      // Zenith sky hex
  skyHorizon: string;     // Horizon gradient hex
  fogColor: string;       // Volumetric fog hex
  fogDensity: number;     // e.g. 0.001 to 0.006
  particleType: 'none' | 'dust' | 'snow' | 'ash' | 'spores' | 'mist' | 'plasma_sparks' | 'geiger_glow';
  particleColor?: string;
}

export interface TerrainProfile {
  morphology: TerrainMorphologyType;
  heightScale: number;    // Multiplier for peaks
  roughness: number;      // High-frequency detail
  domainWarp: number;     // Sinusoidal coordinate distortion
  seaLevel: number;       // Altitude threshold for water
  hasLiquid: boolean;
  liquidColor: string;
  liquidSpecular: string;
}

export interface PaletteProfile {
  surfaceLowland: string; // Basins, shores, sands
  surfaceMidland: string; // Primary terrain
  surfaceHighland: string;// Mountain rock, ridges
  surfacePeak: string;    // Snow, ash, crystal caps
  accentMineral: string;  // Rare vein / specular glow
  atmosphereGlow: string; // Planetary limb glow
  cloudColor: string;
  ringColor?: string;
  sunLightColor: number;  // Directional star light
  ambientLightColor: number;
}

export interface PlanetEnvironmentProfile {
  seed: number;
  family: PlanetFamily;
  isLandable: boolean;
  gravity: number;
  temperatureKelvin: number;
  surfacePressureAtm: number;
  atmosphere: AtmosphereProfile;
  terrain: TerrainProfile;
  palette: PaletteProfile;
  landmark: LandmarkFamily;
  biosignature: 'none' | 'microbial' | 'primitive-flora' | 'complex-ecosystem' | 'anomalous';
  oceanCoverage: number;
  cloudCoverage: number;
  hasRings: boolean;
  isOutlier: boolean;
  description: string;
  forceSentient?: boolean;
}

export class PlanetEnvironmentGenerator {
  public static generateProfile(
    seedInput: number | string,
    starClass: string = 'G',
    familyOverride?: PlanetFamily
  ): PlanetEnvironmentProfile {
    const seed = typeof seedInput === 'string' ? SeededRandom.hashString(seedInput) : seedInput;
    const rng = new SeededRandom(seed);

    // 1. Rarity / Outlier Determination (~22% exotic outlier, ~78% standard)
    const isOutlier = rng.chance(0.22);

    // 2. Select Planet Family
    const families: PlanetFamily[] = [
      'barren-moon',
      'cryogenic-ice',
      'desert-dune',
      'volcanic-basalt',
      'temperate-terrestrial',
      'oceanic-water',
      'toxic-chemical',
      'crystalline-mineral',
      'high-biosignature',
      'metallic-iron',
      'gas-giant',
    ];

    const outlierFamilies: PlanetFamily[] = [
      'crystalline-mineral',
      'high-biosignature',
      'toxic-chemical',
      'aurora-plasma',
      'fungal-mycelium',
      'shattered-shards',
      'chlorophyll-jungle',
      'radioactive-abyss',
    ];
    const family: PlanetFamily = familyOverride || (isOutlier
      ? rng.pick(outlierFamilies)
      : rng.pick(families));

    // All celestial worlds, including gas giants with aerostat cloud platforms, are landable/explorable
    const isLandable = true;

    // 3. Physical Parameters
    let temp = 288;
    let gravity = 9.8;
    let oceanCoverage = 0;
    let cloudCoverage = rng.range(0.2, 0.6);
    let biosig: PlanetEnvironmentProfile['biosignature'] = 'none';

    switch (family) {
      case 'barren-moon':
        temp = rng.rangeInt(140, 240);
        gravity = rng.range(1.6, 4.2);
        oceanCoverage = 0;
        cloudCoverage = 0;
        biosig = 'none';
        break;
      case 'cryogenic-ice':
        temp = rng.rangeInt(110, 230);
        gravity = rng.range(5.0, 11.5);
        oceanCoverage = rng.range(0.15, 0.4); // Frozen oceans / slush
        biosig = rng.chance(0.3) ? 'microbial' : 'none';
        break;
      case 'desert-dune':
        temp = rng.rangeInt(310, 375);
        gravity = rng.range(7.5, 12.0);
        oceanCoverage = rng.range(0.0, 0.08);
        cloudCoverage = rng.range(0.05, 0.25);
        biosig = rng.chance(0.4) ? 'microbial' : 'none';
        break;
      case 'volcanic-basalt':
        temp = rng.rangeInt(420, 690);
        gravity = rng.range(8.0, 14.5);
        oceanCoverage = rng.range(0.05, 0.18); // Lava basins
        biosig = 'none';
        break;
      case 'temperate-terrestrial':
        temp = rng.rangeInt(275, 305);
        gravity = rng.range(8.5, 11.0);
        oceanCoverage = rng.range(0.45, 0.72);
        biosig = rng.pick(['primitive-flora', 'complex-ecosystem']);
        break;
      case 'oceanic-water':
        temp = rng.rangeInt(282, 318);
        gravity = rng.range(7.8, 12.5);
        oceanCoverage = rng.range(0.78, 0.95);
        biosig = rng.pick(['microbial', 'primitive-flora']);
        break;
      case 'toxic-chemical':
        temp = rng.rangeInt(260, 390);
        gravity = rng.range(7.0, 13.0);
        oceanCoverage = rng.range(0.2, 0.5); // Acid / methane lakes
        cloudCoverage = rng.range(0.6, 0.95);
        biosig = 'anomalous';
        break;
      case 'crystalline-mineral':
        temp = rng.rangeInt(210, 310);
        gravity = rng.range(5.5, 10.5);
        oceanCoverage = rng.range(0.1, 0.35);
        biosig = rng.pick(['none', 'anomalous']);
        break;
      case 'high-biosignature':
        temp = rng.rangeInt(280, 310);
        gravity = rng.range(7.0, 10.2);
        oceanCoverage = rng.range(0.4, 0.65);
        cloudCoverage = rng.range(0.4, 0.7);
        biosig = 'complex-ecosystem';
        break;
      case 'metallic-iron':
        temp = rng.rangeInt(290, 480);
        gravity = rng.range(11.0, 16.5);
        oceanCoverage = 0.02;
        cloudCoverage = rng.range(0.1, 0.3);
        biosig = 'none';
        break;
      case 'gas-giant':
        temp = rng.rangeInt(110, 210);
        gravity = rng.range(18.0, 32.0);
        oceanCoverage = 0;
        cloudCoverage = 1.0;
        biosig = 'none';
        break;
      case 'aurora-plasma':
        temp = rng.rangeInt(220, 330);
        gravity = rng.range(6.5, 11.0);
        oceanCoverage = rng.range(0.15, 0.45); // Ionized liquid bays
        cloudCoverage = rng.range(0.5, 0.85);
        biosig = 'anomalous';
        break;
      case 'fungal-mycelium':
        temp = rng.rangeInt(270, 305);
        gravity = rng.range(8.0, 10.5);
        oceanCoverage = rng.range(0.35, 0.65); // Spore marshes
        cloudCoverage = rng.range(0.4, 0.75);
        biosig = 'complex-ecosystem';
        break;
      case 'shattered-shards':
        temp = rng.rangeInt(200, 290);
        gravity = rng.range(4.5, 8.5); // Gravitational anomaly
        oceanCoverage = rng.range(0.05, 0.25);
        cloudCoverage = rng.range(0.1, 0.4);
        biosig = 'anomalous';
        break;
      case 'chlorophyll-jungle':
        temp = rng.rangeInt(290, 325);
        gravity = rng.range(8.5, 12.0);
        oceanCoverage = rng.range(0.55, 0.80);
        cloudCoverage = rng.range(0.6, 0.9);
        biosig = 'complex-ecosystem';
        break;
      case 'radioactive-abyss':
        temp = rng.rangeInt(340, 520);
        gravity = rng.range(9.5, 15.0);
        oceanCoverage = rng.range(0.1, 0.3);
        cloudCoverage = rng.range(0.4, 0.7);
        biosig = 'anomalous';
        break;
    }

    // 4. Stellar Light Contribution
    const starLighting = this.deriveStarLight(starClass);

    // 5. Coherent Atmospheric Profile
    const atmosphere = this.deriveAtmosphere(family, rng);

    // 6. Terrain Morphology Profile
    const terrain = this.deriveTerrain(family, oceanCoverage, rng);

    // 7. Harmonious Visual Color Palette
    const palette = this.derivePalette(family, starLighting);

    // 8. Landmark Family
    const landmark = this.deriveLandmarks(family);

    // 9. Structured Description
    const description = this.generateSummary(family, temp, oceanCoverage, biosig);

    return {
      seed,
      family,
      isLandable,
      gravity: Math.round(gravity * 10) / 10,
      temperatureKelvin: temp,
      surfacePressureAtm: atmosphere.hasAtmosphere ? Math.round(atmosphere.density * 100) / 100 : 0,
      atmosphere,
      terrain,
      palette,
      landmark,
      biosignature: biosig,
      oceanCoverage,
      cloudCoverage,
      hasRings: family === 'gas-giant' ? rng.chance(0.7) : rng.chance(0.2),
      isOutlier,
      description,
    };
  }

  private static deriveStarLight(starClass: string): { sun: number; ambient: number } {
    switch (starClass) {
      case 'M': // Red dwarf: warm orange-crimson
        return { sun: 0xffa07a, ambient: 0x3d1a24 };
      case 'K': // Orange star: warm amber
        return { sun: 0xffd1a4, ambient: 0x2b1c30 };
      case 'G': // Sun-like: pale gold
        return { sun: 0xfffaed, ambient: 0x1a2236 };
      case 'F': // Bright white-yellow
        return { sun: 0xffffff, ambient: 0x202b40 };
      case 'A': // Cool crystalline white
        return { sun: 0xf8fafc, ambient: 0x1e293b };
      case 'B': // Deep icy blue
      case 'O':
        return { sun: 0xbae6fd, ambient: 0x172554 };
      default:
        return { sun: 0xfffaed, ambient: 0x1a2236 };
    }
  }

  private static deriveAtmosphere(family: PlanetFamily, rng: SeededRandom): AtmosphereProfile {
    switch (family) {
      case 'barren-moon':
        return {
          hasAtmosphere: false,
          density: 0,
          skyZenith: '#020308',
          skyHorizon: '#050710',
          fogColor: '#050710',
          fogDensity: 0.0006,
          particleType: 'none',
        };
      case 'cryogenic-ice':
        return {
          hasAtmosphere: true,
          density: 0.65,
          skyZenith: rng.pick(['#1e1b4b', '#172554', '#0f172a']),
          skyHorizon: rng.pick(['#c084fc', '#93c5fd', '#a5f3fc']),
          fogColor: '#bae6fd',
          fogDensity: 0.0028,
          particleType: 'snow',
          particleColor: '#ffffff',
        };
      case 'desert-dune':
        return {
          hasAtmosphere: true,
          density: 0.85,
          skyZenith: rng.pick(['#1e293b', '#312e81', '#18181b']),
          skyHorizon: rng.pick(['#fcd34d', '#fdba74', '#e9d5ff']),
          fogColor: '#fde68a',
          fogDensity: 0.0025,
          particleType: 'dust',
          particleColor: '#f59e0b',
        };
      case 'volcanic-basalt':
        return {
          hasAtmosphere: true,
          density: 1.4,
          skyZenith: '#0f0714',
          skyHorizon: rng.pick(['#dc2626', '#ea580c', '#7c2d12']),
          fogColor: '#7f1d1d',
          fogDensity: 0.0042,
          particleType: 'ash',
          particleColor: '#f97316',
        };
      case 'temperate-terrestrial':
        return {
          hasAtmosphere: true,
          density: 1.0,
          skyZenith: '#0284c7',
          skyHorizon: '#bae6fd',
          fogColor: '#e0f2fe',
          fogDensity: 0.0018,
          particleType: 'mist',
          particleColor: '#f8fafc',
        };
      case 'oceanic-water':
        return {
          hasAtmosphere: true,
          density: 1.15,
          skyZenith: '#0369a1',
          skyHorizon: '#67e8f9',
          fogColor: '#bae6fd',
          fogDensity: 0.0022,
          particleType: 'mist',
          particleColor: '#e0f2fe',
        };
      case 'toxic-chemical':
        return {
          hasAtmosphere: true,
          density: 1.8,
          skyZenith: '#14532d',
          skyHorizon: rng.pick(['#84cc16', '#eab308', '#06b6d4']),
          fogColor: '#65a30d',
          fogDensity: 0.0055,
          particleType: 'spores',
          particleColor: '#a3e635',
        };
      case 'crystalline-mineral':
        return {
          hasAtmosphere: true,
          density: 0.75,
          skyZenith: '#3b0764',
          skyHorizon: rng.pick(['#f472b6', '#c084fc', '#38bdf8']),
          fogColor: '#fbcfe8',
          fogDensity: 0.0020,
          particleType: 'none',
        };
      case 'high-biosignature':
        return {
          hasAtmosphere: true,
          density: 1.1,
          skyZenith: '#4c1d95',
          skyHorizon: '#2dd4bf',
          fogColor: '#5eead4',
          fogDensity: 0.0026,
          particleType: 'spores',
          particleColor: '#67e8f9',
        };
      case 'metallic-iron':
        return {
          hasAtmosphere: true,
          density: 0.9,
          skyZenith: '#1c1917',
          skyHorizon: rng.pick(['#b45309', '#78350f', '#ca8a04']),
          fogColor: '#d97706',
          fogDensity: 0.0032,
          particleType: 'dust',
          particleColor: '#d97706',
        };
      case 'aurora-plasma':
        return {
          hasAtmosphere: true,
          density: 1.45,
          skyZenith: '#1e1b4b',
          skyHorizon: rng.pick(['#06b6d4', '#c084fc', '#38bdf8']),
          fogColor: '#67e8f9',
          fogDensity: 0.0028,
          particleType: 'plasma_sparks',
          particleColor: '#38bdf8',
        };
      case 'fungal-mycelium':
        return {
          hasAtmosphere: true,
          density: 1.3,
          skyZenith: '#2e1065',
          skyHorizon: rng.pick(['#10b981', '#d946ef', '#065f46']),
          fogColor: '#059669',
          fogDensity: 0.0035,
          particleType: 'spores',
          particleColor: '#34d399',
        };
      case 'shattered-shards':
        return {
          hasAtmosphere: true,
          density: 0.72,
          skyZenith: '#09090b',
          skyHorizon: rng.pick(['#a855f7', '#38bdf8', '#c084fc']),
          fogColor: '#c084fc',
          fogDensity: 0.0016,
          particleType: 'none',
        };
      case 'chlorophyll-jungle':
        return {
          hasAtmosphere: true,
          density: 1.35,
          skyZenith: '#064e3b',
          skyHorizon: rng.pick(['#f59e0b', '#6ee7b7', '#10b981']),
          fogColor: '#a7f3d0',
          fogDensity: 0.0026,
          particleType: 'mist',
          particleColor: '#ecfdf5',
        };
      case 'radioactive-abyss':
        return {
          hasAtmosphere: true,
          density: 1.65,
          skyZenith: '#14532d',
          skyHorizon: rng.pick(['#eab308', '#84cc16', '#a3e635']),
          fogColor: '#a3e635',
          fogDensity: 0.0045,
          particleType: 'geiger_glow',
          particleColor: '#84cc16',
        };
      case 'gas-giant':
      default:
        return {
          hasAtmosphere: true,
          density: 2.2,
          skyZenith: '#1e1b4b',
          skyHorizon: '#818cf8',
          fogColor: '#6366f1',
          fogDensity: 0.006,
          particleType: 'none',
        };
    }
  }

  private static deriveTerrain(
    family: PlanetFamily,
    oceanCoverage: number,
    rng: SeededRandom
  ): TerrainProfile {
    const hasLiquid = oceanCoverage > 0.08 && family !== 'barren-moon';

    switch (family) {
      case 'barren-moon':
        return {
          morphology: 'craters',
          heightScale: rng.range(24, 38),
          roughness: 0.9,
          domainWarp: 0.3,
          seaLevel: 0,
          hasLiquid: false,
          liquidColor: '#000000',
          liquidSpecular: '#000000',
        };
      case 'cryogenic-ice':
        return {
          morphology: 'glacier_fissures',
          heightScale: rng.range(22, 34),
          roughness: 0.75,
          domainWarp: 0.6,
          seaLevel: hasLiquid ? 6.0 : 0,
          hasLiquid,
          liquidColor: '#0284c7', // Slush ocean
          liquidSpecular: '#38bdf8',
        };
      case 'desert-dune':
        return {
          morphology: 'dunes',
          heightScale: rng.range(18, 30),
          roughness: 0.45,
          domainWarp: 0.85,
          seaLevel: hasLiquid ? 4.0 : 0,
          hasLiquid,
          liquidColor: '#78350f', // Mineral brine
          liquidSpecular: '#f59e0b',
        };
      case 'volcanic-basalt':
        return {
          morphology: 'volcanic_rift',
          heightScale: rng.range(28, 44),
          roughness: 0.85,
          domainWarp: 0.5,
          seaLevel: hasLiquid ? 5.5 : 0,
          hasLiquid,
          liquidColor: '#dc2626', // Molten lava ocean
          liquidSpecular: '#f97316',
        };
      case 'temperate-terrestrial':
        return {
          morphology: 'rolling_plains',
          heightScale: rng.range(20, 32),
          roughness: 0.65,
          domainWarp: 0.5,
          seaLevel: 6.5,
          hasLiquid: true,
          liquidColor: '#1d4ed8', // Hydrosphere blue
          liquidSpecular: '#93c5fd',
        };
      case 'oceanic-water':
        return {
          morphology: 'archipelago_shallows',
          heightScale: rng.range(14, 24),
          roughness: 0.55,
          domainWarp: 0.7,
          seaLevel: 9.0,
          hasLiquid: true,
          liquidColor: '#0284c7', // Turquoise tropical waters
          liquidSpecular: '#67e8f9',
        };
      case 'toxic-chemical':
        return {
          morphology: 'corrosive_badlands',
          heightScale: rng.range(22, 36),
          roughness: 0.95,
          domainWarp: 0.75,
          seaLevel: hasLiquid ? 5.0 : 0,
          hasLiquid,
          liquidColor: '#65a30d', // Acid green liquid
          liquidSpecular: '#bef264',
        };
      case 'crystalline-mineral':
        return {
          morphology: 'faceted_crystals',
          heightScale: rng.range(26, 42),
          roughness: 0.7,
          domainWarp: 0.4,
          seaLevel: hasLiquid ? 5.0 : 0,
          hasLiquid,
          liquidColor: '#701a75', // Amethyst mineral solvent
          liquidSpecular: '#e879f9',
        };
      case 'high-biosignature':
        return {
          morphology: 'terraced_biomes',
          heightScale: rng.range(20, 32),
          roughness: 0.6,
          domainWarp: 0.65,
          seaLevel: 6.0,
          hasLiquid: true,
          liquidColor: '#0f766e', // Bioluminescent teal bay
          liquidSpecular: '#2dd4bf',
        };
      case 'metallic-iron':
        return {
          morphology: 'sharp_ridges',
          heightScale: rng.range(30, 46),
          roughness: 0.9,
          domainWarp: 0.35,
          seaLevel: 0,
          hasLiquid: false,
          liquidColor: '#78350f',
          liquidSpecular: '#b45309',
        };
      case 'aurora-plasma':
        return {
          morphology: 'plasma_fractures',
          heightScale: rng.range(28, 44),
          roughness: 0.8,
          domainWarp: 0.65,
          seaLevel: 5.5,
          hasLiquid: true,
          liquidColor: '#0891b2', // Ionized neon bay
          liquidSpecular: '#67e8f9',
        };
      case 'fungal-mycelium':
        return {
          morphology: 'fungal_canopy',
          heightScale: rng.range(22, 36),
          roughness: 0.62,
          domainWarp: 0.75,
          seaLevel: 6.0,
          hasLiquid: true,
          liquidColor: '#065f46', // Bioluminescent spore marsh
          liquidSpecular: '#34d399',
        };
      case 'shattered-shards':
        return {
          morphology: 'shattered_monoliths',
          heightScale: rng.range(32, 50),
          roughness: 0.9,
          domainWarp: 0.85,
          seaLevel: hasLiquid ? 4.5 : 0,
          hasLiquid,
          liquidColor: '#4c1d95', // Heavy metallic rift pool
          liquidSpecular: '#c084fc',
        };
      case 'chlorophyll-jungle':
        return {
          morphology: 'primordial_jungle',
          heightScale: rng.range(22, 36),
          roughness: 0.65,
          domainWarp: 0.6,
          seaLevel: 7.0,
          hasLiquid: true,
          liquidColor: '#047857', // Primordial swamp liquid
          liquidSpecular: '#a7f3d0',
        };
      case 'radioactive-abyss':
        return {
          morphology: 'neon_badlands',
          heightScale: rng.range(30, 48),
          roughness: 0.95,
          domainWarp: 0.5,
          seaLevel: hasLiquid ? 4.5 : 0,
          hasLiquid,
          liquidColor: '#4d7c0f', // Irradiated heavy brine
          liquidSpecular: '#bef264',
        };
      case 'gas-giant':
      default:
        return {
          morphology: 'rolling_plains',
          heightScale: 0,
          roughness: 0,
          domainWarp: 0,
          seaLevel: 0,
          hasLiquid: false,
          liquidColor: '#000000',
          liquidSpecular: '#000000',
        };
    }
  }

  private static derivePalette(
    family: PlanetFamily,
    starLight: { sun: number; ambient: number }
  ): PaletteProfile {
    switch (family) {
      case 'barren-moon':
        return {
          surfaceLowland: '#334155', // Dark crater regolith
          surfaceMidland: '#64748b', // Moon dust
          surfaceHighland: '#94a3b8', // Rim rock
          surfacePeak: '#cbd5e1',     // High ejecta
          accentMineral: '#e2e8f0',
          atmosphereGlow: '#475569',
          cloudColor: '#cbd5e1',
          sunLightColor: starLight.sun,
          ambientLightColor: 0x1e293b,
        };
      case 'cryogenic-ice':
        return {
          surfaceLowland: '#0284c7', // Frozen azure
          surfaceMidland: '#38bdf8', // Glacial shelf
          surfaceHighland: '#bae6fd', // Ice ridge
          surfacePeak: '#ffffff',     // Cryo frost
          accentMineral: '#c084fc',   // Violet crystal seam
          atmosphereGlow: '#a5f3fc',
          cloudColor: '#ffffff',
          sunLightColor: starLight.sun,
          ambientLightColor: 0x1e1b4b,
        };
      case 'desert-dune':
        return {
          surfaceLowland: '#b45309', // Canyon shadow
          surfaceMidland: '#d97706', // Golden sand
          surfaceHighland: '#f59e0b', // Sunlit dunes
          surfacePeak: '#fef3c7',     // Bleached sandstone
          accentMineral: '#ec4899',   // Rare rose quartz
          atmosphereGlow: '#fcd34d',
          cloudColor: '#fef3c7',
          sunLightColor: starLight.sun,
          ambientLightColor: 0x292524,
        };
      case 'volcanic-basalt':
        return {
          surfaceLowland: '#18181b', // Obsidian fissure
          surfaceMidland: '#27272a', // Basalt plain
          surfaceHighland: '#7f1d1d', // Pyroclastic rim
          surfacePeak: '#ea580c',     // Glowing volcanic crest
          accentMineral: '#f97316',   // Molten seam
          atmosphereGlow: '#dc2626',
          cloudColor: '#57534e',
          sunLightColor: starLight.sun,
          ambientLightColor: 0x3d0c02,
        };
      case 'temperate-terrestrial':
        return {
          surfaceLowland: '#1e3a8a', // Deep ocean margin
          surfaceMidland: '#15803d', // Verdant valley
          surfaceHighland: '#713f12', // Mountain timberline
          surfacePeak: '#f8fafc',     // Snow peak
          accentMineral: '#38bdf8',
          atmosphereGlow: '#38bdf8',
          cloudColor: '#ffffff',
          sunLightColor: starLight.sun,
          ambientLightColor: starLight.ambient,
        };
      case 'oceanic-water':
        return {
          surfaceLowland: '#0369a1', // Deep trench
          surfaceMidland: '#0284c7', // Tropical shallows
          surfaceHighland: '#0d9488', // Island reef
          surfacePeak: '#fef08a',     // Coral beach sand
          accentMineral: '#67e8f9',
          atmosphereGlow: '#38bdf8',
          cloudColor: '#f0fdfa',
          sunLightColor: starLight.sun,
          ambientLightColor: 0x082f49,
        };
      case 'toxic-chemical':
        return {
          surfaceLowland: '#3f6212', // Sulfur basin
          surfaceMidland: '#65a30d', // Toxic lichen rock
          surfaceHighland: '#84cc16', // Vitriol ridge
          surfacePeak: '#facc15',     // Sulfur crust
          accentMineral: '#06b6d4',
          atmosphereGlow: '#a3e635',
          cloudColor: '#d9f99d',
          sunLightColor: starLight.sun,
          ambientLightColor: 0x14532d,
        };
      case 'crystalline-mineral':
        return {
          surfaceLowland: '#581c87', // Deep amethyst lowland
          surfaceMidland: '#7e22ce', // Purple crystal plateau
          surfaceHighland: '#c084fc', // Faceted spire
          surfacePeak: '#f472b6',     // Rose quartz tip
          accentMineral: '#38bdf8',
          atmosphereGlow: '#e879f9',
          cloudColor: '#fae8ff',
          sunLightColor: starLight.sun,
          ambientLightColor: 0x3b0764,
        };
      case 'high-biosignature':
        return {
          surfaceLowland: '#115e59', // Deep bioluminescent marsh
          surfaceMidland: '#6b21a8', // Velvet violet ground
          surfaceHighland: '#059669', // Luminescent canopy
          surfacePeak: '#22d3ee',     // Phosphor ridge
          accentMineral: '#f43f5e',
          atmosphereGlow: '#2dd4bf',
          cloudColor: '#ccfbf1',
          sunLightColor: starLight.sun,
          ambientLightColor: 0x3b0764,
        };
      case 'metallic-iron':
        return {
          surfaceLowland: '#451a03', // Oxidized rust sand
          surfaceMidland: '#78350f', // Weathered hematite
          surfaceHighland: '#92400e', // Copper ridge
          surfacePeak: '#d97706',     // Raw metallic vein
          accentMineral: '#fbbf24',
          atmosphereGlow: '#b45309',
          cloudColor: '#d6d3d1',
          sunLightColor: starLight.sun,
          ambientLightColor: 0x292524,
        };
      case 'aurora-plasma':
        return {
          surfaceLowland: '#0f172a', // Deep cosmic basalt
          surfaceMidland: '#3b0764', // Violet plasma shelf
          surfaceHighland: '#06b6d4', // Ionized teal ridge
          surfacePeak: '#a855f7',     // Aurora flare peak
          accentMineral: '#38bdf8',   // Electric arc seam
          atmosphereGlow: '#06b6d4',
          cloudColor: '#c084fc',
          ringColor: '#67e8f9',
          sunLightColor: 0xc084fc,
          ambientLightColor: 0x1e1b4b,
        };
      case 'fungal-mycelium':
        return {
          surfaceLowland: '#064e3b', // Deep spore bog
          surfaceMidland: '#701a75', // Velvet mycelial crust
          surfaceHighland: '#059669', // Luminescent fungal tier
          surfacePeak: '#d946ef',     // Glowing cap rim
          accentMineral: '#34d399',   // Phosphor vein
          atmosphereGlow: '#10b981',
          cloudColor: '#d8b4fe',
          sunLightColor: starLight.sun,
          ambientLightColor: 0x2e1065,
        };
      case 'shattered-shards':
        return {
          surfaceLowland: '#18181b', // Void fissure floor
          surfaceMidland: '#27272a', // Shattered tectonic slab
          surfaceHighland: '#7e22ce', // Levitating amethyst shelf
          surfacePeak: '#38bdf8',     // Crystalline needle tip
          accentMineral: '#f43f5e',   // Harmonic anomaly ruby
          atmosphereGlow: '#a855f7',
          cloudColor: '#e0e7ff',
          ringColor: '#a855f7',
          sunLightColor: starLight.sun,
          ambientLightColor: 0x09090b,
        };
      case 'chlorophyll-jungle':
        return {
          surfaceLowland: '#064e3b', // Primordial swamp mud
          surfaceMidland: '#15803d', // Dense emerald canopy
          surfaceHighland: '#166534', // Ancient moss cliffs
          surfacePeak: '#facc15',     // Sunlit canopy flower
          accentMineral: '#22c55e',   // Glowing sap node
          atmosphereGlow: '#4ade80',
          cloudColor: '#f0fdf4',
          sunLightColor: 0xfef08a,
          ambientLightColor: 0x064e3b,
        };
      case 'radioactive-abyss':
        return {
          surfaceLowland: '#1c1917', // Pitchblende slag
          surfaceMidland: '#3f6212', // Irradiated uranium crust
          surfaceHighland: '#65a30d', // Glowing neon ridge
          surfacePeak: '#84cc16',     // Supercritical crystal spire
          accentMineral: '#facc15',   // Amber radiation vein
          atmosphereGlow: '#a3e635',
          cloudColor: '#bef264',
          sunLightColor: 0xd9f99d,
          ambientLightColor: 0x14532d,
        };
      case 'gas-giant':
      default:
        return {
          surfaceLowland: '#312e81',
          surfaceMidland: '#4f46e5',
          surfaceHighland: '#7c3aed',
          surfacePeak: '#a855f7',
          accentMineral: '#38bdf8',
          atmosphereGlow: '#818cf8',
          cloudColor: '#c4b5fd',
          ringColor: '#e0e7ff',
          sunLightColor: starLight.sun,
          ambientLightColor: 0x1e1b4b,
        };
    }
  }

  private static deriveLandmarks(family: PlanetFamily): LandmarkFamily {
    switch (family) {
      case 'barren-moon':
        return 'ejecta_boulders';
      case 'cryogenic-ice':
        return 'ice_shards';
      case 'desert-dune':
        return 'stone_arches';
      case 'volcanic-basalt':
        return 'basalt_columns';
      case 'temperate-terrestrial':
        return 'alien_flora';
      case 'oceanic-water':
        return 'coastal_monoliths';
      case 'toxic-chemical':
        return 'mineral_chimneys';
      case 'crystalline-mineral':
        return 'crystalline_clusters';
      case 'high-biosignature':
        return 'spore_spires';
      case 'metallic-iron':
        return 'metallic_spikes';
      case 'aurora-plasma':
        return 'plasma_spires';
      case 'fungal-mycelium':
        return 'giant_spore_caps';
      case 'shattered-shards':
        return 'levitating_monoliths';
      case 'chlorophyll-jungle':
        return 'ancient_fossil_ribs';
      case 'radioactive-abyss':
        return 'prismatic_geodes';
      default:
        return 'ejecta_boulders';
    }
  }

  private static generateSummary(
    family: PlanetFamily,
    temp: number,
    ocean: number,
    bio: string
  ): string {
    switch (family) {
      case 'barren-moon':
        return `Airless silicate moon scarred by ancient celestial impacts. Surface temp ${temp}K.`;
      case 'cryogenic-ice':
        return `Sub-zero cryogenic world fractured by tectonic ice fissures and cryo-geysers.`;
      case 'desert-dune':
        return `High-temperature arid world sculpted by fierce planetary windstorms and vast dune seas.`;
      case 'volcanic-basalt':
        return `Tectonically hyperactive world with active fissures and molten basalt plains. Temp ${temp}K.`;
      case 'temperate-terrestrial':
        return `Equilibrated terrestrial world with ${(ocean * 100).toFixed(0)}% hydrosphere and ${bio} biosignatures.`;
      case 'oceanic-water':
        return `Pelagic world covered in vast global oceans with scattered volcanic and coral archipelagos.`;
      case 'toxic-chemical':
        return `Corrosive environment with dense caustic atmosphere and volatile hydrocarbon lakes.`;
      case 'crystalline-mineral':
        return `Geologically exotic world boasting colossal faceted quartz plateaus and harmonic crystal beds.`;
      case 'high-biosignature':
        return `Thriving exotic biosphere featuring bioluminescent vegetation and dense spore canopies.`;
      case 'metallic-iron':
        return `Dense metallic planet rich in oxidized iron plains, copper needles, and magnetic anomalies.`;
      case 'gas-giant':
        return `Massive turbulent jovian planet with deep atmospheric convection belts and ice ring system.`;
      case 'aurora-plasma':
        return `Hyper-electrified planet enveloped in shimmering aurora curtains and charged ionic dunes.`;
      case 'fungal-mycelium':
        return `Ancient mycelial world blanketed by colossal bioluminescent fungi and undulating spore valleys.`;
      case 'shattered-shards':
        return `Gravitationally anomalous shattered world with massive levitating monoliths and crystal abysses.`;
      case 'chlorophyll-jungle':
        return `Dense primordial alien rainforest with gargantuan spiral canopies and misty swamp rivers.`;
      case 'radioactive-abyss':
        return `Supercritical radioactive world bathed in fluorescent neon mist and glowing pitchblende crystals.`;
    }
  }
}
