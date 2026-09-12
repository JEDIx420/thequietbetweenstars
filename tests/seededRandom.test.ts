import { describe, it, expect } from 'vitest';
import { SeededRandom } from '../src/game/universe/SeededRandom';

describe('SeededRandom PRNG', () => {
  it('generates reproducible sequences with identical seeds', () => {
    const rng1 = new SeededRandom('QUIET-TEST-SEED');
    const rng2 = new SeededRandom('QUIET-TEST-SEED');

    const seq1 = [rng1.next(), rng1.next(), rng1.next(), rng1.rangeInt(10, 50)];
    const seq2 = [rng2.next(), rng2.next(), rng2.next(), rng2.rangeInt(10, 50)];

    expect(seq1).toEqual(seq2);
  });

  it('produces distinct sequences with different seeds', () => {
    const rng1 = new SeededRandom('SEED-ALPHA');
    const rng2 = new SeededRandom('SEED-BETA');

    expect(rng1.next()).not.toEqual(rng2.next());
  });

  it('generates stable 3D coordinate hashes', () => {
    const h1 = SeededRandom.hashCoords('UNIVERSE-01', 14, -8, 22);
    const h2 = SeededRandom.hashCoords('UNIVERSE-01', 14, -8, 22);
    const h3 = SeededRandom.hashCoords('UNIVERSE-01', 14, -8, 23);

    expect(h1).toEqual(h2);
    expect(h1).not.toEqual(h3);
  });
});
