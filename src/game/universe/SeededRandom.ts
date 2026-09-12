/**
 * Seeded Pseudo-Random Number Generator & Coordinate Hash Functions
 * Deterministic PRNG using Mulberry32 and 3D sector hash algorithms.
 */

export class SeededRandom {
  private seed: number;

  constructor(seed: number | string) {
    this.seed = typeof seed === 'string' ? SeededRandom.hashString(seed) : seed >>> 0;
  }

  /**
   * Generates a 32-bit integer hash from any string
   */
  public static hashString(str: string): number {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  /**
   * Deterministic hash combining a universe seed and 3D coordinates (x, y, z)
   */
  public static hashCoords(universeSeed: string | number, x: number, y: number, z: number): number {
    const base = typeof universeSeed === 'string' ? SeededRandom.hashString(universeSeed) : universeSeed >>> 0;
    let h = base ^ Math.imul(Math.floor(x), 73856093);
    h ^= Math.imul(Math.floor(y), 19349663);
    h ^= Math.imul(Math.floor(z), 83492791);
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  }

  /**
   * Returns a pseudo-random float in [0, 1) using Mulberry32
   */
  public next(): number {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns a pseudo-random float in [min, max)
   */
  public range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Returns a pseudo-random integer in [min, max] inclusive
   */
  public rangeInt(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /**
   * Randomly picks one item from an array
   */
  public pick<T>(items: readonly T[]): T {
    const idx = Math.floor(this.next() * items.length);
    return items[idx];
  }

  /**
   * Returns true with a given probability (0.0 to 1.0)
   */
  public chance(probability: number): boolean {
    return this.next() < probability;
  }
}
