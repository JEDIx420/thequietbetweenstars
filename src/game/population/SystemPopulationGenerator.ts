import { SeededRandom } from '../universe/SeededRandom';
import type { StarSystemDescriptor } from '../systems/PlanetDescriptor';
import type {
  StationArchetype,
  StationDescriptor,
  StationServiceType,
  NPCVesselDescriptor,
  SystemPopulationDescriptor,
  VesselArchetype,
  VesselSizeClass,
} from './PopulationTypes';

const FACTIONS = [
  'Frontier Signal Collective',
  'Aurelia Merchant Combine',
  'Wayfarers of the Drift',
  'Solaris Mining Guild',
  'Ascendant Xenobiotic League',
  'Starlight Cartographers Syndicate',
  'Pilgrims of the Quiet Resonance',
];

const CAPTAIN_FIRST_NAMES = [
  'Zephyr', 'Orin', 'Lyra', 'Vance', 'Solas', 'Kael', 'Thorne', 'Astrid',
  'Corin', 'Elysia', 'Ren', 'Kiora', 'Talon', 'Mira', 'Varek', 'Nyx'
];

const CAPTAIN_TITLES = ['Captain', 'Navigator', 'Archon', 'Surveyor', 'Overseer', 'Pilot', 'Consul'];

const SPECIES_NAMES = [
  'Nomad Avian',
  'Silicon Cephalopod',
  'Carbon-Chitin Synth',
  'Crystalline Symbiote',
  'Solar Drifter',
  'Subspace Resonant Humanoid',
];

const STATION_NAMES_BY_ARCHETYPE: Record<StationArchetype, string[]> = {
  TRADE_HUB: ['Concourse', 'Exchange Spire', 'Orbital Nexus', 'Crossroads Hub', 'Freeport'],
  MINING_REFINERY: ['Foundry Array', 'Slag Works', 'Deep Core Refinery', 'Excavation Rig', 'Extraction Platform'],
  RESEARCH_ARRAY: ['Observatory Apex', 'Signal Array', 'Telemetry Lab', 'Spectrographic Post', 'Deep Resonance Array'],
  SHIPYARD: ['Drydock Horizon', 'Orbital Gantry', 'Hullworks Yard', 'Slipway Spire', 'Fleet Basin'],
  ORBITAL_HABITAT: ['Biosphere Sanctum', 'Habitat Ring', 'Terrarium Haven', 'Hydroponic Spire', 'Greenhouse Dome'],
  ALIEN_BIOSTATION: ['Living Canopy', 'Organic Hive Spire', 'Chitin Bastion', 'Symbiotic Shell', 'Spore Bastion'],
};

const VESSEL_NAMES = [
  'The Wanderer', 'Starlight Sovereign', 'Gilded Aster', 'Resonant Gale',
  'Vanguard of Eos', 'Silent Horizon', 'Abyssal Drifter', 'Wayseeker',
  'Aurelia Dawn', 'Apex Navigator', 'Void Dragonfly', 'Prismatic Tide',
  'Ghost of Cygnus', 'Nebula Runner', 'Solar Wind Echo', 'Chronos Spire'
];

export const COMPATIBLE_ARCHETYPES_BY_SIZE: Record<VesselSizeClass, VesselArchetype[]> = {
  SCOUT: ['SOLAR_SAIL', 'MANTA_WING'],
  SHUTTLE: ['SOLAR_SAIL', 'MANTA_WING', 'ROTATING_RING'],
  TRADER: ['INDUSTRIAL_HAULER', 'SOLAR_SAIL', 'ROTATING_RING'],
  FRIGATE: ['MANTA_WING', 'INDUSTRIAL_HAULER', 'ORGANIC_BIO'],
  CRUISER: ['SOLAR_SAIL', 'ROTATING_RING', 'ORGANIC_BIO', 'INDUSTRIAL_HAULER'],
  CARRIER: ['INDUSTRIAL_HAULER', 'ROTATING_RING', 'CATHEDRAL_CAPITAL', 'ORGANIC_BIO'],
  CAPITAL: ['CATHEDRAL_CAPITAL', 'ROTATING_RING', 'ORGANIC_BIO'],
};

export class SystemPopulationGenerator {
  public static generatePopulation(system: StarSystemDescriptor): SystemPopulationDescriptor {
    const seed = system.seed + 881923;
    const rng = new SeededRandom(seed);

    const isOrigin = system.sectorX === 0 && system.sectorY === 0 && system.sectorZ === 0;
    const isStartingNeighbor = system.sectorX === 0 && system.sectorY === 1 && system.sectorZ === 0;

    const stations: StationDescriptor[] = [];
    const vessels: NPCVesselDescriptor[] = [];

    // Determine Stations
    let stationCount = 0;
    if (isOrigin) {
      stationCount = 1;
    } else if (isStartingNeighbor) {
      stationCount = 1;
    } else {
      const pCount = system.planets?.length || 0;
      if (pCount === 0) {
        stationCount = rng.chance(0.25) ? 1 : 0;
      } else if (pCount <= 3) {
        stationCount = rng.chance(0.55) ? 1 : 0;
      } else {
        const roll = rng.next();
        stationCount = roll < 0.25 ? 0 : roll < 0.75 ? 1 : 2;
      }
    }

    for (let s = 0; s < stationCount; s++) {
      let archetype: StationArchetype;
      if (isOrigin) {
        archetype = 'TRADE_HUB';
      } else if (isStartingNeighbor) {
        archetype = 'RESEARCH_ARRAY';
      } else {
        const archetypes: StationArchetype[] = [
          'TRADE_HUB',
          'MINING_REFINERY',
          'RESEARCH_ARRAY',
          'SHIPYARD',
          'ORBITAL_HABITAT',
          'ALIEN_BIOSTATION',
        ];
        archetype = rng.pick(archetypes);
      }

      const faction = isOrigin ? 'Frontier Signal Collective' : rng.pick(FACTIONS);
      const namePool = STATION_NAMES_BY_ARCHETYPE[archetype];
      const stationName = isOrigin
        ? 'Aurelia Orbital Gateway'
        : `${system.name} ${rng.pick(namePool)} ${rng.pick(['Alpha', 'Beta', 'Prime', 'VII', '9'])}`;

      // Orbital position: 2200 to 4200 radius, spread angle
      const orbitDist = 2000 + s * 1400 + rng.range(200, 600);
      const angle = (s * Math.PI * 0.9) + rng.range(-0.4, 0.4);
      const posX = Math.cos(angle) * orbitDist;
      const posY = rng.range(-250, 350);
      const posZ = Math.sin(angle) * orbitDist;

      // Services provided by this station
      const services: StationServiceType[] = ['MARKET', 'FABRICATOR', 'SERVICES', 'COMMS'];
      if (archetype === 'SHIPYARD' || archetype === 'TRADE_HUB' || isOrigin) {
        services.push('SHIPYARD');
      }

      stations.push({
        entityKind: 'STATION',
        id: `station_${system.id}_${s + 1}`,
        name: stationName,
        archetype,
        faction,
        position: { x: Math.round(posX), y: Math.round(posY), z: Math.round(posZ) },
        services,
        marketProfileId: `market_${archetype.toLowerCase()}`,
        captureRadius: 120,
        approachDistance: 450,
        greeting: `Welcome to ${stationName}. Umbilical docking clearance confirmed for registered exploratory craft.`,
        lore: `Maintained by the ${faction}, operating in the ${system.name} system as an active center of ${archetype.replace('_', ' ').toLowerCase()}.`,
      });
    }

    // Determine NPC Vessels
    let vesselCount = 0;
    if (isOrigin) {
      vesselCount = 2; // e.g. The Wanderer + Local Trader
    } else if (stations.length > 0) {
      vesselCount = rng.rangeInt(1, 3);
    } else {
      vesselCount = rng.chance(0.35) ? rng.rangeInt(1, 2) : 0;
    }

    for (let v = 0; v < vesselCount; v++) {
      const sizeClasses: VesselSizeClass[] = ['SCOUT', 'SHUTTLE', 'TRADER', 'FRIGATE', 'CRUISER', 'CARRIER', 'CAPITAL'];
      const sizeClass = isOrigin && v === 0
        ? 'CRUISER'
        : rng.pick(sizeClasses);

      const compatibleArchetypes = COMPATIBLE_ARCHETYPES_BY_SIZE[sizeClass] || ['SOLAR_SAIL'];
      const archetype = isOrigin && v === 0 ? 'SOLAR_SAIL' : rng.pick(compatibleArchetypes);

      const isLargeShip = sizeClass === 'CARRIER' || sizeClass === 'CAPITAL' || (sizeClass === 'TRADER' && archetype === 'INDUSTRIAL_HAULER');
      const isDockable = isLargeShip;

      const vesselServices: StationServiceType[] = ['COMMS'];
      if (sizeClass === 'CARRIER' || sizeClass === 'CAPITAL') {
        vesselServices.push('MARKET', 'SHIPYARD', 'SERVICES');
      } else if (sizeClass === 'TRADER') {
        vesselServices.push('MARKET');
      } else if (archetype === 'ORGANIC_BIO') {
        vesselServices.push('FABRICATOR', 'SERVICES');
      }

      const marketArchetype: StationArchetype =
        archetype === 'ORGANIC_BIO'
          ? 'ALIEN_BIOSTATION'
          : archetype === 'INDUSTRIAL_HAULER'
          ? 'MINING_REFINERY'
          : archetype === 'CATHEDRAL_CAPITAL'
          ? 'SHIPYARD'
          : 'TRADE_HUB';

      const vesselFaction = isOrigin && v === 0 ? 'Nomad Avian Cartel' : rng.pick(FACTIONS);

      const vesselName = isOrigin && v === 0
        ? 'The Wanderer-7'
        : `${rng.pick(VESSEL_NAMES)} ${rng.pick(['I', 'IV', 'VII', 'IX', 'X'])}`;

      const captainTitle = rng.pick(CAPTAIN_TITLES);
      const captainFirst = isOrigin && v === 0 ? 'Captain Zephyr' : `${captainTitle} ${rng.pick(CAPTAIN_FIRST_NAMES)}`;
      const species = isOrigin && v === 0 ? 'Nomad Avian' : rng.pick(SPECIES_NAMES);

      // Position vessel near a station if available, or in orbit
      let vx = 0;
      let vy = 0;
      let vz = 0;

      if (stations.length > 0 && rng.chance(0.6)) {
        const anchor = stations[v % stations.length];
        const offsetDist = rng.range(350, 750);
        const offsetAngle = rng.range(0, Math.PI * 2);
        vx = anchor.position.x + Math.cos(offsetAngle) * offsetDist;
        vy = anchor.position.y + rng.range(-60, 60);
        vz = anchor.position.z + Math.sin(offsetAngle) * offsetDist;
      } else {
        const vDist = 1800 + rng.range(200, 1800);
        const vAng = rng.range(0, Math.PI * 2);
        vx = Math.cos(vAng) * vDist;
        vy = rng.range(-180, 180);
        vz = Math.sin(vAng) * vDist;
      }

      vessels.push({
        entityKind: 'VESSEL',
        id: isOrigin && v === 0 ? 'the_wanderer_7' : `vessel_${system.id}_${v + 1}`,
        name: vesselName,
        captainName: captainFirst,
        species,
        faction: vesselFaction,
        archetype,
        sizeClass,
        position: { x: Math.round(vx), y: Math.round(vy), z: Math.round(vz) },
        patrolRadius: rng.rangeInt(30, 80),
        hailRadius: 900,
        isDockable,
        captureRadius: isDockable ? 100 : undefined,
        approachDistance: isDockable ? 350 : undefined,
        dialogueTopic: `stellar trade routes and ${species} customs`,
        greeting: `Subspace comms established with ${vesselName}. ${captainFirst} transmitting greetings across the quiet.`,
        lore: `A ${sizeClass.toLowerCase()} class vessel of ${species} origin, powered by ${archetype.replace('_', ' ').toLowerCase()} drives.`,
        services: vesselServices,
        marketArchetype,
      });
    }

    // High-level summary string
    let populationDescription = 'Uninhabited deep space sector';
    if (stations.length > 0 && vessels.length > 0) {
      populationDescription = `${stations.length} Station(s) · ${vessels.length} Active Vessel(s)`;
    } else if (stations.length > 0) {
      populationDescription = `${stations.length} Station(s) in orbit`;
    } else if (vessels.length > 0) {
      populationDescription = `${vessels.length} Transient Vessel(s) on sensors`;
    }

    return {
      systemId: system.id,
      systemName: system.name,
      stations,
      vessels,
      populationDescription,
    };
  }
}
