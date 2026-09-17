export interface ChunkHeightfield {
  cx: number;
  cz: number;
  minY: number;
  maxY: number;
  heights: Float32Array; // (segments + 1) x (segments + 1)
}

export class HeightfieldCache {
  public readonly chunkSize: number;
  public readonly segments: number;
  public readonly gridSize: number;
  public readonly cellStep: number;
  private maxCachedChunks: number;

  private cache: Map<string, ChunkHeightfield> = new Map();
  private generator: (x: number, z: number) => number;

  constructor(
    generator: (x: number, z: number) => number,
    chunkSize = 200,
    segments = 32,
    maxCachedChunks = 36
  ) {
    this.generator = generator;
    this.chunkSize = chunkSize;
    this.segments = segments;
    this.gridSize = segments + 1; // 33 for 32 segments
    this.cellStep = chunkSize / segments; // 6.25m
    this.maxCachedChunks = maxCachedChunks;
  }

  public getChunkKey(cx: number, cz: number): string {
    return `${cx}:${cz}`;
  }

  public getChunkHeightfield(cx: number, cz: number): ChunkHeightfield {
    const key = this.getChunkKey(cx, cz);
    const existing = this.cache.get(key);
    if (existing) {
      // Refresh LRU order
      this.cache.delete(key);
      this.cache.set(key, existing);
      return existing;
    }

    // Build heightfield for this chunk
    const count = this.gridSize * this.gridSize;
    const heights = new Float32Array(count);
    const originX = cx * this.chunkSize - this.chunkSize / 2;
    const originZ = cz * this.chunkSize - this.chunkSize / 2;

    let minY = Infinity;
    let maxY = -Infinity;

    for (let gz = 0; gz < this.gridSize; gz++) {
      const worldZ = originZ + gz * this.cellStep;
      for (let gx = 0; gx < this.gridSize; gx++) {
        const worldX = originX + gx * this.cellStep;
        const h = this.generator(worldX, worldZ);
        heights[gz * this.gridSize + gx] = h;
        if (h < minY) minY = h;
        if (h > maxY) maxY = h;
      }
    }

    const chunkData: ChunkHeightfield = { cx, cz, minY, maxY, heights };

    // Evict oldest if exceeding max capacity
    if (this.cache.size >= this.maxCachedChunks) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, chunkData);
    return chunkData;
  }

  public hasChunk(cx: number, cz: number): boolean {
    return this.cache.has(this.getChunkKey(cx, cz));
  }

  public insertChunk(
    cx: number,
    cz: number,
    heights: Float32Array,
    minY?: number,
    maxY?: number
  ): ChunkHeightfield {
    const key = this.getChunkKey(cx, cz);
    let min = minY;
    let max = maxY;
    if (min === undefined || max === undefined) {
      min = Infinity;
      max = -Infinity;
      for (let i = 0; i < heights.length; i++) {
        const h = heights[i];
        if (h < min) min = h;
        if (h > max) max = h;
      }
    }

    const chunkData: ChunkHeightfield = { cx, cz, minY: min, maxY: max, heights };

    if (this.cache.size >= this.maxCachedChunks) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, chunkData);
    return chunkData;
  }

  /**
   * Sample terrain height at arbitrary (x, z) world coordinates using bilinear interpolation
   * between the 4 nearest grid vertices of the cached chunk.
   */
  public sample(x: number, z: number): number {
    const cx = Math.round(x / this.chunkSize);
    const cz = Math.round(z / this.chunkSize);
    const chunk = this.getChunkHeightfield(cx, cz);

    const originX = cx * this.chunkSize - this.chunkSize / 2;
    const originZ = cz * this.chunkSize - this.chunkSize / 2;

    const relX = (x - originX) / this.cellStep;
    const relZ = (z - originZ) / this.cellStep;

    const gx0 = Math.max(0, Math.min(this.segments - 1, Math.floor(relX)));
    const gz0 = Math.max(0, Math.min(this.segments - 1, Math.floor(relZ)));
    const gx1 = gx0 + 1;
    const gz1 = gz0 + 1;

    const tx = Math.max(0, Math.min(1, relX - gx0));
    const tz = Math.max(0, Math.min(1, relZ - gz0));

    const h00 = chunk.heights[gz0 * this.gridSize + gx0];
    const h10 = chunk.heights[gz0 * this.gridSize + gx1];
    const h01 = chunk.heights[gz1 * this.gridSize + gx0];
    const h11 = chunk.heights[gz1 * this.gridSize + gx1];

    const h0 = h00 + (h10 - h00) * tx;
    const h1 = h01 + (h11 - h01) * tx;

    return h0 + (h1 - h0) * tz;
  }

  public preloadChunks(centerCx: number, centerCz: number, radius = 1): void {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        this.getChunkHeightfield(centerCx + dx, centerCz + dz);
      }
    }
  }

  public clear(): void {
    this.cache.clear();
  }

  public get cachedCount(): number {
    return this.cache.size;
  }
}
