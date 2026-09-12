import { SeededRandom } from '../universe/SeededRandom';
import type {
  StarSystemDescriptor,
  StarDescriptor,
  PlanetDescriptor,
  PlanetType,
  PlanetPalette,
} from './PlanetDescriptor';

const GREEK_PREFIXES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Sigma', 'Omicron'];
const SYSTEM_NAMES = ['Aurelia', 'Solara', 'Cygnus', 'Vespera', 'Kaelum', 'Zephyria', 'Elysium', 'Nocturna', 'Nirvana', 'Orionis'];
const PLANET_SYLLABLES_1 = ['Au', 'Ze', 'Kae', 'Lu', 'Va', 'Syr', 'O', 'Tha', 'My', 'Vel'];
const PLANET_SYLLABLES_2 = ['re', 'phy', 'lum', 'na', 'nor', 'ra', 'mi', 'lon', 'dis', 'tis'];
const PLANET_SYLLABLES_3 = ['lia', 'ros', 'ia', 'tis', 'nus', 'dani', 'cron', 'va', 'ter', 'ion'];

export class StarSystemGenerator {
  public static generateSystem(universeSeed: string | number, sx: number, sy: number, sz: number): StarSystemDescriptor {
    const sysSeed = SeededRandom.hashCoords(universeSeed, sx, sy, sz);
    const rng = new SeededRandom(sysSeed);

    const baseName = rng.pick(SYSTEM_NAMES);
    const prefix = rng.chance(0.4) ? rng.pick(GREEK_PREFIXES) + ' ' : '';
    const name = `${prefix}${baseName}`;
    const id = `sys-${sx}_${sy}_${sz}`;

    const star = this.generateStar(rng, name);
    const numPlanets = rng.rangeInt(2, 5);
    const planets: PlanetDescriptor[] = [];

    for (let i = 0; i < numPlanets; i++) {
      planets.push(this.generatePlanet(rng, name, i + 1));
    }

    return {
      id,
      seed: sysSeed,
      name,
      sectorX: sx,
      sectorY: sy,
      sectorZ: sz,
      star,
      planets,
    };
  }

  private static generateStar(rng: SeededRandom, sysName: string): StarDescriptor {
    const spectral = rng.pick(['G', 'K', 'M', 'F', 'A', 'B'] as const);

    const spectralMap: Record<string, { light: number; corona: number; temp: number; radius: number }> = {
      M: { light: 0xffa07a, corona: 0xff4500, temp: 3100, radius: 110 },
      K: { light: 0xffd1a4, corona: 0xff8c00, temp: 4400, radius: 125 },
      G: { light: 0xfff3d6, corona: 0xf59e0b, temp: 5778, radius: 140 }, // Sun-like
      F: { light: 0xfffaed, corona: 0xfbbf24, temp: 7200, radius: 155 },
      A: { light: 0xf8fafc, corona: 0x38bdf8, temp: 9500, radius: 170 },
      B: { light: 0xbae6fd, corona: 0x2563eb, temp: 15000, radius: 185 },
    };

    const cfg = spectralMap[spectral];

    return {
      id: `star-${sysName.toLowerCase().replace(/\s+/g, '-')}`,
      name: `${sysName} Prime`,
      spectralClass: spectral,
      radius: cfg.radius,
      lightColor: cfg.light,
      temperature: cfg.temp,
      coronaColor: cfg.corona,
    };
  }

  private static generatePlanet(rng: SeededRandom, sysName: string, index: number): PlanetDescriptor {
    const pSeed = rng.rangeInt(1000, 999999);
    const pRng = new SeededRandom(pSeed);

    const s1 = pRng.pick(PLANET_SYLLABLES_1);
    const s2 = pRng.pick(PLANET_SYLLABLES_2);
    const s3 = pRng.pick(PLANET_SYLLABLES_3);
    const letter = ['b', 'c', 'd', 'e', 'f'][index - 1] || String(index);
    const pName = `${sysName} ${s1}${s2}${s3} ${letter}`;

    const types: PlanetType[] = [
      'terrestrial-temperate',
      'terrestrial-ocean',
      'terrestrial-desert',
      'terrestrial-ice',
      'volcanic',
      'gas-giant',
      'barren-moon',
      'exotic',
    ];

    const type = pRng.pick(types);
    const radius = type === 'gas-giant' ? pRng.range(180, 260) : pRng.range(120, 175);
    const isLandable = type !== 'gas-giant';

    const palette = this.createPalette(type);
    const hasRings = type === 'gas-giant' ? pRng.chance(0.65) : pRng.chance(0.15);
    const moonsCount = type === 'gas-giant' ? pRng.rangeInt(2, 6) : pRng.rangeInt(0, 2);

    let oceanCoverage = 0;
    let cloudCoverage = pRng.range(0.2, 0.7);
    let temp = 280;
    let biosig: PlanetDescriptor['biosignature'] = 'none';

    switch (type) {
      case 'terrestrial-temperate':
        oceanCoverage = pRng.range(0.45, 0.75);
        temp = pRng.rangeInt(275, 305);
        biosig = pRng.pick(['primitive-flora', 'complex-ecosystem']);
        break;
      case 'terrestrial-ocean':
        oceanCoverage = pRng.range(0.8, 0.98);
        temp = pRng.rangeInt(280, 315);
        biosig = pRng.pick(['microbial', 'primitive-flora']);
        break;
      case 'terrestrial-desert':
        oceanCoverage = pRng.range(0.0, 0.1);
        temp = pRng.rangeInt(310, 360);
        biosig = pRng.pick(['none', 'microbial']);
        cloudCoverage = pRng.range(0.05, 0.25);
        break;
      case 'terrestrial-ice':
        oceanCoverage = 0.85;
        temp = pRng.rangeInt(180, 250);
        biosig = pRng.pick(['none', 'microbial']);
        break;
      case 'volcanic':
        oceanCoverage = 0.05;
        temp = pRng.rangeInt(420, 680);
        biosig = 'none';
        break;
      case 'gas-giant':
        oceanCoverage = 0;
        cloudCoverage = 1.0;
        temp = pRng.rangeInt(120, 210);
        biosig = 'none';
        break;
      case 'exotic':
        oceanCoverage = pRng.range(0.3, 0.6);
        temp = pRng.rangeInt(250, 320);
        biosig = 'anomalous';
        break;
      default:
        oceanCoverage = 0;
        biosig = 'none';
        break;
    }

    const shortDesc = this.createShortDesc(type, oceanCoverage, biosig);

    return {
      id: `p-${pName.toLowerCase().replace(/\s+/g, '-')}`,
      seed: pSeed,
      name: pName,
      type,
      radius,
      gravity: Math.round(pRng.range(6.5, 14.2) * 10) / 10,
      hasAtmosphere: type !== 'barren-moon',
      atmosphereDensity: type === 'barren-moon' ? 0 : pRng.range(0.6, 1.4),
      temperatureKelvin: temp,
      surfacePressureAtm: type === 'barren-moon' ? 0 : Math.round(pRng.range(0.4, 2.1) * 100) / 100,
      oceanCoverage,
      cloudCoverage,
      biosignature: biosig,
      hasRings,
      moonsCount,
      palette,
      shortDescription: shortDesc,
      isLandable,
    };
  }

  private static createPalette(type: PlanetType): PlanetPalette {
    switch (type) {
      case 'terrestrial-temperate':
        return {
          primary: '#2e7d32', // Verdant green
          secondary: '#795548', // Continental brown
          ocean: '#1565c0', // Deep ocean blue
          atmosphereGlow: '#38bdf8', // Cyan horizon
          cloudColor: '#ffffff',
        };
      case 'terrestrial-ocean':
        return {
          primary: '#0284c7',
          secondary: '#0369a1',
          ocean: '#0c4a6e',
          atmosphereGlow: '#67e8f9',
          cloudColor: '#e0f2fe',
        };
      case 'terrestrial-desert':
        return {
          primary: '#d97706', // Amber sand
          secondary: '#b45309', // Red rock
          ocean: '#78350f',
          atmosphereGlow: '#fcd34d',
          cloudColor: '#fef3c7',
        };
      case 'terrestrial-ice':
        return {
          primary: '#e0f2fe', // Glacial white
          secondary: '#bae6fd', // Ice blue
          ocean: '#0284c7',
          atmosphereGlow: '#a5f3fc',
          cloudColor: '#ffffff',
        };
      case 'volcanic':
        return {
          primary: '#1c1917', // Obsidian basalt
          secondary: '#dc2626', // Molten lava
          atmosphereGlow: '#ea580c',
          cloudColor: '#78716c',
        };
      case 'gas-giant':
        return {
          primary: '#6366f1', // Indigo storm band
          secondary: '#a855f7', // Violet swirl
          atmosphereGlow: '#818cf8',
          cloudColor: '#c084fc',
          ringColor: '#c4b5fd',
        };
      case 'exotic':
        return {
          primary: '#8b5cf6', // Mystic purple
          secondary: '#06b6d4', // Bioluminescent teal
          ocean: '#312e81',
          atmosphereGlow: '#c084fc',
          cloudColor: '#fae8ff',
        };
      case 'barren-moon':
      default:
        return {
          primary: '#64748b', // Slate crater
          secondary: '#94a3b8', // Regolith dust
          atmosphereGlow: '#334155',
          cloudColor: '#cbd5e1',
        };
    }
  }

  private static createShortDesc(type: PlanetType, ocean: number, bio: string): string {
    if (type === 'gas-giant') return 'Turbulent gas giant with dense atmospheric storm belts and ring system.';
    if (type === 'volcanic') return 'Active tectonic world with widespread volcanic rift valleys and magma oceans.';
    if (type === 'terrestrial-ice') return 'Glacial cryo-world shrouded in thick permafrost sheets and sub-ice oceans.';
    if (type === 'terrestrial-desert') return 'Arid expanse characterized by sweeping dune seas and ancient dry canyons.';
    if (type === 'terrestrial-ocean') return 'Water world dominated by global oceans with scattered volcanic atolls.';
    if (type === 'exotic') return 'Unusual planetary body emitting anomalous harmonic frequencies.';
    if (type === 'barren-moon') return 'Tidally locked vacuum body scarred by ancient celestial impacts.';
    return `Balanced terrestrial world with ${(ocean * 100).toFixed(0)}% hydrosphere and ${bio} biosignatures.`;
  }
}
