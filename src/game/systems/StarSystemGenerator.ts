import { SeededRandom } from '../universe/SeededRandom';
import { PlanetEnvironmentGenerator } from '../planets/PlanetEnvironmentProfile';
import { SystemPopulationGenerator } from '../population/SystemPopulationGenerator';
import type {
  StarSystemDescriptor,
  StarDescriptor,
  PlanetDescriptor,
  SpaceAnomalyDescriptor,
  SpaceAnomalyType,
  ResonanceSignature,
} from './PlanetDescriptor';
import type { StarSystemSummary } from './StarSystemSummary';

const GREEK_PREFIXES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Sigma', 'Omicron'];
const SYSTEM_NAMES = ['Aurelia', 'Solara', 'Cygnus', 'Vespera', 'Kaelum', 'Zephyria', 'Elysium', 'Nocturna', 'Nirvana', 'Orionis', 'Zenith', 'Astraea', 'Hyperion', 'Caelestis'];
const PLANET_SYLLABLES_1 = ['Au', 'Ze', 'Kae', 'Lu', 'Va', 'Syr', 'O', 'Tha', 'My', 'Vel', 'Cri', 'Xan', 'Pry'];
const PLANET_SYLLABLES_2 = ['re', 'phy', 'lum', 'na', 'nor', 'ra', 'mi', 'lon', 'dis', 'tis', 'da', 'vo', 'sen'];
const PLANET_SYLLABLES_3 = ['lia', 'ros', 'ia', 'tis', 'nus', 'dani', 'cron', 'va', 'ter', 'ion', 'ra', 'thea', 'gon'];

export class StarSystemGenerator {
  public static generateSystemSummary(universeSeed: string | number, sx: number, sy: number, sz: number): StarSystemSummary {
    const sysSeed = SeededRandom.hashCoords(universeSeed, sx, sy, sz);
    const rng = new SeededRandom(sysSeed);

    const baseName = rng.pick(SYSTEM_NAMES);
    const prefix = rng.chance(0.4) ? rng.pick(GREEK_PREFIXES) + ' ' : '';
    const name = `${prefix}${baseName}`;
    const id = `sys-${sx}_${sy}_${sz}`;

    const isOrigin = sx === 0 && sy === 0 && sz === 0;
    const star = this.generateStar(rng, isOrigin ? 'Solara' : name);

    let numPlanets: number;
    if (isOrigin) {
      numPlanets = 2;
    } else {
      const roll = rng.next();
      if (roll < 0.08) {
        numPlanets = 0;
      } else if (roll < 0.20) {
        numPlanets = 1;
      } else if (roll < 0.75) {
        numPlanets = rng.rangeInt(2, 5);
      } else if (roll < 0.92) {
        numPlanets = rng.rangeInt(6, 7);
      } else {
        numPlanets = 8;
      }
    }

    const isStartingNeighbor = sx === 0 && sy === 1 && sz === 0;
    if (isStartingNeighbor && numPlanets === 0) {
      numPlanets = 1;
    }

    const hasAnomaly = rng.chance(0.4) || isOrigin;

    const pop = SystemPopulationGenerator.generatePopulation({
      id,
      seed: sysSeed,
      name: isOrigin ? 'Solara' : name,
      sectorX: sx,
      sectorY: sy,
      sectorZ: sz,
      star,
      planets: [],
      anomalies: [],
    });

    return {
      id,
      seed: sysSeed,
      name: isOrigin ? 'Solara' : name,
      sectorX: sx,
      sectorY: sy,
      sectorZ: sz,
      star,
      planetCount: numPlanets,
      hasAnomalies: hasAnomaly,
      estimatedStations: pop.stations.length,
      estimatedVessels: pop.vessels.length,
    };
  }
  public static generateSystem(universeSeed: string | number, sx: number, sy: number, sz: number): StarSystemDescriptor {
    const sysSeed = SeededRandom.hashCoords(universeSeed, sx, sy, sz);
    const rng = new SeededRandom(sysSeed);

    const baseName = rng.pick(SYSTEM_NAMES);
    const prefix = rng.chance(0.4) ? rng.pick(GREEK_PREFIXES) + ' ' : '';
    const name = `${prefix}${baseName}`;
    const id = `sys-${sx}_${sy}_${sz}`;

    // Origin sector (0,0,0) is Aurelia Prime system with 2 confirmed worlds
    const isOrigin = sx === 0 && sy === 0 && sz === 0;
    const star = this.generateStar(rng, isOrigin ? 'Solara' : name);

    // Expand planet distribution: 0 to 8 planets, biased toward 2 to 5
    let numPlanets: number;
    if (isOrigin) {
      numPlanets = 2;
    } else {
      const roll = rng.next();
      if (roll < 0.08) {
        numPlanets = 0; // Lonely star / empty stellar system
      } else if (roll < 0.20) {
        numPlanets = 1; // Lone sentinel world
      } else if (roll < 0.75) {
        numPlanets = rng.rangeInt(2, 5); // Standard diverse system
      } else if (roll < 0.92) {
        numPlanets = rng.rangeInt(6, 7); // Rich system
      } else {
        numPlanets = 8; // Crowded planetary collective
      }
    }

    const planets: PlanetDescriptor[] = [];
    const usedFamilies = new Set<string>();

    for (let i = 0; i < numPlanets; i++) {
      let planet = this.generatePlanet(rng, isOrigin ? 'Solara' : name, i + 1, star.spectralClass);
      if (usedFamilies.has(planet.profile.family)) {
        planet = this.generatePlanet(new SeededRandom(planet.seed + 104729), isOrigin ? 'Solara' : name, i + 1, star.spectralClass);
      }
      usedFamilies.add(planet.profile.family);
      planets.push(planet);
    }

    // Early-exploration accessibility guarantee:
    // Sector {0, 1, 0} (immediate 1-sector neighbor of origin) is guaranteed to have at least one landable sentient world
    const isStartingNeighbor = sx === 0 && sy === 1 && sz === 0;
    if (isStartingNeighbor) {
      if (planets.length === 0) {
        // Guarantee at least 1 planet exists in this system
        const p = this.generatePlanet(new SeededRandom(sysSeed + 42), name, 1, star.spectralClass);
        planets.push(p);
      }
      const targetPlanet = planets[planets.length - 1];
      targetPlanet.isLandable = true;
      targetPlanet.biosignature = 'anomalous';
      targetPlanet.profile.biosignature = 'anomalous';
      targetPlanet.profile.isLandable = true;
      (targetPlanet.profile as any).forceSentient = true;
      targetPlanet.profile.atmosphere.hasAtmosphere = true;
      targetPlanet.profile.temperatureKelvin = 296;
      targetPlanet.profile.oceanCoverage = Math.max(0.25, targetPlanet.profile.oceanCoverage);
    }

    // Space Anomalies (0 to 2 per system)
    const anomalies: SpaceAnomalyDescriptor[] = [];
    const hasAnomaly = rng.chance(0.4) || isOrigin;
    if (hasAnomaly) {
      const anomalyCount = rng.rangeInt(1, 2);
      for (let a = 0; a < anomalyCount; a++) {
        anomalies.push(this.generateAnomaly(rng, id, name, a + 1));
      }
    }

    const systemDesc: StarSystemDescriptor = {
      id,
      seed: sysSeed,
      name: isOrigin ? 'Solara' : name,
      sectorX: sx,
      sectorY: sy,
      sectorZ: sz,
      star,
      planets,
      anomalies,
    };
    systemDesc.population = SystemPopulationGenerator.generatePopulation(systemDesc);
    return systemDesc;
  }

  private static generateAnomaly(
    rng: SeededRandom,
    sysId: string,
    sysName: string,
    index: number
  ): SpaceAnomalyDescriptor {
    const types: SpaceAnomalyType[] = [
      'derelict_probe',
      'cometary_nucleus',
      'dense_asteroid_cluster',
      'drifting_beacon',
      'nebula_pocket',
      'resonance_monolith',
    ];

    const type = rng.pick(types);
    const hasResonance = type === 'resonance_monolith' || rng.chance(0.08);

    let resonance: ResonanceSignature | undefined;
    if (hasResonance) {
      const freq = Math.round(rng.range(1420.4, 1850.0) * 100) / 100;
      resonance = {
        frequency: freq,
        intensity: rng.range(0.65, 0.98),
        harmonicPattern: `Resonance-Phi-${Math.round(freq)}`,
        loreFragment: 'Unusual harmonic subspace vibration registered across long-range array.',
      };
    }

    const titles: Record<SpaceAnomalyType, string[]> = {
      derelict_probe: ['Ancient Pioneer Probe', 'Silent Deep-Space Sentry', 'Relic Survey Orb'],
      cometary_nucleus: ['Pristine Cryo-Comet', 'Hyperbolic Ice Wanderer', 'Volatile Cometary Remnant'],
      dense_asteroid_cluster: ['Metallic Belt Nodule', 'Primordial Chondrite Mass', 'Silicate Swarm'],
      drifting_beacon: ['Fading Navigational Buoy', 'Automated Subspace Relay', 'Pulsing Emergency Transponder'],
      nebula_pocket: ['Ionized Hydrocarbon Shimmer', 'Gaseous Stellar Remnant', 'Cold Dust Concentration'],
      resonance_monolith: ['Harmonic Lattice Node', 'Resonant Spatial Anomaly', 'Echo Structure'],
      RESONANCE_ECHO: ['Resonance Harmonic Echo', 'Builder Lattice Shard', 'Crystalline Monolith'],
      DERELICT_PROBE: ['Derelict Survey Vessel', 'Ancient Recon Probe', 'Decommissioned Scout'],
    };

    const name = `${sysName} ${rng.pick(titles[type])} ${index}`;

    return {
      id: `${sysId}-anom-${index}`,
      name,
      type,
      distanceFromStar: rng.range(800, 2600),
      angle: rng.range(0, Math.PI * 2),
      description: hasResonance
        ? 'Electromagnetic scanner detects persistent non-random acoustic resonance.'
        : 'Passive radar reveals an uncatalogued astronomical object of interest.',
      scanned: false,
      hasResonance,
      resonance,
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
