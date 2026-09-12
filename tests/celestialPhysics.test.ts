import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CelestialPhysicsSystem, type CelestialBody } from '../src/game/core/celestialPhysics';

describe('CelestialPhysicsSystem', () => {
  const planet: CelestialBody = {
    id: 'planet-1',
    name: 'Aurelia',
    type: 'planet',
    position: new THREE.Vector3(0, 0, 1000),
    physicalRadius: 100,
    exclusionRadius: 110,
    atmosphereRadius: 200,
  };

  const sun: CelestialBody = {
    id: 'star-1',
    name: 'Solara',
    type: 'star',
    position: new THREE.Vector3(2000, 0, 0),
    physicalRadius: 200,
    exclusionRadius: 240,
    atmosphereRadius: 400,
    dangerRadius: 280,
  };

  it('detects nearest celestial body correctly', () => {
    const physics = new CelestialPhysicsSystem([planet, sun]);
    const shipPos = new THREE.Vector3(0, 0, 850); // 150 units from planet center

    const info = physics.getNearestBody(shipPos);
    expect(info).not.toBeNull();
    expect(info?.body.name).toBe('Aurelia');
    expect(info?.distance).toBeCloseTo(150);
    expect(info?.altitude).toBeCloseTo(50); // 150 - 100
    expect(info?.inAtmosphere).toBe(true); // 150 <= 200
    expect(info?.inExclusion).toBe(false); // 150 > 110
  });

  it('prevents ship from penetrating inside celestial exclusion radius', () => {
    const physics = new CelestialPhysicsSystem([planet]);

    // Position ship inside exclusion radius (90 units from center, exclusion is 110)
    const shipPos = new THREE.Vector3(0, 0, 910); // dist = 90 along Z from planet at (0,0,1000)
    const shipVel = new THREE.Vector3(0, 0, 50); // moving toward planet center

    const result = physics.resolvePhysics(shipPos, shipVel, 0.016);

    expect(result.hasCollided).toBe(true);
    expect(result.collidedBody?.name).toBe('Aurelia');

    // Clamped distance must be exactly exclusionRadius (110)
    const newDist = shipPos.distanceTo(planet.position);
    expect(newDist).toBeCloseTo(110);

    // Inward velocity component must be removed/reflected
    expect(shipVel.z).toBeLessThanOrEqual(0); // moving back or deflecting away
  });

  it('triggers danger warning when approaching star exclusion boundary', () => {
    const physics = new CelestialPhysicsSystem([sun]);
    const shipPos = new THREE.Vector3(1780, 0, 0); // 220 units from sun at 2000, inside 240 exclusion
    const shipVel = new THREE.Vector3(40, 0, 0);

    const result = physics.resolvePhysics(shipPos, shipVel, 0.016);
    expect(result.hasCollided).toBe(true);
    expect(result.isDanger).toBe(true);
    expect(shipPos.distanceTo(sun.position)).toBeCloseTo(240);
  });
});
