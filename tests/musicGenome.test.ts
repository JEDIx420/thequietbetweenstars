import { describe, it, expect } from 'vitest';
import { ProceduralMusicGenome } from '../src/audio/ProceduralMusicGenome';

describe('Procedural Music Genome Generator', () => {
  it('deterministically generates matching music genome for identical seed', () => {
    const genomeA = ProceduralMusicGenome.generateGenome(1337);
    const genomeB = ProceduralMusicGenome.generateGenome(1337);

    expect(genomeA.seed).toBe(genomeB.seed);
    expect(genomeA.rootNote).toBe(genomeB.rootNote);
    expect(genomeA.scaleType).toBe(genomeB.scaleType);
    expect(genomeA.bpm).toBe(genomeB.bpm);
    expect(genomeA.arpPattern).toEqual(genomeB.arpPattern);
    expect(genomeA.progression).toEqual(genomeB.progression);
  });

  it('generates musical traits within aesthetic boundaries', () => {
    const genome = ProceduralMusicGenome.generateGenome(8080);

    expect(genome.rootNote).toBeTruthy();
    expect(genome.bpm).toBeGreaterThanOrEqual(84);
    expect(genome.bpm).toBeLessThanOrEqual(108);
    expect(genome.progression.length).toBeGreaterThan(0);
    expect(genome.ambientTension).toBeGreaterThanOrEqual(0.1);
    expect(genome.ambientTension).toBeLessThanOrEqual(0.6);
  });
});
