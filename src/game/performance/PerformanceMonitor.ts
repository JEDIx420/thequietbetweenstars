import * as THREE from 'three';

export interface PerformanceMetrics {
  fps: number;
  smoothedFps: number;
  avgFrameTimeMs: number;
  p95FrameTimeMs: number;
  p99FrameTimeMs: number;
  maxFrameTimeMs: number;
  simDurationMs: number;
  renderDurationMs: number;
  streamingDurationMs: number;
  uiDurationMs: number;
  dpr: number;
  adaptiveTier: string;
  drawCalls: number;
  triangles: number;
  lines: number;
  points: number;
  geometries: number;
  textures: number;
  activeTerrainChunks: number;
  activeFloraChunks: number;
  activePropChunks: number;
  activeFaunaCount: number;
  activePickupCount: number;
  activeTrafficCount: number;
  activeRealLights: number;
  longTaskCount: number;
  maxLongTaskMs: number;
}

export interface EntityCounters {
  terrainChunks?: number;
  floraChunks?: number;
  propChunks?: number;
  faunaCount?: number;
  pickupCount?: number;
  trafficCount?: number;
  realLights?: number;
  dpr?: number;
  adaptiveTier?: string;
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor | null = null;

  // Ring buffer for frame durations
  private readonly bufferSize = 120;
  private frameTimes: Float32Array = new Float32Array(120);
  private frameIndex = 0;
  private frameCount = 0;

  // FPS tracking
  private lastFrameTimestamp = 0;
  private smoothedFps = 60;
  private currentFps = 60;

  // Subsystem section timings (in ms)
  private sectionStarts: Map<string, number> = new Map();
  private lastSectionDurations: Map<string, number> = new Map();

  // Entity counters
  private counters: EntityCounters = {
    terrainChunks: 0,
    floraChunks: 0,
    propChunks: 0,
    faunaCount: 0,
    pickupCount: 0,
    trafficCount: 0,
    realLights: 0,
    dpr: 1,
    adaptiveTier: 'NORMAL',
  };

  // Renderer reference
  private renderer: THREE.WebGLRenderer | null = null;

  // Long tasks observer
  private longTaskObserver: any = null;
  private longTaskCount = 0;
  private maxLongTaskMs = 0;

  constructor(renderer?: THREE.WebGLRenderer) {
    if (renderer) {
      this.renderer = renderer;
    }
    this.initLongTaskObserver();
  }

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  public setRenderer(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer;
  }

  private initLongTaskObserver(): void {
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const supported = (PerformanceObserver as any).supportedEntryTypes;
        if (supported && supported.includes('longtask')) {
          this.longTaskObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              this.longTaskCount++;
              if (entry.duration > this.maxLongTaskMs) {
                this.maxLongTaskMs = entry.duration;
              }
            }
          });
          this.longTaskObserver.observe({ entryTypes: ['longtask'] });
        }
      } catch {
        // Longtask observer not supported or restricted in environment
      }
    }
  }

  public beginFrame(now = performance.now()): void {
    if (this.lastFrameTimestamp > 0) {
      const delta = now - this.lastFrameTimestamp;
      if (delta > 0 && delta < 1000) {
        this.frameTimes[this.frameIndex] = delta;
        this.frameIndex = (this.frameIndex + 1) % this.bufferSize;
        if (this.frameCount < this.bufferSize) {
          this.frameCount++;
        }

        const instantFps = 1000 / delta;
        this.currentFps = Math.round(instantFps);
        this.smoothedFps = this.smoothedFps * 0.9 + instantFps * 0.1;
      }
    }
    this.lastFrameTimestamp = now;
  }

  public startTiming(section: 'sim' | 'render' | 'streaming' | 'ui'): void {
    this.sectionStarts.set(section, performance.now());
  }

  public stopTiming(section: 'sim' | 'render' | 'streaming' | 'ui'): number {
    const start = this.sectionStarts.get(section);
    if (start !== undefined) {
      const duration = performance.now() - start;
      this.lastSectionDurations.set(section, duration);
      return duration;
    }
    return 0;
  }

  public setCounters(updates: Partial<EntityCounters>): void {
    Object.assign(this.counters, updates);
  }

  public getMetrics(): PerformanceMetrics {
    const validCount = this.frameCount;
    let sum = 0;
    let max = 0;

    // Temporary copy of valid durations to compute percentiles without sorting entire ring buffer
    const temp: number[] = [];
    for (let i = 0; i < validCount; i++) {
      const val = this.frameTimes[i];
      sum += val;
      if (val > max) max = val;
      temp.push(val);
    }

    temp.sort((a, b) => a - b);

    const avg = validCount > 0 ? sum / validCount : 16.67;
    const p95 = validCount > 0 ? temp[Math.floor(validCount * 0.95)] || max : 16.67;
    const p99 = validCount > 0 ? temp[Math.floor(validCount * 0.99)] || max : 16.67;

    const info = this.renderer?.info;

    return {
      fps: this.currentFps,
      smoothedFps: Math.round(this.smoothedFps),
      avgFrameTimeMs: parseFloat(avg.toFixed(2)),
      p95FrameTimeMs: parseFloat(p95.toFixed(2)),
      p99FrameTimeMs: parseFloat(p99.toFixed(2)),
      maxFrameTimeMs: parseFloat(max.toFixed(2)),
      simDurationMs: parseFloat((this.lastSectionDurations.get('sim') || 0).toFixed(2)),
      renderDurationMs: parseFloat((this.lastSectionDurations.get('render') || 0).toFixed(2)),
      streamingDurationMs: parseFloat((this.lastSectionDurations.get('streaming') || 0).toFixed(2)),
      uiDurationMs: parseFloat((this.lastSectionDurations.get('ui') || 0).toFixed(2)),
      dpr: this.counters.dpr || (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1),
      adaptiveTier: this.counters.adaptiveTier || 'NORMAL',
      drawCalls: info?.render?.calls ?? 0,
      triangles: info?.render?.triangles ?? 0,
      lines: info?.render?.lines ?? 0,
      points: info?.render?.points ?? 0,
      geometries: info?.memory?.geometries ?? 0,
      textures: info?.memory?.textures ?? 0,
      activeTerrainChunks: this.counters.terrainChunks ?? 0,
      activeFloraChunks: this.counters.floraChunks ?? 0,
      activePropChunks: this.counters.propChunks ?? 0,
      activeFaunaCount: this.counters.faunaCount ?? 0,
      activePickupCount: this.counters.pickupCount ?? 0,
      activeTrafficCount: this.counters.trafficCount ?? 0,
      activeRealLights: this.counters.realLights ?? 0,
      longTaskCount: this.longTaskCount,
      maxLongTaskMs: parseFloat(this.maxLongTaskMs.toFixed(1)),
    };
  }

  public dispose(): void {
    if (this.longTaskObserver) {
      this.longTaskObserver.disconnect();
      this.longTaskObserver = null;
    }
  }
}
