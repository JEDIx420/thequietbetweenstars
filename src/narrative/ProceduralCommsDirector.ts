import type { SpaceStation } from '../game/stations/SpaceStationManager';
import type { NamedVessel } from '../game/vessels/NamedVesselDirector';

export type CommsPersonality =
  | 'VETERAN_MINER'
  | 'NAVAL_COMMANDER'
  | 'COSMIC_SCHOLAR'
  | 'FREE_TRADER'
  | 'VOID_PILGRIM'
  | 'SYNTH_CORE';

export interface CommsParticipant {
  id: string;
  name: string;
  entityKind: 'STATION' | 'VESSEL';
  archetype?: string;
  sizeClass?: string;
  faction?: string;
  species?: string;
  captainName?: string;
  baseLore?: string;
  baseGreeting?: string;
}

export interface CommsQueryContext {
  target: CommsParticipant;
  systemName?: string;
  queryType: 'traffic_advisory' | 'trade_routes' | 'customs_lore' | 'auxiliary_support' | 'deep_space_rumors';
  inquiryCount?: number;
  pilotCredits?: number;
}

export interface CommsQueryResult {
  pilotText: string;
  replyText: string;
  speaker: string;
  personality: CommsPersonality;
}

export class ProceduralCommsDirector {
  private static instance: ProceduralCommsDirector | null = null;

  public static getInstance(): ProceduralCommsDirector {
    if (!ProceduralCommsDirector.instance) {
      ProceduralCommsDirector.instance = new ProceduralCommsDirector();
    }
    return ProceduralCommsDirector.instance;
  }

  // Simple deterministic string hash to select stable procedural variations
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  private pickItem<T>(items: T[], seed: number): T {
    return items[seed % items.length];
  }

  /**
   * Converts a SpaceStation or NamedVessel into a generic CommsParticipant.
   */
  public toParticipant(target: SpaceStation | NamedVessel): CommsParticipant {
    const isStation = target.entityKind === 'STATION';
    const vessel = !isStation ? (target as NamedVessel) : null;
    const station = isStation ? (target as SpaceStation) : null;

    return {
      id: target.id,
      name: target.name,
      entityKind: target.entityKind,
      archetype: station?.archetype || vessel?.archetype,
      sizeClass: vessel?.sizeClass,
      faction: target.faction,
      species: vessel?.species,
      captainName: vessel?.captainName,
      baseLore: target.lore,
      baseGreeting: target.greeting,
    };
  }

  /**
   * Infers the communication personality based on vessel/station archetype, faction, and id.
   */
  public determinePersonality(target: CommsParticipant): CommsPersonality {
    const arch = (target.archetype || '').toUpperCase();
    const size = (target.sizeClass || '').toUpperCase();
    const faction = (target.faction || '').toUpperCase();

    if (arch.includes('MINING') || arch.includes('INDUSTRIAL') || arch.includes('REFINERY')) {
      return 'VETERAN_MINER';
    }
    if (arch.includes('RESEARCH') || arch.includes('SCIENCE') || arch.includes('ORGANIC_BIO')) {
      return 'COSMIC_SCHOLAR';
    }
    if (arch.includes('SHIPYARD') || size === 'CAPITAL' || size === 'CRUISER' || size === 'FRIGATE') {
      return 'NAVAL_COMMANDER';
    }
    if (arch.includes('TRADE') || arch.includes('HAULER') || size === 'TRADER' || faction.includes('CARTEL') || faction.includes('NOMAD')) {
      return 'FREE_TRADER';
    }
    if (arch.includes('BIOSTATION') || arch.includes('SOLAR_SAIL') || arch.includes('ROTATING_RING')) {
      return 'VOID_PILGRIM';
    }

    // Default hash-based fallback among archetypes
    const hash = this.hashString(target.id + (target.name || ''));
    const allPersonalities: CommsPersonality[] = [
      'VETERAN_MINER',
      'NAVAL_COMMANDER',
      'COSMIC_SCHOLAR',
      'FREE_TRADER',
      'VOID_PILGRIM',
      'SYNTH_CORE',
    ];
    return allPersonalities[hash % allPersonalities.length];
  }

  /**
   * Generates a context-aware opening greeting when docking or hailing.
   */
  public generateGreeting(target: CommsParticipant, visitCount: number = 0): { speaker: string; text: string } {
    const isStation = target.entityKind === 'STATION';
    const personality = this.determinePersonality(target);
    const speaker = isStation
      ? `${target.name.toUpperCase()} CONTROL`
      : `${(target.captainName || target.name).toUpperCase()} // BRIDGE`;

    if (target.baseGreeting && visitCount === 0) {
      return { speaker, text: target.baseGreeting };
    }

    const hash = this.hashString(target.id + `_greet_${visitCount}`);

    if (visitCount > 0) {
      // Returning pilot recognition
      const returnGreetings: Record<CommsPersonality, string[]> = {
        VETERAN_MINER: [
          `Welcome back to ${target.name}. Scrub the dust off your hull and pull up a berth, pilot.`,
          `Ah, the survey craft returns. Still intact after all those high-g burns? Good to have you alongside.`,
          `Docking clamps re-engaged. You smell like ozone and void rock, friend. Welcome back.`,
        ],
        NAVAL_COMMANDER: [
          `Transponder acknowledged, Commander. Hull registry verified in our station manifests. Welcome back.`,
          `Beacon clearance confirmed. Maintain 15 m/s mooring approach. Glad to see your signatures return intact.`,
          `Welcome back to the mooring lines. Perimeter defense logs note your steady transits.`,
        ],
        COSMIC_SCHOLAR: [
          `Your return is noted in our stellar chronicles. Did you bring back spectral telemetry from the outer rim?`,
          `Welcome back, explorer. The sensor arrays detected your deceleration bloom three minutes ago.`,
          `Ah, the wanderer returns. Our harmonic relays have been recording fascinating resonance waves in your wake.`,
        ],
        FREE_TRADER: [
          `Look who made it back in one piece! What profitable oddities did you salvage from the fringes?`,
          `Back again, traveler! Markets have fluctuated since your last hop. Let's see your manifest.`,
          `Docking fees waived for returning partners! Come on in, let's talk cargo and credits.`,
        ],
        VOID_PILGRIM: [
          `Peace be upon your keel, pilgrim. The silence of the deep space between stars has guided you back to us.`,
          `The cosmic tides bring your vessel to our sanctum once more. Let your drive core rest in our berth.`,
          `You carry the light of distant suns upon your shielding. Enter, traveler, and be welcomed.`,
        ],
        SYNTH_CORE: [
          `RE-CONNECTION PROTOCOL INITIALIZED. Welcome back, Pilot. Synchronizing structural telemetry and logs.`,
          `TRANSPONDER RECOGNIZED. Mooring clamps locked at 100% tensile limit. Station services online.`,
          `REPEAT TRANSIT VERIFIED. Life support and auxiliary conduits established. Diagnostics nominal.`,
        ],
      };
      return { speaker, text: this.pickItem(returnGreetings[personality], hash) };
    }

    // First arrival greetings
    const firstGreetings: Record<CommsPersonality, string[]> = {
      VETERAN_MINER: [
        `Mooring clamps locked on your hull. Watch your step on the gantry; ore dust gets slick under low grav.`,
        `Umbilical secured. Welcome to ${target.name}. Keep your thrusters cold and your credentials ready.`,
        `Docking verified. Hope your cargo holds are loaded with something heavier than vacuum.`,
      ],
      NAVAL_COMMANDER: [
        `Mooring collar engaged. Maintain strict comms protocol while berthed within our perimeter.`,
        `Transponder handshake complete. Security status: GREEN. Welcome aboard ${target.name}.`,
        `Docking tether active. Weapons off-line, shields set to passive absorption. Welcome, pilot.`,
      ],
      COSMIC_SCHOLAR: [
        `Harmonic umbilical locked. Welcome to our observatory array. May your intellect expand with the stars.`,
        `Sensors register your craft's signature. A fascinating kinetic configuration. Welcome aboard.`,
        `Mooring confirmed. You arrive at a propitious stellar alignment. Our data feeds are open to you.`,
      ],
      FREE_TRADER: [
        `Docking clamps hooked! Welcome to ${target.name} — where every scrap has a price and credits never sleep.`,
        `Tether secured! Got refined hyper-alloys? Exotic flora? We've got open manifests and ready credit chits.`,
        `Mooring green! Don't scratch the docking ring, pilot, and let's see what good fortune you've hauled in.`,
      ],
      VOID_PILGRIM: [
        `In the stillness of the abyss, your ship finds safe harbour. Welcome to ${target.name}.`,
        `The solar winds have delivered you safely across the dark. Rest your engines in our embrace.`,
        `Tether established. Walk in reverence between the hulls, traveler of the silent void.`,
      ],
      SYNTH_CORE: [
        `UMBILICAL COUPLING CONFIRMED. Hermetic seal integrity: 100%. Station data exchange bus ready.`,
        `STATION CONTROL INTERFACE ENGAGED. All incoming logistics channels cleared for pilot requisition.`,
        `TELEMETRY LINK SYNCHRONIZED. Welcome to ${target.name}. Logistics matrix online and awaiting inputs.`,
      ],
    };
    return { speaker, text: this.pickItem(firstGreetings[personality], hash) };
  }

  /**
   * Generates a procedural, non-LLM reply tailored to the target entity, personality, and query.
   */
  public generateResponse(context: CommsQueryContext): CommsQueryResult {
    const target = context.target;
    const isStation = target.entityKind === 'STATION';
    const personality = this.determinePersonality(target);
    const count = context.inquiryCount ?? 0;
    const sysName = context.systemName || 'Local Sector';
    const speaker = isStation
      ? `${target.name.toUpperCase()} CONTROL`
      : `${(target.captainName || target.name).toUpperCase()} // BRIDGE`;

    const seed = this.hashString(`${target.id}_${context.queryType}_${count}`);

    let pilotText = '';
    let replyText = '';

    switch (context.queryType) {
      case 'traffic_advisory': {
        pilotText = isStation
          ? `Flight Control, requesting orbital approach vectors and local sector hazard telemetry.`
          : `Bridge, requesting tactical route scan and deep-space proximity telemetry.`;

        const hazards = [
          `Light micrometeorite wash sweeping past the second orbital ring. Maintain deflectors on forward quadrant.`,
          `Gravitational resonance waves detected off the gas giant's outer moon. Compensate with 5% starboard trim.`,
          `Stellar wind density is elevated; solar flare activity from the primary star may distort long-range LIDAR.`,
          `A belt of fragmented silicate asteroids drifts across Lagrange Point 4. Safe warp clearance is above 120km.`,
          `Clear void corridors across all approach vectors. No registered space debris or runaway drones detected.`,
          `Heavy orbital haulers currently conducting transfer burns near the industrial slipways. Give them 300m berth.`,
        ];

        const trafficNotes = [
          `Speed limit inside the approach envelope is strictly enforced at 180 m/s.`,
          `Automated mining convoys hold right of way along the primary transit corridor.`,
          `Patrol cutters sweep perimeter buoys every two hours. Broadcast your transponder cleanly.`,
          `Local navigation beacons are firing at full wattage. Auto-docking telemetry is rated nominal.`,
        ];

        const closures = [
          `Safe flight, Pilot.`,
          `Keep your eyes on the sensor scope out there.`,
          `Telemetry stream uploaded to your nav console.`,
          `Smooth flying across the star lanes.`,
        ];

        const h = this.pickItem(hazards, seed);
        const t = this.pickItem(trafficNotes, seed + 1);
        const c = this.pickItem(closures, seed + 2);
        replyText = `${h} ${t} ${c}`;
        break;
      }

      case 'trade_routes': {
        pilotText = isStation
          ? `Requesting station commodity manifest, supply deficits, and regional trade intel.`
          : `Requesting merchant convoy intelligence, price spreads, and high-margin manifests.`;

        const demands = [
          `Refineries in this sector are parched for raw Silicate Ores and Heavy Metals. We are paying a 25% premium on raw planetary samples.`,
          `Exotic Bio-Samples from temperate flora fetch peak margins at frontier research labs. Don't sell them for standard scrap!`,
          `Atmospheric filters and hyper-alloy casings are in short supply following recent expansion efforts in ${sysName}.`,
          `Smelted alloys from our fabricators command lucrative buy orders in the agricultural habitats two systems over.`,
          `Energy cells and deuterium canisters are trading at baseline parity. If you have salvage electronics, convert them in the fabricator first.`,
          `Local prospectors just struck a rich vein of crystalline carbon. Crystal prices have dipped slightly, but demand for structural plating has surged.`,
        ];

        const tips = [
          `Tip: Always process raw minerals in the fabricator before export to double your credit margins.`,
          `Rumor has it an independent freighter was offering 300 CR per unit of rare botanical resin near the rim.`,
          `Keep your cargo bay secured; fluctuating tariffs make bulk trading volatile without up-to-date cartography data.`,
          `The commodity exchange resets its spot prices with each incoming planetary shuttle cycle.`,
        ];

        const d = this.pickItem(demands, seed);
        const tip = this.pickItem(tips, seed + 3);
        replyText = `${d} ${tip}`;
        break;
      }

      case 'customs_lore': {
        pilotText = isStation
          ? `Requesting outpost charter archives, station history, and notable past events.`
          : `Inquiring about your vessel's origin, charter lineage, and deep-space voyages.`;

        // Multi-tier sequential lore reveals deeper secrets on repeat queries
        const tier = count % 3;

        if (tier === 0) {
          // Chronicle I: Official History & Architecture
          if (target.baseLore) {
            replyText = target.baseLore;
          } else {
            const foundations = [
              `Constructed during the Third Expansion wave, this outpost was originally anchored to survey planetary fault lines before growing into a permanent haven.`,
              `Commissioned by the Allied Stellar Syndicate as an automated way-station, our facility was refitted with modular habitations after the Core collapse.`,
              `Our keel was laid forty solar cycles ago in the Jovian orbital yards. She was built with reinforced titanium bulkheads to survive uncharted jumps.`,
              `Originally an independent listening post monitoring radio silence, this structure now shelters wanderers and free navigators alike.`,
            ];
            replyText = this.pickItem(foundations, seed);
          }
        } else if (tier === 1) {
          // Chronicle II: Local Legends & Oddities
          const legends = [
            `Old logs speak of a silent vessel without drive plumes that drifted past this system's outer moon seven cycles ago. When our sensors pinged it, our entire communications array chimed in unison.`,
            `The miners swear that on quiet nights, the station framework catches an infrasonic hum echoing from the deep mantle of the inner terrestrial world. We call it the 'Hollow Song'.`,
            `Two years back, a solitary scout arrived with its hull etched in unfamiliar geometric fractals. The pilot never said where they charted them, only left coordinates pointing toward the void.`,
            `Before our current crew arrived, the derelict section on Deck 9 was sealed off. Some say a prototype warp core collapsed there, folding a pocket of silence into the hull.`,
          ];
          replyText = `[ARCHIVE CHRONICLE II] ${this.pickItem(legends, seed + 5)}`;
        } else {
          // Chronicle III: Deep Void Lore
          const deepLore = [
            `Beyond the charted lanes lies the true quiet. When you turn off your main reactor and drift between the star clusters, the sensors pick up faint harmonic resonances older than our galaxy.`,
            `The earliest navigators did not conquer the stars with raw thrust; they learned to listen to the gravimetric tides. Every solar flare, every orbital dance is part of a grand celestial mechanism.`,
            `They say the universe was once filled with deafening starfire, but in this epoch, it has grown peaceful and still. That stillness is not emptiness — it is a sanctuary waiting to be charted.`,
            `According to ancient starfarer fragments, the harmonic relays found across uncharted sectors were left behind to measure how long it takes for conscious life to look up and understand the silence.`,
          ];
          replyText = `[ARCHIVE CHRONICLE III — DEEP SPACE MEMOIRS] ${this.pickItem(deepLore, seed + 7)}`;
        }
        break;
      }

      case 'auxiliary_support': {
        pilotText = isStation
          ? `Requesting station automated diagnostic sweep, power link, and shield harmonics check.`
          : `Requesting ship-to-ship diagnostic handshake and propulsion telemetry calibration.`;

        const diagnostics = [
          `Umbilical hookup verified. Main capacitor bank recharged to 100%. Deflector harmonic frequencies tuned to local cosmic radiation levels.`,
          `Auxiliary telemetry handshake complete. Attitude thruster nozzles calibrated; zero propellant residue detected. Your sub-light drive is running at peak efficiency.`,
          `Diagnostic sweep finished. Inertial dampener fluid density is nominal. Gravimetric sensors adjusted for local planetary mass centers.`,
          `Power feed connected. Thermal radiators purged of excess heat build-up. Kinetic shield envelope verified against debris impacts.`,
          `Diagnostic sweep clean. Your ship's life support scrubbers and atmospheric compression valves are functioning within optimal tolerances.`,
        ];

        const notes = [
          `All systems green. May your voyages be peaceful and steady.`,
          `Docking clamp release buffers primed whenever you are ready to disengage.`,
          `Telemetry package logged to flight computer. You're clear for deep cruise.`,
          `Safe travels through the stars, Commander.`,
        ];

        const d = this.pickItem(diagnostics, seed);
        const n = this.pickItem(notes, seed + 2);
        replyText = `${d} ${n}`;
        break;
      }

      case 'deep_space_rumors': {
        pilotText = isStation
          ? `Inquiring about anomalous sensor contacts, uncharted beacons, or deep-space rumors.`
          : `Sharing subspace chatter: what anomalous whispers or derelict signals have you intercepted?`;

        const rumors = [
          `Long-range arrays picked up a rhythmic subspace chirp radiating from the twilight hemisphere of the outermost planet. It matches no known commercial beacon.`,
          `A nomadic prospector claimed they discovered an ancient planetary monolith on a tidally locked moon nearby, pulsing with faint bioluminescent moss.`,
          `We intercepted ghost telemetry from a cargo container that escaped a gravity slingshot three sectors back. It might still be adrift in high orbit.`,
          `Stellar cartographers report an uncharted crystalline asteroid cluster trailing behind the main comet path. High concentrations of rare optical minerals suspected.`,
          `Subspace comms caught faint, distorted harmonics echoing through the jump gates. Some say it's sensor static; others believe something is listening from the deep dark.`,
          `A decommissioned survey probe is reportedly trapped in a stable Lagrange orbit near the inner gas giant. Its memory core may hold uncatalogued star charts.`,
        ];

        const coordinates = [
          `Estimated bearing: 247° ecliptic, distance ~8,400 AU.`,
          `Last known vector: High polar inclination, negative Z-axis.`,
          `Frequency modulation: 1420.405 MHz narrowband.`,
          `Estimated drift speed: 45 m/s retrograde.`,
        ];

        const r = this.pickItem(rumors, seed);
        const c = this.pickItem(coordinates, seed + 4);
        replyText = `${r} [TELEMETRY ESTIMATE: ${c}]`;
        break;
      }
    }

    return {
      pilotText,
      replyText,
      speaker,
      personality,
    };
  }
}
