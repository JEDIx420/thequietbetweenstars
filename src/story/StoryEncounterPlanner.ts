import type { StarSystemDescriptor, SpaceAnomalyDescriptor } from '../game/systems/PlanetDescriptor';
import type { StoryDirector } from './StoryDirector';

export interface PlannedStoryInjection {
  injectedAnomalies: SpaceAnomalyDescriptor[];
  injectedStation?: {
    id: string;
    name: string;
    faction: string;
    position: { x: number; y: number; z: number };
    services: ('signal_lab' | 'concourse' | 'archive' | 'dockyard' | 'supply')[];
  };
  injectedVessel?: {
    id: string;
    name: string;
    captainName: string;
    silhouetteType: 'avian_solar_sail' | 'organic_bio_hull' | 'counter_rotating_rings';
    position: { x: number; y: number; z: number };
  };
  injectedRelay?: {
    id: string;
    position: { x: number; y: number; z: number };
    name: string;
  };
}

export class StoryEncounterPlanner {
  public static planSystem(
    system: StarSystemDescriptor,
    storyDirector: StoryDirector
  ): PlannedStoryInjection {
    const state = storyDirector.getState();
    const result: PlannedStoryInjection = {
      injectedAnomalies: [],
    };

    // Beat 0 -> Beat 1 transition
    if (state.currentBeat === 'beat_0_awakening') {
      storyDirector.advanceBeat('beat_1_first_whisper');
    }

    // Beat 1: First Resonance Whisper (Fragment Alpha)
    if (state.currentBeat === 'beat_1_first_whisper') {
      const alreadyHasResonance = (system.anomalies || []).some((a) => a.signature?.isResonanceAnomaly);
      if (!alreadyHasResonance || storyDirector.shouldInjectStoryAnomaly()) {
        const alphaAnomaly: SpaceAnomalyDescriptor = {
          id: 'story_anom_resonance_alpha',
          name: 'Resonance Monolith Prime',
          type: 'RESONANCE_ECHO',
          distanceFromStar: 1200,
          angle: 1.0,
          position: { x: 1200, y: 150, z: -1800 },
          color: '#38bdf8',
          radius: 45,
          loreNote: 'A crystalline structure vibrating in perfect harmonic resonance with the hyperlane network.',
          description: 'A crystalline structure vibrating in perfect harmonic resonance with the hyperlane network.',
          scanned: false,
          hasResonance: true,
          discovered: false,
          signature: {
            frequency: 432.8,
            intensity: 0.95,
            harmonicPattern: 'Phi-1.618-Harmonic',
            isResonanceAnomaly: true,
            tier: 1,
            frequencyLabel: '432.8 Hz',
            baseValue: 400,
            analysisSummary: 'Primary Harmonic Echo Shard. Contains fragmented builder telemetry.',
          },
        };
        result.injectedAnomalies.push(alphaAnomaly);
        storyDirector.resetSoftGuarantee();
      }
    }

    // Beat 2 or beyond: Deep Space Research Outpost Epsilon-7
    // Station is accessible once player discovers first whisper or beyond
    if (state.currentBeat !== 'beat_0_awakening' && state.currentBeat !== 'beat_1_first_whisper') {
      result.injectedStation = {
        id: 'station_epsilon_7',
        name: 'Research Outpost Epsilon-7',
        faction: 'Frontier Signal Collective',
        position: { x: -2400, y: 320, z: 1600 },
        services: ['signal_lab', 'concourse', 'archive', 'dockyard', 'supply'],
      };
    }

    // Beat 3: Derelict Survey Craft (Fragment Beta)
    if (state.currentBeat === 'beat_3_fragment_alpha') {
      const hasBeta = state.resonanceFragments.some((f) => f.id === 'fragment_beta');
      if (!hasBeta) {
        const betaAnomaly: SpaceAnomalyDescriptor = {
          id: 'story_anom_derelict_beta',
          name: 'Derelict Survey Craft Alpha-9',
          type: 'DERELICT_PROBE',
          distanceFromStar: 2200,
          angle: 2.8,
          position: { x: -1600, y: -220, z: 2800 },
          color: '#f59e0b',
          radius: 35,
          loreNote: 'A battered deep-recon survey vessel adrift. Its core flight recorder is broadcasting an encrypted sub-band.',
          description: 'A battered deep-recon survey vessel adrift. Its core flight recorder is broadcasting an encrypted sub-band.',
          scanned: false,
          hasResonance: true,
          discovered: false,
          signature: {
            frequency: 528.0,
            intensity: 0.85,
            harmonicPattern: 'Sol-528-Cadence',
            isResonanceAnomaly: true,
            tier: 2,
            frequencyLabel: '528.0 Hz',
            baseValue: 600,
            analysisSummary: 'Derelict Survey Craft Alpha-9. Flight core holds Fragment Beta.',
          },
        };
        result.injectedAnomalies.push(betaAnomaly);
        storyDirector.resetSoftGuarantee();
      }
    }

    // Beat 5, 6, 7: First Harmonic Relay & The Wanderer-7
    if (
      state.currentBeat === 'beat_5_relay_coordinates' ||
      state.currentBeat === 'beat_6_relay_alignment' ||
      state.currentBeat === 'beat_7_chapter1_climax'
    ) {
      result.injectedRelay = {
        id: 'harmonic_relay_prime',
        name: 'First Harmonic Relay: Spires of the Quiet',
        position: state.harmonicRelayState.coordinates,
      };

      result.injectedVessel = {
        id: 'the_wanderer_7',
        name: 'The Wanderer-7',
        captainName: 'Captain Zephyr',
        silhouetteType: 'avian_solar_sail',
        position: {
          x: state.harmonicRelayState.coordinates.x + 300,
          y: state.harmonicRelayState.coordinates.y + 80,
          z: state.harmonicRelayState.coordinates.z - 450,
        },
      };
    }

    return result;
  }
}
