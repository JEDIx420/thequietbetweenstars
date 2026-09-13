import { SeededRandom } from '../universe/SeededRandom';
import { PlanetEnvironmentGenerator } from '../planets/PlanetEnvironmentProfile';
import type {
  StarSystemDescriptor,
  StarDescriptor,
  PlanetDescriptor,
} from './PlanetDescriptor';

const GREEK_PREFIXES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Sigma', 'Omicron'];
const SYSTEM_NAMES = ['Aurelia', 'Solara', 'Cygnus', 'Vespera', 'Kaelum', 'Zephyria', 'Elysium', 'Nocturna', 'Nirvana', 'Orionis', 'Zenith', 'Astraea', 'Hyperion', 'Caelestis'];
const PLANET_SYLLABLES_1 = ['Au', 'Ze', 'Kae', 'Lu', 'Va', 'Syr', 'O', 'Tha', 'My', 'Vel', 'Cri', 'Xan', 'Pry'];
const PLANET_SYLLABLES_2 = ['re', 'phy', 'lum', 'na', 'nor', 'ra', 'mi', 'lon', 'dis', 'tis', 'da', 'vo', 'sen'];
const PLANET_SYLLABLES_3 = ['lia', 'ros', 'ia', 'tis', 'nus', 'dani', 'cron', 'va', 'ter', 'ion', 'ra', 'thea', 'gon'];

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

    // Anti-repetition: track used families in this system to guarantee visual contrast
    const usedFamilies = new Set<string>();

    for (let i = 0; i < numPlanets; i++) {
      let planet = this.generatePlanet(rng, name, i + 1, star.spectralClass);
      // If family was already used, re-roll once with seed offset to maximize contrast
      if (usedFamilies.has(planet.profile.family)) {
        planet = this.generatePlanet(new SeededRandom(planet.seed + 104729), name, i + 1, star.spectralClass);
      }
      usedFamilies.add(planet.profile.family);
      planets.push(planet);
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

  public static generatePlanet(
    rng: SeededRandom,
    sysName: string,
    index: number,
    starClass: string = 'G'
  ): PlanetDescriptor {
    const pSeed = rng.rangeInt(1000, 999999);
    const pRng = new SeededRandom(pSeed);

    const s1 = pRng.pick(PLANET_SYLLABLES_1);
    const s2 = pRng.pick(PLANET_SYLLABLES_2);
    const s3 = pRng.pick(PLANET_SYLLABLES_3);
    const letter = ['b', 'c', 'd', 'e', 'f'][index - 1] || String(index);
    const pName = `${sysName} ${s1}${s2}${s3} ${letter}`;

    // Generate full coherent environment profile
    const profile = PlanetEnvironmentGenerator.generateProfile(pSeed, starClass);

    const radius = profile.family === 'gas-giant'
      ? pRng.range(180, 260)
      : profile.family === 'barren-moon'
      ? pRng.range(40, 75)
      : pRng.range(120, 175);

    const moonsCount = profile.family === 'gas-giant'
      ? pRng.rangeInt(2, 6)
      : profile.family === 'barren-moon'
      ? 0
      : pRng.rangeInt(0, 2);

    return {
      id: `p-${pName.toLowerCase().replace(/\s+/g, '-')}`,
      seed: pSeed,
      name: pName,
      type: profile.family,
      radius,
      gravity: profile.gravity,
      hasAtmosphere: profile.atmosphere.hasAtmosphere,
      atmosphereDensity: profile.atmosphere.density,
      temperatureKelvin: profile.temperatureKelvin,
      surfacePressureAtm: profile.surfacePressureAtm,
      oceanCoverage: profile.oceanCoverage,
      cloudCoverage: profile.cloudCoverage,
      biosignature: profile.biosignature,
      hasRings: profile.hasRings,
      moonsCount,
      palette: {
        primary: profile.palette.surfaceMidland,
        secondary: profile.palette.surfaceHighland,
        ocean: profile.terrain.hasLiquid ? profile.palette.surfaceLowland : undefined,
        atmosphereGlow: profile.palette.atmosphereGlow,
        cloudColor: profile.palette.cloudColor,
        ringColor: profile.palette.ringColor,
      },
      shortDescription: profile.description,
      isLandable: profile.isLandable,
      profile,
    };
  }
}
