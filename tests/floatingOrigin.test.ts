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
    expect(shipPos.x).toBe(0); // Shifted back to local render center
    expect(planetObj.position.x).toBe(200); // 2400 - 2200 = 200
    expect(notifiedOffset!.x).toBe(-2200);
  });
});
