import { SeededRandom } from '../game/universe/SeededRandom';

export interface SystemMusicGenome {
  seed: number;
  rootNote: string;
  scaleType: 'dorian' | 'lydian' | 'aeolian' | 'mixolydian' | 'pentatonic';
  bpm: number;
  progression: string[][];
  arpPattern: string[];
  ambientTension: number;
  brightness: number;
}

export class ProceduralMusicGenome {
  private static ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Eb', 'Ab', 'Bb', 'F#'];
  private static SCALES: SystemMusicGenome['scaleType'][] = [
    'lydian',
    'dorian',
    'aeolian',
    'mixolydian',
    'pentatonic',
  ];

  public static generateGenome(systemSeed: number): SystemMusicGenome {
    const rng = new SeededRandom(systemSeed + 555);

    const root = rng.pick(this.ROOTS);
    const scaleType = rng.pick(this.SCALES);
    const bpm = rng.rangeInt(84, 108);

    // Chords families
    const progressions: Record<SystemMusicGenome['scaleType'], string[][]> = {
      lydian: [
        [`${root}maj7`, `${root}maj9`, `Gmaj7`, `Amaj7`],
        [`${root}maj7`, `B7`, `Emaj7`, `${root}maj7`],
      ],
      dorian: [
        [`${root}m7`, `Fmaj7`, `G7`, `${root}m9`],
        [`${root}m7`, `Bbmaj7`, `C7`, `${root}m7`],
      ],
      aeolian: [
        [`${root}m7`, `Abmaj7`, `Ebmaj7`, `Bb7`],
        [`${root}m`, `Fm`, `Dbmaj7`, `Eb`],
      ],
      mixolydian: [
        [`${root}7`, `Fmaj7`, `Cmaj7`, `${root}sus4`],
        [`${root}7`, `Bbmaj7`, `F`, `${root}`],
      ],
      pentatonic: [
        [`${root}sus2`, `${root}add9`, `Fsus2`, `Gsus4`],
        [`${root}`, `C`, `D`, `${root}`],
      ],
    };

    const arpPatterns = [
      ['0', '4', '7', '11', '14'],
      ['0', '7', '12', '16', '19'],
      ['0', '2', '4', '7', '9'],
      ['0', '5', '7', '12', '17'],
    ];

    return {
      seed: systemSeed,
      rootNote: root,
      scaleType,
      bpm,
      progression: progressions[scaleType],
      arpPattern: rng.pick(arpPatterns),
      ambientTension: rng.range(0.1, 0.6),
      brightness: rng.range(0.3, 0.9),
    };
  }
}
