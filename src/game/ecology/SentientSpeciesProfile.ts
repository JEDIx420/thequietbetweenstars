import { SeededRandom } from '../universe/SeededRandom';
import type { PlanetEnvironmentProfile } from '../planets/PlanetEnvironmentProfile';
import type { PlanetEcologyProfile } from './PlanetEcologyProfile';

export interface SentientSpeciesProfile {
  speciesId: string;
  name: string;
  homePlanetId: string;
  averageHeightMeters: number;
  sensoryOrgans: string;
  socialStructure: string;
  worldview: string;
  technologyLevel: string;
  architectureStyle: string;
  values: string;
  taboos: string;
  history: string;
  relationshipToEnvironment: string;
  interpretationOfResonance: string;
  languageStyle: string;
}

export interface NPCIdentity {
  npcId: string;
  speciesId: string;
  name: string;
  title: string;
  ageStage: 'young' | 'mature' | 'elder';
  personality: 'gentle' | 'inquisitive' | 'solemn' | 'whimsical' | 'observant';
  currentConcern: string;
  knowledgeTopics: string[];
  greeting: string;
  loreFactKey: string;
  loreFactTitle: string;
  loreFactText: string;
}

export class SentientSpeciesGenerator {
  public static generateSpecies(
    planet: PlanetEnvironmentProfile,
    planetSeed: number,
    planetId: string,
    ecology: PlanetEcologyProfile
  ): SentientSpeciesProfile | null {
    if (ecology.tier !== 'SENTIENT_BIOSPHERE' || ecology.sentientSpecies.length === 0) {
      return null;
    }

    const rng = new SeededRandom(planetSeed + 9942);
    const names = ['The Orosen', 'The Kael-Varn', 'The Lithic Elders', 'The Silent Weavers', 'The Zephyri'];
    const name = rng.pick(names);

    // Causal generation based on physical environment
    const isLowGravity = planet.gravity < 7.0;
    const isTidallyLocked = planet.family === 'barren-moon' || (planet.seed % 7 === 0);
    const isOceanic = planet.oceanCoverage > 0.6 || planet.family === 'oceanic-water';

    let height = rng.range(14, 26);
    if (isLowGravity) height += 8;

    let socialStructure = 'Nomadic observational conclaves';
    let worldview = 'Harmonic balance with subterranean acoustic echoes';
    let architectureStyle = 'Spire-aligned monoliths with resonating chambers';
    let resonanceInterpretation = 'The prime harmonic 1420 kHz frequency is revered as the Great Tuning of the Void.';

    if (isTidallyLocked) {
      socialStructure = 'Twilight bandsmen gathering along the terminator ridge';
      worldview = 'Dualism of eternal light and unending cold darkness';
      architectureStyle = 'Horizontal basalt shelters aligned to permanent shadows';
      resonanceInterpretation = 'An ancient beacon guiding wanderers along the frozen frontier.';
    } else if (isOceanic) {
      socialStructure = 'Archipelago seafaring custodians';
      worldview = 'Acoustic wave communion across planetary oceans';
      architectureStyle = 'Floating porous pumice pavilions';
      resonanceInterpretation = 'The pulse of the deep core reverberating through the tides.';
    }

    return {
      speciesId: `species_${name.toLowerCase().replace(/[\s-]/g, '_')}`,
      name,
      homePlanetId: planetId,
      averageHeightMeters: Math.round(height),
      sensoryOrgans: `${ecology.motif.eyeCount} focal ocular rings and ${ecology.motif.sensoryStructure}`,
      socialStructure,
      worldview,
      technologyLevel: 'Acoustic resonance manipulation & celestial cartography',
      architectureStyle,
      values: 'Patience, astronomical observation, acoustic stillness',
      taboos: 'High-frequency explosive combustion, uninvited seismic quarrying',
      history: 'A civilization dating back eighteen thousand standard cycles, surviving through planetary harmony.',
      relationshipToEnvironment: 'They do not build cities; they listen to the geological pulse and carve sanctuaries into wind-sheltered canyons.',
      interpretationOfResonance: resonanceInterpretation,
      languageStyle: 'Low subsonic reverberations modulated by melodic clicking harmonics',
    };
  }

  public static generateNotableNPCs(
    species: SentientSpeciesProfile,
    count: number,
    seed: number
  ): NPCIdentity[] {
    const rng = new SeededRandom(seed + 404);
    const firstNames = ['Eraan', 'Maelor', 'Thalassa', 'Vael', 'Zephyros', 'Kalyx', 'Solan', 'Orun'];
    const titles = [
      'Weather Reader',
      'Keeper of the Horizon Glass',
      'Shepherd of Aerial Rays',
      'Lithic Archivist',
      'Stargazer of the Twilight Ridge',
      'Tide Weaver',
    ];

    const concerns = [
      'The seasonal migration of the floating rays has shifted by three degrees.',
      'The subterranean acoustic resonance has grown quieter since the last solstice.',
      'The distant white dwarf star has flared twice this cycle.',
      'A new thermal vent has opened in the southern volcanic rift.',
    ];

    const npcs: NPCIdentity[] = [];

    for (let i = 0; i < count; i++) {
      const name = `${rng.pick(firstNames)} the ${rng.pick(titles)}`;
      const factTitle = `Lore of ${species.name}: ${rng.pick(['The Singing Ridge', 'The Tide of Glass', 'The Great Tuning', 'The Old Strata'])}`;
      const factText = `Recorded from ${name}: "For twelve generations, our people have observed the harmonic shifts. What your ship calls the 1420 kHz band, we know as the breath of the quiet stars."`;

      npcs.push({
        npcId: `npc_${species.speciesId}_${i + 1}`,
        speciesId: species.speciesId,
        name,
        title: rng.pick(titles),
        ageStage: rng.pick(['young', 'mature', 'elder']),
        personality: rng.pick(['gentle', 'inquisitive', 'solemn', 'whimsical', 'observant']),
        currentConcern: rng.pick(concerns),
        knowledgeTopics: ['ecology', 'history', 'the_resonance', 'star_travel'],
        greeting: `Greetings, traveler in the small silver craft. The ground welcomes your shadow.`,
        loreFactKey: `lore_${species.speciesId}_${i + 1}`,
        loreFactTitle: factTitle,
        loreFactText: factText,
      });
    }

    return npcs;
  }
}
