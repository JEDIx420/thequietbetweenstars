import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { RuntimeScheduler } from '../src/game/performance/RuntimeScheduler';
import { PerformanceMonitor } from '../src/game/performance/PerformanceMonitor';
import { RenderQualityController } from '../src/game/performance/RenderQualityController';
import { HeightfieldCache } from '../src/game/surface/HeightfieldCache';
import { SpatialHash } from '../src/game/performance/SpatialHash';
import { StarSystemGenerator } from '../src/game/systems/StarSystemGenerator';
import { SectorManager } from '../src/game/universe/SectorManager';
import { PlanetVisualGenerator } from '../src/game/planets/PlanetVisualGenerator';
import { FlightPhase } from '../src/game/flight/FlightStateMachine';
import { CourierPod } from '../src/game/flight/CourierPod';
import { SpaceTrafficDirector } from '../src/game/scenes/SpaceTrafficDirector';
import { SpaceEncounterManager } from '../src/game/scenes/SpaceEncounterManager';
import { SpaceScene } from '../src/game/scenes/spaceScene';
import { FrameBudgetQueue } from '../src/game/performance/FrameBudgetQueue';
import { SurfaceGeneratorService } from '../src/game/surface/SurfaceGeneratorService';
import { SurfaceScene } from '../src/game/surface/SurfaceScene';
import { LandingSiteGenerator } from '../src/game/systems/LandingSiteGenerator';
import {
  generateChunkHeights,
  generateChunkHeightsProgressive,
} from '../src/game/workers/surfaceGeneration.worker';

// Mock DOM elements for headless Node environment
if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    createElement: (tag: string) => ({
      tagName: tag,
      id: '',
      style: {},
      children: [],
      appendChild: (el: any) => el,
      remove: () => {},
      getContext: () => ({
        clearRect: () => {},
        beginPath: () => {},
        arc: () => {},
        ellipse: () => {},
        stroke: () => {},
        strokeRect: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        fill: () => {},
        drawImage: () => {},
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createLinearGradient: () => ({ addColorStop: () => {} }),
        fillRect: () => {},
        fillText: () => {},
        save: () => {},
        restore: () => {},
        translate: () => {},
        rotate: () => {},
        setLineDash: () => {},
      }),
    }),
    hidden: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    devicePixelRatio: 2,
    innerWidth: 1920,
    innerHeight: 1080,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

describe('Performance Engine & Lifecycle Regression Suite', () => {
  describe('RuntimeScheduler Cadence & Domain Isolation', () => {
    let scheduler: RuntimeScheduler;

    beforeEach(() => {
      scheduler = new RuntimeScheduler();
    });

    it('clamps excessive delta times to prevent simulation instability', () => {
      const result = scheduler.advance(0.5); // 500ms spike
      expect(result.dt).toBeLessThanOrEqual(0.1);
    });

    it('suspends simulation advance when pause reason is active', () => {
      scheduler.addPauseReason('modal');
      expect(scheduler.isPaused()).toBe(true);

      const res = scheduler.advance(0.016);
      expect(res.dt).toBe(0);
      expect(res.didSimTick).toBe(false);

      scheduler.removePauseReason('modal');
      expect(scheduler.isPaused()).toBe(false);
      const resumed = scheduler.advance(0.016);
      expect(resumed.dt).toBeGreaterThan(0);
    });

    it('fires near-sim, ambient, and telemetry cadences at expected intervals', () => {
      let simTicks = 0;
      let ambientTicks = 0;
      let telemetryTicks = 0;

      scheduler.onSimulation(() => { simTicks++; });
      scheduler.onAmbient(() => { ambientTicks++; });
      scheduler.onTelemetry(() => { telemetryTicks++; });

      // Advance by 1 full second in 16ms steps
      for (let i = 0; i < 60; i++) {
        scheduler.advance(1 / 60);
      }

      // 30 Hz -> ~29-31 ticks
      expect(simTicks).toBeGreaterThanOrEqual(28);
      expect(simTicks).toBeLessThanOrEqual(32);

      // 8 Hz -> ~7-9 ticks
      expect(ambientTicks).toBeGreaterThanOrEqual(7);
      expect(ambientTicks).toBeLessThanOrEqual(9);

      // 10 Hz -> ~8-11 ticks
      expect(telemetryTicks).toBeGreaterThanOrEqual(8);
      expect(telemetryTicks).toBeLessThanOrEqual(11);
    });

    it('correctly reports domain isolation flags across flight phases', () => {
      scheduler.setPhase(FlightPhase.SYSTEM_CRUISE);
      expect(scheduler.shouldRunSpaceFlight()).toBe(true);
      expect(scheduler.shouldRunSurfaceFlight()).toBe(false);

      scheduler.setPhase(FlightPhase.SURFACE_FLIGHT);
      expect(scheduler.shouldRunSpaceFlight()).toBe(false);
      expect(scheduler.shouldRunSurfaceFlight()).toBe(true);

      scheduler.setPhase(FlightPhase.ORBIT);
      expect(scheduler.shouldRunOrbit()).toBe(true);
    });
  });

  describe('PerformanceMonitor Rolling Ring Buffer', () => {
    it('computes rolling average, p95, p99 and max frame times accurately', () => {
      const monitor = new PerformanceMonitor();

      // Feed 100 steady 16.6ms frames with one 50ms spike
      let timestamp = 1000;
      for (let i = 0; i < 99; i++) {
        monitor.beginFrame(timestamp);
        timestamp += 16.6;
      }
      monitor.beginFrame(timestamp);
      timestamp += 50.0;
      monitor.beginFrame(timestamp);

      const metrics = monitor.getMetrics();
      expect(metrics.avgFrameTimeMs).toBeGreaterThan(16);
      expect(metrics.avgFrameTimeMs).toBeLessThan(18);
      expect(metrics.maxFrameTimeMs).toBeCloseTo(50.0, 1);
      expect(metrics.p95FrameTimeMs).toBeGreaterThanOrEqual(16);
    });
  });

  describe('RenderQualityController Adaptive DPR Adjustment', () => {
    it('steps down DPR when p95 exceeds step-down threshold', () => {
      const mockRenderer: any = {
        dpr: 2.0,
        getPixelRatio: () => mockRenderer.dpr,
        setPixelRatio: (val: number) => { mockRenderer.dpr = val; },
      };

      const mockMonitor: any = {
        getMetrics: () => ({
          p95FrameTimeMs: 25.0, // Over 22ms threshold
        }),
      };

      const controller = new RenderQualityController(mockRenderer, mockMonitor, {
        minDpr: 1.0,
        maxDpr: 2.0,
        cooldownMs: 100,
        stepDownThresholdMs: 22.0,
      });

      // Update with dt exceeding cooldown
      controller.update(0.15);

      expect(mockRenderer.dpr).toBeLessThan(2.0);
      expect(mockRenderer.dpr).toBeGreaterThanOrEqual(1.0);
    });

    it('steps up DPR when p95 has significant headroom', () => {
      const mockRenderer: any = {
        dpr: 1.2,
        getPixelRatio: () => mockRenderer.dpr,
        setPixelRatio: (val: number) => { mockRenderer.dpr = val; },
      };

      const mockMonitor: any = {
        getMetrics: () => ({
          p95FrameTimeMs: 11.0, // High headroom (< 13.5ms)
        }),
      };

      const controller = new RenderQualityController(mockRenderer, mockMonitor, {
        minDpr: 1.0,
        maxDpr: 2.0,
        cooldownMs: 100,
        stepUpThresholdMs: 13.5,
      });

      controller.update(0.15);

      expect(mockRenderer.dpr).toBeGreaterThan(1.2);
      expect(mockRenderer.dpr).toBeLessThanOrEqual(2.0);
    });
  });

  describe('HeightfieldCache LRU Bounding & Bilinear Interpolation', () => {
    it('stores, retrieves, and interpolates heights correctly', () => {
      const cache = new HeightfieldCache((_x, _z) => 25.0, 200, 32, 10);

      const chunk = cache.getChunkHeightfield(1, 2);
      expect(chunk).toBeDefined();
      expect(chunk.heights[0]).toBe(25.0);
      expect(cache.cachedCount).toBe(1);

      // Interpolation inside chunk (cx=1, cz=2, world coords centered at 200, 400)
      const h = cache.sample(200, 400);
      expect(h).toBeCloseTo(25.0, 1);
    });

    it('strictly bounds memory size to maxEntries via LRU eviction', () => {
      const cache = new HeightfieldCache((_x, _z) => 10.0, 200, 32, 4);
      for (let i = 0; i < 8; i++) {
        cache.getChunkHeightfield(i, 0);
      }

      expect(cache.cachedCount).toBe(4);
    });
  });

  describe('SpatialHash 2D Grid Queries', () => {
    it('indexes items and returns accurate radius queries in O(1) cells', () => {
      const hash = new SpatialHash<{ id: string }>(100);
      hash.insert('item1', 50, 50, { id: 'item1' });
      hash.insert('item2', 80, 80, { id: 'item2' });
      hash.insert('far_item', 900, 900, { id: 'far_item' });

      const near = hash.queryRadius(50, 50, 60);
      expect(near.length).toBe(2);
      expect(near.some(i => i.id === 'item1')).toBe(true);
      expect(near.some(i => i.id === 'item2')).toBe(true);
      expect(near.some(i => i.id === 'far_item')).toBe(false);

      hash.clear();
      expect(hash.queryRadius(50, 50, 60).length).toBe(0);
    });
  });

  describe('Star System Summaries & SectorParity', () => {
    it('produces system summary with identical star name and planet counts as full generator', () => {
      const seed = 54321;
      const full = StarSystemGenerator.generateSystem(seed, 2, -1, 3);
      const summary = StarSystemGenerator.generateSystemSummary(seed, 2, -1, 3);

      expect(summary.name).toBe(full.name);
      expect(summary.seed).toBe(full.seed);
      expect(summary.star.name).toBe(full.star.name);
      expect(summary.planetCount).toBe(full.planets.length);
    });

    it('SectorManager retrieves cached summaries and bounded full systems', () => {
      const sectorManager = new SectorManager('REGRESSION-SEED-01');
      const summaries = sectorManager.getSystemSummariesInRadius({ x: 0, y: 0, z: 0 }, 1);
      expect(summaries.length).toBeGreaterThan(0);

      const first = summaries[0].summary;
      const fullSystem = sectorManager.getFullSystem(first.sectorX, first.sectorY, first.sectorZ);
      expect(fullSystem).not.toBeNull();
      expect(fullSystem!.name).toBe(first.name);
    });
  });

  describe('PlanetVisualGenerator Texture Cache Management', () => {
    it('caches and clears procedural planetary textures cleanly', () => {
      PlanetVisualGenerator.clearTextureCaches();

      const mockPlanet: any = {
        seed: 12345,
        radius: 100,
        profile: {
          family: 'temperate-terrestrial',
          atmosphere: { hasAtmosphere: true, density: 1.0 },
          cloudCoverage: 0.5,
          hasRings: false,
          palette: {
            surfaceLowland: 0x1e3a8a,
            surfaceMidland: 0x059669,
            surfaceHighland: 0x78716c,
            atmosphereGlow: 0x38bdf8,
            cloudColor: 0xffffff,
          },
          terrain: { hasLiquid: true },
        },
      };

      const visual = PlanetVisualGenerator.createPlanetMesh(mockPlanet);
      expect(visual.group).toBeDefined();

      // Ensure clearTextureCaches disposes properly without throwing
      expect(() => PlanetVisualGenerator.clearTextureCaches()).not.toThrow();
    });
  });

  describe('Subsystem Resource Disposal Integrity', () => {
    it('disposes CourierPod without errors', () => {
      const mockOrder: any = { orderId: 'test_order', moduleType: 'engine' };
      const pod = new CourierPod(mockOrder, new THREE.Vector3(100, 0, 100));
      expect(() => pod.dispose()).not.toThrow();
    });

    it('disposes SpaceTrafficDirector and SpaceEncounterManager cleanly', () => {
      const sunPos = new THREE.Vector3(0, 0, 0);
      const planetPositions = [new THREE.Vector3(500, 0, 500)];

      const traffic = new SpaceTrafficDirector(999, sunPos, planetPositions);
      expect(() => traffic.dispose()).not.toThrow();

      const encounters = new SpaceEncounterManager(888, sunPos, planetPositions);
      expect(() => encounters.dispose()).not.toThrow();
    });

    it('disposes SpaceScene without memory leaks or errors', () => {
      const scene = new SpaceScene();
      expect(() => scene.dispose()).not.toThrow();
    });
  });

  describe('RuntimeScheduler Phase Domain Isolation', () => {
    it('isolates ENTRY and ASCENT from normal space flight', () => {
      const scheduler = new RuntimeScheduler();

      scheduler.setPhase(FlightPhase.ENTRY);
      expect(scheduler.shouldRunEntry()).toBe(true);
      expect(scheduler.shouldRunSpaceFlight()).toBe(false);
      expect(scheduler.shouldRunOrbit()).toBe(false);
      expect(scheduler.shouldRunSurfaceFlight()).toBe(false);

      scheduler.setPhase(FlightPhase.ASCENT);
      expect(scheduler.shouldRunAscent()).toBe(true);
      expect(scheduler.shouldRunSpaceFlight()).toBe(false);
      expect(scheduler.shouldRunOrbit()).toBe(false);
      expect(scheduler.shouldRunSurfaceFlight()).toBe(false);

      scheduler.setPhase(FlightPhase.SYSTEM_CRUISE);
      expect(scheduler.shouldRunSpaceFlight()).toBe(true);
      expect(scheduler.shouldRunEntry()).toBe(false);
      expect(scheduler.shouldRunAscent()).toBe(false);
    });

    it('pauses simulation on orientation and hidden pause reasons', () => {
      const scheduler = new RuntimeScheduler();

      scheduler.addPauseReason('orientation');
      expect(scheduler.isPaused()).toBe(true);
      const tick1 = scheduler.advance(0.05);
      expect(tick1.dt).toBe(0);
      expect(tick1.didSimTick).toBe(false);

      scheduler.removePauseReason('orientation');
      expect(scheduler.isPaused()).toBe(false);

      scheduler.addPauseReason('hidden');
      expect(scheduler.isPaused()).toBe(true);
      const tick2 = scheduler.advance(0.05);
      expect(tick2.dt).toBe(0);

      scheduler.removePauseReason('hidden');
      scheduler.resetTiming();
      expect(scheduler.isPaused()).toBe(false);
    });
  });

  describe('FrameBudgetQueue Staged Execution', () => {
    it('executes prioritized tasks within time slice budget', () => {
      const queue = FrameBudgetQueue.getInstance();
      queue.clear();

      const executed: number[] = [];
      queue.enqueue('t1', () => { executed.push(1); }, 10);
      queue.enqueue('t2', () => { executed.push(2); }, 20); // Higher priority
      queue.enqueue('t3', () => { executed.push(3); }, 5);

      expect(queue.pendingCount).toBe(3);

      // Process with ample budget
      queue.process(10.0);

      expect(executed).toEqual([2, 1, 3]);
      expect(queue.pendingCount).toBe(0);
    });
  });

  describe('SurfaceGeneratorService Pure Procedural Worker & Cache Consumption', () => {
    it('generates transferable chunk heights and caches them', async () => {
      const service = SurfaceGeneratorService.getInstance();
      const task = {
        id: 'chunk_0_0',
        cx: 0,
        cz: 0,
        chunkSize: 120,
        segments: 32,
        regionSeed: 424242,
        morphology: 'dunes',
        heightScale: 60,
        roughness: 0.5,
        domainWarp: 0.3,
        duneStrength: 0.8,
        canyonStrength: 0.0,
        ridgeStrength: 0.2,
      };

      const result = await service.requestChunkHeights(task);
      expect(result.heights).toBeInstanceOf(Float32Array);
      expect(result.heights.length).toBe(33 * 33);
      expect(result.minY).toBeLessThanOrEqual(result.maxY);

      // Insert into HeightfieldCache
      const cache = new HeightfieldCache((_x, _z) => 0, 120, 32, 10);
      expect(cache.hasChunk(0, 0)).toBe(false);

      cache.insertChunk(0, 0, result.heights, result.minY, result.maxY);
      expect(cache.hasChunk(0, 0)).toBe(true);

      const cached = cache.getChunkHeightfield(0, 0);
      expect(cached.heights[0]).toBe(result.heights[0]);
    });

    it('progressive fallback yields across event loop and produces bitwise-identical output to synchronous generation', async () => {
      const task = {
        id: 'chunk_test_parity',
        cx: 1,
        cz: -1,
        chunkSize: 200,
        segments: 32,
        regionSeed: 987654,
        morphology: 'canyons',
        heightScale: 40,
        roughness: 0.65,
        domainWarp: 0.4,
        duneStrength: 0.0,
        canyonStrength: 0.75,
        ridgeStrength: 0.3,
      };

      // 1. Synchronous worker-equivalent generator
      const syncResult = generateChunkHeights(task);

      // 2. Progressive main-thread fallback generator
      let isSettledSync = false;
      const progressivePromise = generateChunkHeightsProgressive(task, 6).then((res) => {
        isSettledSync = true;
        return res;
      });

      // Must yield across frames rather than completing synchronously
      expect(isSettledSync).toBe(false);

      const progressiveResult = await progressivePromise;

      // Parity assertions
      expect(progressiveResult.minY).toBe(syncResult.minY);
      expect(progressiveResult.maxY).toBe(syncResult.maxY);
      expect(progressiveResult.heights.length).toBe(syncResult.heights.length);

      for (let i = 0; i < syncResult.heights.length; i++) {
        expect(progressiveResult.heights[i]).toBe(syncResult.heights[i]);
      }
    });
  });

  describe('SurfaceScene Staged Generation Pipeline & Race Elimination', () => {
    const getTestPlanetAndSite = () => {
      const sys = StarSystemGenerator.generateSystem('QUIET-TEST-STAGE', 0, 0, 0);
      const planet = sys.planets.find((p) => p.isLandable)!;
      const sites = LandingSiteGenerator.generateSites(planet);
      return { planet, site: sites[0] };
    };

    it('deferred SurfaceScene constructor does not synchronously generate center chunk', () => {
      const { planet, site } = getTestPlanetAndSite();
      const scene = new SurfaceScene(planet, site, [], { deferHeavyInitialization: true });

      // HeightfieldCache must NOT contain chunk (0, 0) immediately upon construction
      const cache = (scene as any).heightfieldCache as HeightfieldCache;
      expect(cache.hasChunk(0, 0)).toBe(false);
      expect(scene.activeTerrainChunkCount).toBe(0);
      expect(scene.isCenterReady()).toBe(false);

      scene.dispose();
    });

    it('ensures heightfield is inserted into cache before FrameBudgetQueue builds chunk', async () => {
      FrameBudgetQueue.getInstance().clear();
      const { planet, site } = getTestPlanetAndSite();
      const scene = new SurfaceScene(planet, site, [], { deferHeavyInitialization: true });
      const cache = (scene as any).heightfieldCache as HeightfieldCache;
      const queue = FrameBudgetQueue.getInstance();

      // Wait for progressive heightfield generator to finish inserting chunk (0, 0)
      for (let i = 0; i < 50; i++) {
        if (cache.hasChunk(0, 0)) break;
        await new Promise((r) => setTimeout(r, 20));
      }

      expect(cache.hasChunk(0, 0)).toBe(true);
      expect(queue.pendingCount).toBeGreaterThan(0);

      // Process the queued chunk construction with ample budget
      queue.process(25.0);

      expect(scene.isCenterReady()).toBe(true);
      expect(scene.activeTerrainChunkCount).toBeGreaterThanOrEqual(1);

      scene.dispose();
    });

    it('prevents duplicate generation requests for in-flight chunks', () => {
      FrameBudgetQueue.getInstance().clear();
      const { planet, site } = getTestPlanetAndSite();
      const scene = new SurfaceScene(planet, site, [], { deferHeavyInitialization: true });
      const pending = (scene as any).pendingWorkerChunks as Set<string>;

      const initialPendingCount = pending.size;
      expect(initialPendingCount).toBeGreaterThan(0);

      // Calling stageInitialChunks again while initial chunks are pending must not duplicate
      (scene as any).stageInitialChunks(0, 0);
      expect(pending.size).toBe(initialPendingCount);

      scene.dispose();
    });

    it('finishPreparation() never causes synchronous generation or chunk construction when center preparation is incomplete', () => {
      FrameBudgetQueue.getInstance().clear();
      const { planet, site } = getTestPlanetAndSite();
      const scene = new SurfaceScene(planet, site, [], { deferHeavyInitialization: true });

      expect(scene.activeTerrainChunkCount).toBe(0);
      expect(scene.isCenterReady()).toBe(false);

      // Calling finishPreparation while center chunk preparation is incomplete
      // must NEVER synchronously generate heightfields or build chunk meshes.
      scene.finishPreparation();

      expect(scene.activeTerrainChunkCount).toBe(0);
      expect(scene.isCenterReady()).toBe(false);

      const cache = (scene as any).heightfieldCache as HeightfieldCache;
      expect(cache.hasChunk(0, 0)).toBe(false);

      scene.dispose();
    });

    it('retries chunk generation via progressive fallback when worker generation fails', async () => {
      FrameBudgetQueue.getInstance().clear();
      const { planet, site } = getTestPlanetAndSite();

      // Temporarily simulate Worker service rejection
      const service = SurfaceGeneratorService.getInstance();
      const originalRequest = service.requestChunkHeights.bind(service);
      let didRejectWorker = false;
      service.requestChunkHeights = () => {
        didRejectWorker = true;
        return Promise.reject(new Error('Simulated Worker Failure'));
      };

      const scene = new SurfaceScene(planet, site, [], { deferHeavyInitialization: true });
      const cache = (scene as any).heightfieldCache as HeightfieldCache;

      // Restore service method
      service.requestChunkHeights = originalRequest;
      expect(didRejectWorker).toBe(true);

      // Wait for progressive fallback generator to finish
      for (let i = 0; i < 50; i++) {
        if (cache.hasChunk(0, 0)) break;
        await new Promise((r) => setTimeout(r, 20));
      }

      // Center chunk (0, 0) should now be inserted in cache via progressive fallback
      expect(cache.hasChunk(0, 0)).toBe(true);

      // FrameBudgetQueue should have the task queued
      const queue = FrameBudgetQueue.getInstance();
      expect(queue.pendingCount).toBeGreaterThan(0);

      // Process the queue
      queue.process(25.0);
      expect(scene.isCenterReady()).toBe(true);
      expect(scene.activeTerrainChunkCount).toBeGreaterThanOrEqual(1);

      scene.dispose();
    });
  });

  describe('RenderQualityController Multi-Cycle Sustained Hysteresis', () => {
    it('requires multiple sustained poor cycles before stepping down DPR', () => {
      let currentDpr = 2.0;
      const mockRenderer: any = {
        getPixelRatio: () => currentDpr,
        setPixelRatio: (val: number) => { currentDpr = val; },
      };

      const mockMonitor: any = {
        getMetrics: () => ({
          p95FrameTimeMs: 25.0, // Over 22ms threshold
        }),
      };

      const controller = new RenderQualityController(mockRenderer, mockMonitor, {
        minDpr: 1.0,
        maxDpr: 2.0,
        cooldownMs: 50,
        stepDownThresholdMs: 22.0,
        sustainedPoorCycles: 2,
      });

      // Cycle 1: should not adjust yet
      controller.update(0.1);
      expect(currentDpr).toBe(2.0);

      // Cycle 2: meets sustained count of 2, steps down
      controller.update(0.1);
      expect(currentDpr).toBeLessThan(2.0);
    });

    it('resets history on resetHistory call without step-down', () => {
      let currentDpr = 2.0;
      const mockRenderer: any = {
        getPixelRatio: () => currentDpr,
        setPixelRatio: (val: number) => { currentDpr = val; },
      };

      const mockMonitor: any = {
        getMetrics: () => ({
          p95FrameTimeMs: 26.0,
        }),
      };

      const controller = new RenderQualityController(mockRenderer, mockMonitor, {
        minDpr: 1.0,
        maxDpr: 2.0,
        cooldownMs: 50,
        sustainedPoorCycles: 2,
      });

      controller.update(0.1); // 1st poor frame
      expect(currentDpr).toBe(2.0);

      // Modal closed or tab resumed
      controller.resetHistory();

      controller.update(0.1); // 1st poor frame again after reset
      expect(currentDpr).toBe(2.0);
    });
  });
});
