import { SeededRandom } from '../game/universe/SeededRandom';
import { HarmonyHelper } from './HarmonyHelper';

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
    const bpm = rng.rangeInt(88, 104);

    // Diatonic transposed roots for pure in-key harmonic bliss
    const r0 = root;
    const r2 = HarmonyHelper.transposeRoot(root, 2);  // ii / 2nd
    const r5 = HarmonyHelper.transposeRoot(root, 5);  // IV / 4th (the soaring lift)
    const r7 = HarmonyHelper.transposeRoot(root, 7);  // V / 5th (bright energy)
    const r9 = HarmonyHelper.transposeRoot(root, 9);  // vi / 6th (warm relative minor)

    // Strictly uplifting, vibey, lush chord progressions for every scale type
    const progressions: Record<SystemMusicGenome['scaleType'], string[][]> = {
      lydian: [
        // The soaring celestial lift: IVmaj9 -> Imaj9 -> vi9 -> Vadd9
        [`${r5}maj9`, `${r0}maj9`, `${r9}m9`, `${r7}add9`],
        // Pure floating awe: Imaj7 -> IVmaj9 -> Iadd9 -> Vsus4
        [`${r0}maj7`, `${r5}maj9`, `${r0}add9`, `${r7}sus4`],
      ],
      pentatonic: [
        // Sunny chillwave bliss: Iadd9 -> IVmaj7 -> vi7 -> Vsus4
        [`${r0}add9`, `${r5}maj7`, `${r9}m7`, `${r7}sus4`],
        // Golden-hour groove: IVmaj7 -> Imaj7 -> vi7 -> Iadd9
        [`${r5}maj7`, `${r0}maj7`, `${r9}m7`, `${r0}add9`],
      ],
      mixolydian: [
        // Energetic wonder: Imaj9 -> IVmaj7 -> Vadd9 -> Iadd9
        [`${r0}maj9`, `${r5}maj7`, `${r7}add9`, `${r0}add9`],
        // Soaring discovery: Iadd9 -> Vsus4 -> IVmaj7 -> Imaj9
        [`${r0}add9`, `${r7}sus4`, `${r5}maj7`, `${r0}maj9`],
      ],
      dorian: [
        // French-touch / chillout groove: IVmaj9 -> vi9 -> Imaj7 -> Vadd9
        [`${r5}maj9`, `${r9}m9`, `${r0}maj7`, `${r7}add9`],
        // Smooth space cruise: Imaj9 -> IVmaj7 -> ii7 -> Vsus4
        [`${r0}maj9`, `${r5}maj7`, `${r2}m7`, `${r7}sus4`],
      ],
      aeolian: [
        // Emotional sunrise (dream pop): IVmaj7 -> Vadd9 -> vi9 -> Imaj9
        [`${r5}maj7`, `${r7}add9`, `${r9}m9`, `${r0}maj9`],
        // Expansive horizon: vi9 -> IVmaj9 -> Imaj9 -> Vadd9
        [`${r9}m9`, `${r5}maj9`, `${r0}maj9`, `${r7}add9`],
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
      ambientTension: rng.range(0.1, 0.35),
      brightness: rng.range(0.55, 0.95),
    };
  }
}
