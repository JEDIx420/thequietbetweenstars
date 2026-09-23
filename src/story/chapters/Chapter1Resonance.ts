import type { StoryBeatId } from '../StoryTypes';

export interface BeatDefinition {
  id: StoryBeatId;
  chapter: number;
  title: string;
  objective: string;
  loreEntryId: string;
  dialogueSpeaker: string;
  dialogueLines: string[];
  codexReward?: {
    id: string;
    title: string;
    category: 'LORE' | 'ANOMALIES' | 'PEOPLES';
    content: string;
  };
}

export const CHAPTER_1_BEATS: Record<StoryBeatId, BeatDefinition> = {
  beat_0_awakening: {
    id: 'beat_0_awakening',
    chapter: 1,
    title: 'Subcarrier Whisper',
    objective: 'Review long-range telemetry on the navigation console.',
    loreEntryId: 'log_awakening',
    dialogueSpeaker: 'Ship Interface: Mnemosyne',
    dialogueLines: [
      'Diagnostic complete. All primary maneuvering thrusters nominal.',
      'Notice: A persistent ultra-low frequency carrier wave has been detected modulating the local hyperlane grid.',
      'It is mathematically structured. Not stellar noise. A harmonic echo exists in this sector.',
    ],
    codexReward: {
      id: 'codex_the_quiet_intro',
      title: 'The Great Silence & The Subcarrier',
      category: 'LORE',
      content:
        'Between the stars lies a profound stillness. Yet beneath the vacuum noise, an ancient harmonic carrier wave hums across specific frequencies—a silent lattice left by the First Builders.',
    },
  },

  beat_1_first_whisper: {
    id: 'beat_1_first_whisper',
    chapter: 1,
    title: 'First Whisper',
    objective: 'Locate and synchronize with Resonance Monolith Prime in the Solara system.',
    loreEntryId: 'log_first_whisper',
    dialogueSpeaker: 'Ship Interface: Mnemosyne',
    dialogueLines: [
      'Target acquired ahead: Resonance Monolith Prime. Sensor array indicates an acoustic resonance monolith.',
      'Close distance within 1500m to execute multi-stage harmonic probe and recover structural telemetry.',
    ],
    codexReward: {
      id: 'codex_fragment_alpha',
      title: 'Fragment α: Echo of the First Builders',
      category: 'ANOMALIES',
      content:
        'Recovered from a deep space crystalline obelisk. The fragment vibrates at 432.8 Hz. Encoded within its lattice is a navigational vector pointing toward a frontier research station.',
    },
  },

  beat_2_station_contact: {
    id: 'beat_2_station_contact',
    chapter: 1,
    title: 'Sanctuary in the Dark',
    objective: 'Navigate to Research Outpost Epsilon-7 and dock at Bay 03.',
    loreEntryId: 'log_station_contact',
    dialogueSpeaker: 'Station Traffic Control',
    dialogueLines: [
      'Approaching vessel, you are cleared for docking bay 3 at Research Outpost Epsilon-7.',
      'Dr. Vance in the Signal Lab reports telemetry congruence with your incoming telemetry signature.',
    ],
  },

  beat_3_fragment_alpha: {
    id: 'beat_3_fragment_alpha',
    chapter: 1,
    title: 'The Missing Cadence',
    objective: 'Locate Derelict Survey Craft Alpha-9 and extract Fragment β.',
    loreEntryId: 'log_fragment_beta_hunt',
    dialogueSpeaker: 'Dr. Valeria Vance',
    dialogueLines: [
      'You found an intact Builder echo shard? Incredible... the crystalline lattice is pristine.',
      'However, this harmonic wave is only half the chord. An old survey recon craft, Derelict Survey Craft Alpha-9, went dark near the outer system.',
      'If you can scan its flight recorder, we can synthesize both fragments into a navigational key.',
    ],
  },

  beat_4_decryption: {
    id: 'beat_4_decryption',
    chapter: 1,
    title: 'Harmonic Synthesis',
    objective: 'Access the Signal Lab at Research Outpost Epsilon-7 to decrypt the combined fragments.',
    loreEntryId: 'log_harmonic_synthesis',
    dialogueSpeaker: 'Dr. Valeria Vance',
    dialogueLines: [
      'Both fragments are synchronizing on the spectrometer! Look at the interference fringes...',
      'It is not a message. It is an alignment frequency for an ancient gateway.',
      'Decrypting coordinates now... Uplink transferred to your navigational computer.',
    ],
    codexReward: {
      id: 'codex_fragment_beta',
      title: 'Fragment β: Derelict Survey Core',
      category: 'ANOMALIES',
      content:
        'The flight logs of Survey Craft Alpha-9. Its final telemetry recorded the exact resonant frequency (528.0 Hz) needed to unlock the ancient harmonic relay spires.',
    },
  },

  beat_5_relay_coordinates: {
    id: 'beat_5_relay_coordinates',
    chapter: 1,
    title: 'The Spires of the Quiet',
    objective: 'Warp to the coordinates of the First Harmonic Relay: Spires of the Quiet in deep space.',
    loreEntryId: 'log_relay_approach',
    dialogueSpeaker: 'Ship Interface: Mnemosyne',
    dialogueLines: [
      'We have arrived at the designated coordinates. Megastructure detected: First Harmonic Relay: Spires of the Quiet.',
      'A massive ancient relay floating in gravitational equilibrium. Three resonance spires surround the central gateway.',
      'Warning: An unidentified alien starship is decelerating on an intercept vector.',
    ],
  },

  beat_6_relay_alignment: {
    id: 'beat_6_relay_alignment',
    chapter: 1,
    title: 'Nomad of the Deep',
    objective: 'Hail Captain Zephyr of The Wanderer-7, then align all 3 relay pillars.',
    loreEntryId: 'log_zephyr_contact',
    dialogueSpeaker: 'Captain Zephyr',
    dialogueLines: [
      'Peace to your journey, wanderer. I am Zephyr of the Roaming Wings.',
      'We have watched these dormant spires sleep for three generations of our elders.',
      'You carry the harmonic frequencies of the builders. Approach each pillar and resonate with its tuning frequency.',
    ],
    codexReward: {
      id: 'codex_zephyr_nomads',
      title: 'The Roaming Wings & Captain Zephyr',
      category: 'PEOPLES',
      content:
        'A starfaring civilization of avian nomads who follow the ancient resonance currents of the galaxy. They seek harmony with celestial titans rather than technological dominion.',
    },
  },

  beat_7_chapter1_climax: {
    id: 'beat_7_chapter1_climax',
    chapter: 1,
    title: 'The Gateway Hums',
    objective: 'Witness the activation of the First Harmonic Relay.',
    loreEntryId: 'log_chapter1_climax',
    dialogueSpeaker: 'Captain Zephyr',
    dialogueLines: [
      'The song is rekindled! Listen... the quiet is no longer empty.',
      'The beam points toward the Core Veil. Take this tuning drive, explorer. The galaxy is waking.',
    ],
    codexReward: {
      id: 'codex_harmonic_relay_awakening',
      title: 'The First Harmonic Relay Awakening',
      category: 'LORE',
      content:
        'With all three spires synchronized, the First Harmonic Relay discharged a focused tachyon harmonic pulse towards the galactic center. Chapter 1 concluded; the journey deepens.',
    },
  },
};
