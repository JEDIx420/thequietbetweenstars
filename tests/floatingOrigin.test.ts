import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FloatingOrigin } from '../src/game/universe/FloatingOrigin';
import { WorldPosition } from '../src/game/universe/WorldPosition';

describe('FloatingOrigin and WorldPosition', () => {
  it('normalizes WorldPosition offset overflow across sector boundaries', () => {
    const wp = new WorldPosition({ x: 0, y: 0, z: 0 }, new THREE.Vector3(2500, 0, 0));
    // 2500 > half-sector (2000), so sector.x should be 1 and offset.x should be -1500
    expect(wp.sector.x).toBe(1);
    expect(wp.localOffset.x).toBe(-1500);
  });

  it('calculates true world distance across sectors', () => {
    const wp1 = new WorldPosition({ x: 0, y: 0, z: 0 }, new THREE.Vector3(0, 0, 0));
    const wp2 = new WorldPosition({ x: 1, y: 0, z: 0 }, new THREE.Vector3(0, 0, 0));

    expect(wp1.distanceTo(wp2)).toBe(WorldPosition.SECTOR_SIZE);
  });

  it('rebases scene root objects when ship position exceeds threshold', () => {
    const origin = new FloatingOrigin(2000);
    const shipPos = new THREE.Vector3(2200, 0, 0);
    const worldPos = new WorldPosition();
    const planetObj = new THREE.Object3D();
    planetObj.position.set(2400, 0, 0);

    let notifiedOffset: THREE.Vector3 | null = null;
    origin.registerListener({
      onRebase: (offset) => {
        notifiedOffset = offset.clone();
      },
    });

    const rebased = origin.checkAndRebase(shipPos, worldPos, [planetObj]);

    expect(rebased).toBe(true);
    expect(origin.rebaseCount).toBe(1);
    expect(shipPos.x).toBe(0); // Shifted back to local render center
    expect(planetObj.position.x).toBe(200); // 2400 - 2200 = 200
    expect(notifiedOffset!.x).toBe(-2200);
  });

  it('supports repeated rebases (10x) preserving camera distance and bounded render position', () => {
    const origin = new FloatingOrigin(2500);
    const shipPos = new THREE.Vector3(0, 0, 0);
    const worldPos = new WorldPosition();
    const cameraPos = new THREE.Vector3(0, 3, 10);
    const planetPos = new THREE.Vector3(5000, 0, 0);

    const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 1000);
    camera.position.copy(cameraPos);

    origin.registerListener({
      onRebase: (offset) => {
        camera.position.add(offset);
        planetPos.add(offset);
      },
    });

    // Simulate flying 30,000 units forward, triggering at least 10 rebases
    for (let step = 0; step < 12; step++) {
      // Advance ship forward by 2600 units
      shipPos.add(new THREE.Vector3(2600, 0, 0));
      camera.position.add(new THREE.Vector3(2600, 0, 0));

      const initialCamDist = camera.position.distanceTo(shipPos);

      const rebased = origin.checkAndRebase(shipPos, worldPos, []);
      expect(rebased).toBe(true);

      // Verify ship render position returned inside threshold
      expect(shipPos.length()).toBeLessThanOrEqual(100);

      // Verify camera remains at EXACT same relative distance to ship
      const postCamDist = camera.position.distanceTo(shipPos);
      expect(Math.abs(postCamDist - initialCamDist)).toBeLessThan(0.001);

      // Verify no NaNs or infinities
      expect(Number.isFinite(shipPos.x)).toBe(true);
      expect(Number.isFinite(camera.position.x)).toBe(true);
      expect(Number.isFinite(planetPos.x)).toBe(true);
    }

    expect(origin.rebaseCount).toBe(12);
    // World coordinates advanced ~31,200 units across sectors
    const totalDist = worldPos.sector.x * WorldPosition.SECTOR_SIZE + worldPos.localOffset.x;
    expect(totalDist).toBeCloseTo(31200, -2);
  });
});
