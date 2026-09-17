export class HarmonyHelper {
  private static readonly NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

  private static readonly ENHARMONICS: Record<string, string> = {
    'B#': 'C',
    'Db': 'C#',
    'D#': 'Eb',
    'Fb': 'E',
    'E#': 'F',
    'Gb': 'F#',
    'G#': 'Ab',
    'A#': 'Bb',
    'Cb': 'B',
  };

  private static readonly CHORD_INTERVALS: Record<string, number[]> = {
    'maj9': [0, 4, 7, 11, 14],
    'maj7(#11)': [0, 4, 7, 11, 18],
    'maj7': [0, 4, 7, 11],
    'm9': [0, 3, 7, 10, 14],
    'm7': [0, 3, 7, 10],
    'm': [0, 3, 7],
    '7': [0, 4, 7, 10],
    'sus4': [0, 5, 7],
    'sus2': [0, 2, 7],
    'add9': [0, 4, 7, 14],
    'dim': [0, 3, 6],
    'aug': [0, 4, 8],
    '': [0, 4, 7], // Major triad
  };

  private static readonly SCALE_INTERVALS: Record<string, number[]> = {
    lydian: [0, 2, 4, 6, 7, 9, 11],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    aeolian: [0, 2, 3, 5, 7, 8, 10],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    pentatonic: [0, 2, 4, 7, 9],
  };

  public static normalizeRoot(rawRoot: string): string {
    const clean = rawRoot.trim();
    if (this.ENHARMONICS[clean]) return this.ENHARMONICS[clean];
    return clean;
  }

  public static rootToIndex(root: string): number {
    const norm = this.normalizeRoot(root);
    const idx = this.NOTE_NAMES.indexOf(norm);
    return idx >= 0 ? idx : 0;
  }

  public static indexToRoot(idx: number): string {
    const norm = ((idx % 12) + 12) % 12;
    return this.NOTE_NAMES[norm];
  }

  /**
   * Converts semitone offset from a root note into pitch notation (e.g., 'C', 4, 3 -> 'E3')
   */
  public static semitoneToPitch(root: string, semitones: number, baseOctave = 3): string {
    const rootIdx = this.rootToIndex(root);
    const totalSemitones = rootIdx + semitones;
    const noteName = this.indexToRoot(totalSemitones);
    const octave = baseOctave + Math.floor(totalSemitones / 12);
    return `${noteName}${octave}`;
  }

  /**
   * Parses symbolic chord name (e.g. 'Cmaj7', 'F#m7', 'Eb', 'Gsus4') into Tone.js playable note array
   */
  public static parseChordToNotes(chordStr: string, baseOctave = 3): string[] {
    if (!chordStr || typeof chordStr !== 'string') {
      return [`C${baseOctave}`, `E${baseOctave}`, `G${baseOctave}`];
    }

    const trimmed = chordStr.trim();
    // Match Root: [A-G] optionally followed by # or b
    const match = trimmed.match(/^([A-G][#b]?)(.*)$/);
    if (!match) {
      return [`C${baseOctave}`, `E${baseOctave}`, `G${baseOctave}`];
    }

    const root = match[1];
    const quality = match[2];

    const intervals = this.CHORD_INTERVALS[quality] || this.CHORD_INTERVALS[''] || [0, 4, 7];
    return intervals.map(st => this.semitoneToPitch(root, st, baseOctave));
  }

  /**
   * Generates full scale notes across specified octaves for melodies and arpeggios
   */
  public static getScaleNotes(root: string, scaleType: string, octaves = [3, 4, 5]): string[] {
    const intervals = this.SCALE_INTERVALS[scaleType] || this.SCALE_INTERVALS['lydian'];
    const notes: string[] = [];

    for (const oct of octaves) {
      for (const st of intervals) {
        notes.push(this.semitoneToPitch(root, st, oct));
      }
    }

    return notes;
  }
}
