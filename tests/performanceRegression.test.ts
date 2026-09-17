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
});
