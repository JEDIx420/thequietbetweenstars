import { SeededRandom } from '../universe/SeededRandom';
import type { PlanetEnvironmentProfile } from '../planets/PlanetEnvironmentProfile';

export type EcologyTier =
  | 'BARREN'
  | 'MICROBIAL'
  | 'SIMPLE_BIOSPHERE'
  | 'COMPLEX_BIOSPHERE'
  | 'SENTIENT_BIOSPHERE';

export interface EvolutionaryMotif {
  name: string;
  eyeCount: number;
  limbCount: number;
  primaryColor: string;
  accentColor: string;
  bioluminescence: boolean;
  integument: 'scales' | 'chitin' | 'smooth_skin' | 'spores' | 'feather_down' | 'crystalline_plates';
  sensoryStructure: 'antennae' | 'crests' | 'whisker_arrays' | 'faceted_nodes' | 'acoustic_frills';
}

export interface EcologicalSpecies {
  id: string;
  name: string;
  category: 'GROUND' | 'AERIAL' | 'AMPHIBIOUS' | 'MEGAFAUNA' | 'SENTIENT';
  bodyPlan:
    | 'crawler'
    | 'quadruped'
    | 'six_legged'
    | 'tripod'
    | 'hopper'
    | 'segmented'
    | 'ray'
    | 'jelly'
    | 'swarm'
    | 'glider'
    | 'balloon'
    | 'shoreline_grazer'
    | 'colossus'
    | 'sentient_giant';
  scale: number; // visual bounding scale multiplier
  baseSpeed: number;
  temperament: 'curious' | 'timid' | 'placid' | 'majestic' | 'venerable';
  diet: string;
  behaviour: 'wander' | 'graze' | 'hover' | 'circle' | 'flock' | 'sentient_gaze';
  rarity: number; // 0.0 to 1.0
  heightMeters: number;
  description: string;
}

export interface PlanetEcologyProfile {
  planetId: string;
  seed: number;
  tier: EcologyTier;
  viability: number; // 0.0 to 1.0
  trophicComplexity: number; // 0 to 5
  motif: EvolutionaryMotif;
  groundSpecies: EcologicalSpecies[];
  aerialSpecies: EcologicalSpecies[];
  amphibiousSpecies: EcologicalSpecies[];
  megafaunaSpecies: EcologicalSpecies[];
  sentientSpecies: EcologicalSpecies[];
  activeSentientCount: number;
}

export class EcologyGenerator {
  public static deriveEcology(
    planetProfile: PlanetEnvironmentProfile,
    planetSeed: number,
    planetId: string,
    forceSentient: boolean = false
  ): PlanetEcologyProfile {
    const rng = new SeededRandom(planetSeed + 1337);

    // 1. Determine Ecology Tier based on biosignature, hydrosphere and temperature
    const bio = planetProfile.biosignature;
    const temp = planetProfile.temperatureKelvin;
    const hydro = planetProfile.oceanCoverage;
    const hasAtmo = planetProfile.atmosphere.hasAtmosphere;

    let tier: EcologyTier = 'BARREN';
    let viability = 0;
    let trophicComplexity = 0;

    const isForced = forceSentient || (planetProfile as any).forceSentient === true;
    if (isForced && hasAtmo) {
      tier = 'SENTIENT_BIOSPHERE';
      viability = 0.9;
      trophicComplexity = 5;
    } else if (bio === 'none' || !hasAtmo || temp < 110 || temp > 460) {
      // Barren or severe vacuum/cryo/inferno
      tier = 'BARREN';
      viability = rng.range(0.0, 0.05);
      trophicComplexity = 0;
    } else if (bio === 'microbial' || hydro < 0.05) {
      tier = 'MICROBIAL';
      viability = rng.range(0.1, 0.25);
      trophicComplexity = 1;
    } else if (bio === 'primitive-flora') {
      tier = 'SIMPLE_BIOSPHERE';
      viability = rng.range(0.35, 0.6);
      trophicComplexity = 2;
    } else if (bio === 'complex-ecosystem') {
      viability = rng.range(0.65, 0.88);
      trophicComplexity = 3 + rng.rangeInt(0, 1);
      // Sentience emerges naturally in 25-30% of temperate liquid-bearing complex ecosystems
      const isTemperate = temp >= 240 && temp <= 340;
      const hasHydrosphere = hydro >= 0.12;
      const naturalSentient = isTemperate && hasHydrosphere && (rng.next() < 0.28);
      tier = naturalSentient ? 'SENTIENT_BIOSPHERE' : 'COMPLEX_BIOSPHERE';
      if (naturalSentient) {
        trophicComplexity = 5;
        viability = Math.max(viability, 0.85);
      }
    } else if (bio === 'anomalous') {
      // Anomalous high probability of Sentient Biosphere (~75%)
      const isSentient = rng.next() < 0.75;
      tier = isSentient ? 'SENTIENT_BIOSPHERE' : 'COMPLEX_BIOSPHERE';
      viability = rng.range(0.8, 1.0);
      trophicComplexity = isSentient ? 5 : 4;
    }

    // 2. Evolutionary Motif (Unified planetary morphology)
    const motif = this.generateMotif(rng, planetProfile);

    // 3. Species Catalogues
    const groundSpecies: EcologicalSpecies[] = [];
    const aerialSpecies: EcologicalSpecies[] = [];
    const amphibiousSpecies: EcologicalSpecies[] = [];
    const megafaunaSpecies: EcologicalSpecies[] = [];
    const sentientSpecies: EcologicalSpecies[] = [];

    if (tier !== 'BARREN') {
      if (tier === 'MICROBIAL') {
        // Primitive crawler species
        groundSpecies.push(this.createSpecies(rng, 'GROUND', 'crawler', motif, 0.6, 1.2, 'spore grazer'));
      } else if (tier === 'SIMPLE_BIOSPHERE') {
        groundSpecies.push(this.createSpecies(rng, 'GROUND', 'quadruped', motif, 1.0, 1.8, 'mineral lichenivore'));
        groundSpecies.push(this.createSpecies(rng, 'GROUND', 'tripod', motif, 0.8, 2.2, 'shrub browser'));
        aerialSpecies.push(this.createSpecies(rng, 'AERIAL', 'glider', motif, 0.9, 1.5, 'aerial planktonivore'));
      } else if (tier === 'COMPLEX_BIOSPHERE' || tier === 'SENTIENT_BIOSPHERE') {
        // Diverse ground species
        groundSpecies.push(this.createSpecies(rng, 'GROUND', 'quadruped', motif, 1.2, 2.4, 'canopy grazer'));
        groundSpecies.push(this.createSpecies(rng, 'GROUND', 'six_legged', motif, 1.4, 2.8, 'lowland grazer'));
        groundSpecies.push(this.createSpecies(rng, 'GROUND', 'hopper', motif, 0.8, 1.5, 'crevice seeker'));
        groundSpecies.push(this.createSpecies(rng, 'GROUND', 'segmented', motif, 1.1, 1.3, 'sub-surface burrower'));

        // Aerial species
        aerialSpecies.push(this.createSpecies(rng, 'AERIAL', 'ray', motif, 1.8, 3.2, 'thermal drifter'));
        aerialSpecies.push(this.createSpecies(rng, 'AERIAL', 'jelly', motif, 1.5, 4.0, 'buoyant atmospheric sifter'));
        aerialSpecies.push(this.createSpecies(rng, 'AERIAL', 'swarm', motif, 0.6, 0.8, 'luminescent micro-flock'));

        // Coastal/Amphibious if hydrosphere present
        if (hydro > 0.15) {
          amphibiousSpecies.push(this.createSpecies(rng, 'AMPHIBIOUS', 'shoreline_grazer', motif, 1.3, 2.0, 'tidal herbivore'));
        }

        // Megafauna Colossi
        megafaunaSpecies.push(this.createSpecies(rng, 'MEGAFAUNA', 'colossus', motif, 3.5, 14.0, 'gentle high-canopy colossus'));

        // Sentient Giants if tier allows
        if (tier === 'SENTIENT_BIOSPHERE') {
          sentientSpecies.push(this.createSpecies(rng, 'SENTIENT', 'sentient_giant', motif, 4.0, rng.range(12.0, 24.0), 'sapient stellar philosopher'));
        }
      }
    }

    return {
      planetId,
      seed: planetSeed,
      tier,
      viability,
      trophicComplexity,
      motif,
      groundSpecies,
      aerialSpecies,
      amphibiousSpecies,
      megafaunaSpecies,
      sentientSpecies,
      activeSentientCount: sentientSpecies.length > 0 ? rng.rangeInt(1, 3) : 0,
    };
  }

  private static generateMotif(rng: SeededRandom, planet: PlanetEnvironmentProfile): EvolutionaryMotif {
    const eyeCounts = [1, 2, 3, 4, 6];
    const limbCounts = [3, 4, 6, 8];
    const integuments: EvolutionaryMotif['integument'][] = [
      'scales', 'chitin', 'smooth_skin', 'spores', 'feather_down', 'crystalline_plates'
    ];
    const sensoryStructures: EvolutionaryMotif['sensoryStructure'][] = [
      'antennae', 'crests', 'whisker_arrays', 'faceted_nodes', 'acoustic_frills'
    ];

    const motifNames = [
      'Tri-ocular Hexapod Motif',
      'Cerulean Chitin Motif',
      'Luminescent Whisker Motif',
      'Crystalline Spire Morphology',
      'Velvet Spore Archetype',
      'Acoustic Crest Phylum',
    ];

    return {
      name: rng.pick(motifNames),
      eyeCount: rng.pick(eyeCounts),
      limbCount: rng.pick(limbCounts),
      primaryColor: planet.palette.surfaceMidland,
      accentColor: planet.palette.accentMineral || planet.palette.surfaceHighland,
      bioluminescence: planet.biosignature === 'anomalous' || planet.biosignature === 'complex-ecosystem',
      integument: rng.pick(integuments),
      sensoryStructure: rng.pick(sensoryStructures),
    };
  }

  private static createSpecies(
    rng: SeededRandom,
    category: EcologicalSpecies['category'],
    bodyPlan: EcologicalSpecies['bodyPlan'],
    motif: EvolutionaryMotif,
    scale: number,
    heightMeters: number,
    diet: string
  ): EcologicalSpecies {
    const prefixes = ['Aurelian', 'Zephyr', 'Luminescent', 'Stilt', 'Pebble', 'Mist', 'Crested', 'Vesper', 'Solar'];
    const suffixes = ['Strider', 'Grazer', 'Drifter', 'Skimmer', 'Weaver', 'Whisperer', 'Colossus', 'Wanderer'];
    const name = `${rng.pick(prefixes)} ${rng.pick(suffixes)}`;

    let temperament: EcologicalSpecies['temperament'] = 'placid';
    let behaviour: EcologicalSpecies['behaviour'] = 'wander';

    if (category === 'AERIAL') {
      behaviour = bodyPlan === 'swarm' ? 'flock' : 'circle';
      temperament = 'curious';
    } else if (category === 'MEGAFAUNA') {
      behaviour = 'graze';
      temperament = 'majestic';
    } else if (category === 'SENTIENT') {
      behaviour = 'sentient_gaze';
      temperament = 'venerable';
    }

    return {
      id: `species_${name.toLowerCase().replace(/\s+/g, '_')}_${rng.rangeInt(100, 999)}`,
      name,
      category,
      bodyPlan,
      scale,
      baseSpeed: category === 'MEGAFAUNA' || category === 'SENTIENT' ? rng.range(1.5, 3.5) : rng.range(3.0, 7.0),
      temperament,
      diet,
      behaviour,
      rarity: rng.range(0.1, 0.9),
      heightMeters,
      description: `Evolved under the ${motif.name}. Exhibits ${motif.eyeCount} sensory focal points and ${motif.limbCount} primary articulators.`,
    };
  }
}
