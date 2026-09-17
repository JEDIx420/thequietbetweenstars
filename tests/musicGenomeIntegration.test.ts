import { describe, it, expect } from 'vitest';
import { ProceduralMusicGenome } from '../src/audio/ProceduralMusicGenome';
import { HarmonyHelper } from '../src/audio/HarmonyHelper';

describe('ProceduralMusicGenome & HarmonyHelper Integration', () => {
  describe('Determinism and Variety', () => {
    it('produces strictly identical genome for the same system seed', () => {
      const g1 = ProceduralMusicGenome.generateGenome(42077);
      const g2 = ProceduralMusicGenome.generateGenome(42077);

      expect(g1.rootNote).toBe(g2.rootNote);
      expect(g1.scaleType).toBe(g2.scaleType);
      expect(g1.bpm).toBe(g2.bpm);
      expect(g1.progression).toEqual(g2.progression);
      expect(g1.arpPattern).toEqual(g2.arpPattern);
      expect(g1.brightness).toBe(g2.brightness);
      expect(g1.ambientTension).toBe(g2.ambientTension);
    });

    it('produces meaningfully different musical identities across different seeds', () => {
      const gA = ProceduralMusicGenome.generateGenome(1001);
      const gB = ProceduralMusicGenome.generateGenome(9999);
      const gC = ProceduralMusicGenome.generateGenome(54321);

      // Verify seeds differ in at least one core property
      const diff1 = gA.rootNote !== gB.rootNote || gA.scaleType !== gB.scaleType || gA.bpm !== gB.bpm;
      const diff2 = gB.rootNote !== gC.rootNote || gB.scaleType !== gC.scaleType || gB.bpm !== gC.bpm;

      expect(diff1).toBe(true);
      expect(diff2).toBe(true);
    });
  });

  describe('HarmonyHelper.parseChordToNotes', () => {
    it('parses major and minor seventh chords correctly', () => {
      const cMaj7 = HarmonyHelper.parseChordToNotes('Cmaj7', 3);
      expect(cMaj7).toEqual(['C3', 'E3', 'G3', 'B3']);

      const aMin7 = HarmonyHelper.parseChordToNotes('Am7', 3);
      expect(aMin7).toEqual(['A3', 'C4', 'E4', 'G4']);
    });

    it('parses suspended and ninth chords correctly', () => {
      const gSus4 = HarmonyHelper.parseChordToNotes('Gsus4', 3);
      expect(gSus4).toEqual(['G3', 'C4', 'D4']);

      const dMaj9 = HarmonyHelper.parseChordToNotes('Dmaj9', 3);
      expect(dMaj9).toEqual(['D3', 'F#3', 'A3', 'C#4', 'E4']);
    });

    it('handles flat and sharp roots gracefully', () => {
      const ebMaj7 = HarmonyHelper.parseChordToNotes('Ebmaj7', 3);
      expect(ebMaj7[0]).toBe('Eb3');

      const fSharpMin = HarmonyHelper.parseChordToNotes('F#m', 3);
      expect(fSharpMin[0]).toBe('F#3');
    });

    it('falls back to major triad for unrecognized quality or malformed strings', () => {
      const fallback = HarmonyHelper.parseChordToNotes('XYZ', 3);
      expect(fallback.length).toBeGreaterThan(0);
      expect(fallback[0]).toBe('C3');
    });
  });

  describe('HarmonyHelper.getScaleNotes', () => {
    it('generates multi-octave scale notes for arpeggio synthesis', () => {
      const notes = HarmonyHelper.getScaleNotes('C', 'pentatonic', [3, 4]);
      expect(notes.length).toBe(10);
      expect(notes[0]).toBe('C3');
      expect(notes[5]).toBe('C4');
    });
  });
});
