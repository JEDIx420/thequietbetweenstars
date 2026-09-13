import { SeededRandom } from '../universe/SeededRandom';

/**
 * Fast 2D Simplex / Gradient Noise and Fractal Brownian Motion (fBm)
 * Fully deterministic based on integer seed.
 */
export class SimplexNoise2D {
  private perm: Uint8Array;
  private permMod12: Uint8Array;

  // 2D Simplex skewing and unskewing factors
  private static readonly F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
  private static readonly G2 = (3.0 - Math.sqrt(3.0)) / 6.0;

  // Gradients for 2D
  private static readonly grad2: ReadonlyArray<[number, number]> = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707],
  ];

  constructor(seed: number = 1337) {
    const rng = new SeededRandom(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      p[i] = i;
    }
    // Fisher-Yates shuffle
    for (let i = 255; i > 0; i--) {
      const j = rng.rangeInt(0, i);
      const temp = p[i];
      p[i] = p[j];
      p[j] = temp;
    }

    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  /**
   * 2D Simplex noise in range [-1, 1]
   */
  public noise2D(xin: number, yin: number): number {
    let n0 = 0, n1 = 0, n2 = 0;

    // Skew the input space to determine which simplex cell we're in
    const s = (xin + yin) * SimplexNoise2D.F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * SimplexNoise2D.G2;
    const X0 = i - t; // Unskew the cell origin back to (x,y) space
    const Y0 = j - t;
    const x0 = xin - X0; // The x,y distances from the cell origin
    const y0 = yin - Y0;

    // Determine which simplex we are in
    let i1 = 0, j1 = 0;
    if (x0 > y0) {
      i1 = 1;
      j1 = 0;
    } else {
      i1 = 0;
      j1 = 1;
    }

    const x1 = x0 - i1 + SimplexNoise2D.G2;
    const y1 = y0 - j1 + SimplexNoise2D.G2;
    const x2 = x0 - 1.0 + 2.0 * SimplexNoise2D.G2;
    const y2 = y0 - 1.0 + 2.0 * SimplexNoise2D.G2;

    const ii = i & 255;
    const jj = j & 255;

    // Calculate contribution from each corner
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const gi0 = this.permMod12[ii + this.perm[jj]];
      t0 *= t0;
      n0 = t0 * t0 * (SimplexNoise2D.grad2[gi0][0] * x0 + SimplexNoise2D.grad2[gi0][1] * y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const gi1 = this.permMod12[ii + i1 + this.perm[jj + j1]];
      t1 *= t1;
      n1 = t1 * t1 * (SimplexNoise2D.grad2[gi1][0] * x1 + SimplexNoise2D.grad2[gi1][1] * y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const gi2 = this.permMod12[ii + 1 + this.perm[jj + 1]];
      t2 *= t2;
      n2 = t2 * t2 * (SimplexNoise2D.grad2[gi2][0] * x2 + SimplexNoise2D.grad2[gi2][1] * y2);
    }

    // Scale result to [-1, 1]
    return 70.0 * (n0 + n1 + n2);
  }

  /**
   * Fractal Brownian Motion (Multi-octave noise)
   */
  public fbm2D(x: number, y: number, octaves: number = 4, lacunarity: number = 2.0, gain: number = 0.5): number {
    let total = 0;
    let amplitude = 1.0;
    let frequency = 1.0;
    let maxVal = 0;

    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * frequency, y * frequency) * amplitude;
      maxVal += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }

    return total / maxVal;
  }

  /**
   * Ridged multifractal noise (generates sharp mountain ridges, canyon crests, and ice crevasses)
   */
  public ridged2D(x: number, y: number, octaves: number = 4, lacunarity: number = 2.0, gain: number = 0.5): number {
    let total = 0;
    let amplitude = 1.0;
    let frequency = 1.0;
    let maxVal = 0;

    for (let i = 0; i < octaves; i++) {
      let n = Math.abs(this.noise2D(x * frequency, y * frequency));
      n = 1.0 - n; // Invert so peaks are sharp ridges
      n = n * n;   // Sharpen crests
      total += n * amplitude;
      maxVal += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }

    return total / maxVal;
  }

  /**
   * Quantized stepped terracing (perfect for layered mesas and volcanic basalt plateaus)
   */
  public static terrace(elevation: number, steps: number = 4, sharpness: number = 0.85): number {
    const s = elevation * steps;
    const f = Math.floor(s);
    const frac = s - f;
    const smoothFrac = Math.pow(frac, sharpness);
    return (f + smoothFrac) / steps;
  }
}
