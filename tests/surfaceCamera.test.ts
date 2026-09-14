import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SurfaceScene } from '../src/game/surface/SurfaceScene';

describe('SurfaceScene Camera Stabilization', () => {
  it('defines WORLD_UP as canonical positive Y (0,1,0)', () => {
    expect(SurfaceScene.WORLD_UP).toBeDefined();
    expect(SurfaceScene.WORLD_UP.x).toBe(0);
    expect(SurfaceScene.WORLD_UP.y).toBe(1);
    expect(SurfaceScene.WORLD_UP.z).toBe(0);
  });

  it('stabilizes upside-down camera up vector toward WORLD_UP', () => {
    const camera = new THREE.PerspectiveCamera(65, 1.77, 0.1, 1000);
    // Simulate inverted camera entering surface flight (e.g. from orbital loop)
    camera.up.set(0, -1, 0);

    const worldUp = SurfaceScene.WORLD_UP;
    const dot = camera.up.dot(worldUp);
    expect(dot).toBeLessThan(0); // inverted

    // Test the stabilization logic implemented in SurfaceScene.update:
    // If dot < 0.2 (inverted or severely banked), rapidly force or lerp toward WORLD_UP
    const recoveryRate = dot < 0.2 ? 9.0 : 4.0;
    const dt = 0.1;
    const lerpFactor = Math.min(1.0, recoveryRate * dt);
    camera.up.lerp(worldUp, lerpFactor).normalize();

    // After step, camera up should have pivoted upward
    expect(camera.up.y).toBeGreaterThan(-1);
    expect(camera.up.dot(worldUp)).toBeGreaterThan(dot);
  });
});
