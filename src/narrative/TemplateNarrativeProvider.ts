import type {
  NarrativeTextProvider,
  NarrativeEvent,
  NarrativeContext,
  NarrativeLine,
} from './NarrativeTypes';

export class TemplateNarrativeProvider implements NarrativeTextProvider {
  private speakerName = 'SHIP COMPUTER';

  public async generate(
    event: NarrativeEvent,
    _context: NarrativeContext
  ): Promise<NarrativeLine[]> {
    const facts = event.facts;

    switch (event.type) {
      case 'first_wake':
        return [
          {
            speaker: this.speakerName,
            text: 'Guidance and life support restabilized. Primary reactor humming at 99.4% nominal.',
            durationMs: 4200,
            audioTone: 'chime',
          },
          {
            speaker: this.speakerName,
            text: 'We are in deep orbit. No urgent mission logged. Pick a heading whenever you are ready.',
            durationMs: 4400,
            audioTone: 'normal',
          },
        ];

      case 'first_steer':
        return [
          {
            speaker: this.speakerName,
            text: 'Attitude thrusters firing cleanly. Pitch and yaw responsive.',
            durationMs: 3400,
            audioTone: 'normal',
          },
        ];

      case 'first_throttle':
        return [
          {
            speaker: this.speakerName,
            text: 'Main drive engaged. Inertial dampeners holding. We remain alive — always promising.',
            durationMs: 3800,
            audioTone: 'normal',
          },
        ];

      case 'first_scan':
        return [
          {
            speaker: this.speakerName,
            text: 'Sub-space acoustic ping emitted. The quiet between stars is never quite as empty as it looks.',
            durationMs: 4000,
            audioTone: 'normal',
          },
        ];

      case 'first_target_selected': {
        const targetName = facts.targetName || 'local body';
        return [
          {
            speaker: this.speakerName,
            text: `Navigation locked on ${targetName}. Telemetry vector projected onto local radar.`,
            durationMs: 3800,
            audioTone: 'normal',
          },
        ];
      }

      case 'first_map_open':
        return [
          {
            speaker: this.speakerName,
            text: 'Stellar cartography online. Every light out there is a reachable system. Take your time.',
            durationMs: 4200,
            audioTone: 'chime',
          },
        ];

      case 'course_set': {
        const dest = facts.systemName || 'target star';
        const dist = facts.distance ? `${facts.distance} sectors away` : 'remote coords';
        return [
          {
            speaker: this.speakerName,
            text: `Course plotted for ${dest} (${dist}). Warp coordinates locked.`,
            durationMs: 3600,
            audioTone: 'chime',
          },
        ];
      }

      case 'deep_cruise_start': {
        const dest = facts.systemName || 'destination';
        return [
          {
            speaker: this.speakerName,
            text: `Warp coils energized. Entering Deep Cruise to ${dest}. Enjoy the view.`,
            durationMs: 3800,
            audioTone: 'normal',
          },
        ];
      }

      case 'deep_cruise_arrival': {
        const sys = facts.systemName || 'unnamed star';
        const count = facts.planetCount ?? 'several';
        return [
          {
            speaker: this.speakerName,
            text: `Dropping out of warp. Welcome to ${sys}. Sensor array registers ${count} orbital bodies.`,
            durationMs: 4200,
            audioTone: 'chime',
          },
        ];
      }

      case 'planet_approach': {
        const name = facts.planetName || 'planet';
        const type = facts.planetType || 'terrestrial';
        return [
          {
            speaker: this.speakerName,
            text: `Entering gravity well of ${name}. Surface profile reads as ${type}.`,
            durationMs: 3800,
            audioTone: 'normal',
          },
        ];
      }

      case 'orbit_established': {
        const name = facts.planetName || 'world';
        return [
          {
            speaker: this.speakerName,
            text: `Stable orbit confirmed around ${name}. Regional survey sensors calibrated.`,
            durationMs: 3600,
            audioTone: 'chime',
          },
        ];
      }

      case 'surface_landing': {
        const region = facts.regionName || 'local sector';
        const atmo = facts.hasAtmosphere ? 'Atmosphere stable.' : 'Hard vacuum.';
        return [
          {
            speaker: this.speakerName,
            text: `Touchdown envelope reached in ${region}. ${atmo} Surface scanners online.`,
            durationMs: 4000,
            audioTone: 'normal',
          },
        ];
      }

      case 'scanned_flora': {
        const name = facts.name || 'specimen';
        return [
          {
            speaker: this.speakerName,
            text: `Vegetation logged: ${name}. Endemic bio-luminescence catalogued in Ship Log.`,
            durationMs: 3800,
            audioTone: 'normal',
          },
        ];
      }

      case 'scanned_fauna': {
        const name = facts.name || 'creature';
        const diet = facts.diet ? `Diet appears to be ${facts.diet}.` : '';
        return [
          {
            speaker: this.speakerName,
            text: `Fauna contact logged: ${name}. ${diet} Adding specimen to expedition records.`,
            durationMs: 4000,
            audioTone: 'normal',
          },
        ];
      }

      case 'scanned_landmark': {
        const name = facts.name || 'formation';
        return [
          {
            speaker: this.speakerName,
            text: `Geological marker analyzed: ${name}. Acoustic echo indicates dense subterranean strata.`,
            durationMs: 3800,
            audioTone: 'normal',
          },
        ];
      }

      case 'scanned_anomaly': {
        const name = facts.name || 'deep space object';
        return [
          {
            speaker: this.speakerName,
            text: `Sensor anomaly logged: ${name}. Emitting low-frequency electromagnetic pulse.`,
            durationMs: 4000,
            audioTone: 'mystery',
          },
        ];
      }

      case 'resonance_first_hint':
        return [
          {
            speaker: this.speakerName,
            text: "That's odd. A non-random harmonic on the 1420 kHz band. My spectral tables cannot classify it.",
            durationMs: 4600,
            audioTone: 'mystery',
          },
          {
            speaker: this.speakerName,
            text: "Probably harmless stellar noise... though the interval was exactly prime.",
            durationMs: 4200,
            audioTone: 'mystery',
          },
        ];

      case 'resonance_second_hint':
        return [
          {
            speaker: this.speakerName,
            text: 'The exact same harmonic interval again. Two different sectors, identical frequency.',
            durationMs: 4400,
            audioTone: 'mystery',
          },
          {
            speaker: this.speakerName,
            text: 'I have archived the signal under "Resonance". Whatever it is, it is listening back.',
            durationMs: 4200,
            audioTone: 'mystery',
          },
        ];

      case 'ambient_deep_space':
        return [
          {
            speaker: this.speakerName,
            text: 'Sensors report quiet space. Millennia of silence, and we are flying right through it.',
            durationMs: 4000,
            audioTone: 'normal',
          },
        ];

      default:
        return [];
    }
  }
}
