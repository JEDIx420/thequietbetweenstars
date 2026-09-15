import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SurveyCreditPickupManager } from '../src/game/surface/SurveyCreditPickupManager';
import type { LandingRegionProfile } from '../src/game/planets/LandingRegionProfile';

describe('Survey Credit Pickups & Persistence', () => {
  const mockRegion: LandingRegionProfile = {
    id: 'reg-alpha',
    name: 'Basaltic Expanse',
    regionSeed: 1337,
    regionType: 'canyons',
    biomeName: 'Obsidian Plains',
    loreSnippet: 'Ancient data motes flicker across the plain.',
    safetyRating: 'Stable',
    interestingSignals: [],
    terrainMorphologyOverride: 'canyons',
    heightScale: 1.0,
    roughness: 0.5,
    erosion: 0.2,
    ridgeStrength: 0.3,
    canyonStrength: 0.8,
    duneStrength: 0,
    waterLevelOffset: -100,
    moisture: 0.1,
    temperatureOffset: 0,
    windStrength: 0.5,
    vegetationDensity: 0,
    vegetationArchetype: 'none',
    faunaDensity: 0,
    faunaArchetypes: [],
    rockDensity: 0.4,
    landmarkFamilies: [],
    localSurfacePalette: {
      lowland: '#1e293b',
      midland: '#334155',
      highland: '#475569',
      peak: '#0f172a',
      rock: '#64748b',
      accent: '#020617',
    },
    fogModifier: {
      densityMultiplier: 1.0,
    },
    particleModifier: {
      type: 'none',
      densityMultiplier: 1.0,
    },
  };

  it('spawns pickups within streaming grid cells', () => {
    const manager = new SurveyCreditPickupManager(mockRegion, 'test-planet', 12345, []);
    const craftPos = new THREE.Vector3(0, 15, 0);

    manager.update(craftPos, 0.016, () => 10);
    const nearest = manager.getNearestPickups(craftPos, 6);

    expect(nearest.length).toBeGreaterThan(0);
    for (const p of nearest) {
      expect(p.amount).toBeGreaterThanOrEqual(15);
      expect(p.amount).toBeLessThanOrEqual(125);
    }
  });

  it('auto-collects pickups when craft flies within 6.5m radius', () => {
    const manager = new SurveyCreditPickupManager(mockRegion, 'test-planet', 12345, []);
    const craftPos = new THREE.Vector3(0, 15, 0);

    // Initial population
    manager.update(craftPos, 0.016, () => 10);
    const nearest = manager.getNearestPickups(craftPos, 1);
    expect(nearest.length).toBe(1);

    const targetPos = nearest[0].position.clone();

    // Fly ship directly into the pickup position
    const collected = manager.update(targetPos, 0.016, () => 10);
    expect(collected.length).toBeGreaterThanOrEqual(1);

    const collectedIds = manager.getCollectedIds();
    expect(collectedIds).toContain(collected[0].id);
  });

  it('honors initialCollectedCreditIds and avoids respawning collected motes', () => {
    const manager1 = new SurveyCreditPickupManager(mockRegion, 'test-planet', 9999, []);
    manager1.update(new THREE.Vector3(0, 15, 0), 0.016, () => 10);
    const nearest = manager1.getNearestPickups(new THREE.Vector3(0, 15, 0), 2);
    const target = nearest[0].position.clone();

    // Collect it
    const collected = manager1.update(target, 0.016, () => 10);
    const collectedId = collected[0].id;

    // Instantiate new manager simulating reload from save slot
    const manager2 = new SurveyCreditPickupManager(mockRegion, 'test-planet', 9999, [collectedId]);
    manager2.update(new THREE.Vector3(0, 15, 0), 0.016, () => 10);

    // Ensure collected ID is in manager2 set
    expect(manager2.getCollectedIds()).toContain(collectedId);

    // Fly through the same position again - should not collect anything new with that ID
    const collectedAgain = manager2.update(target, 0.016, () => 10);
    const reCollected = collectedAgain.find(c => c.id === collectedId);
    expect(reCollected).toBeUndefined();
  });
});
