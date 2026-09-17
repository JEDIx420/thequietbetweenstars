import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CelestialPhysicsSystem, type CelestialBody } from '../src/game/core/celestialPhysics';

describe('CelestialPhysicsSystem: Anti-Tunneling Swept Collision', () => {
  const planet: CelestialBody = {
    id: 'planet-test',
    name: 'Bastion',
    type: 'planet',
    position: new THREE.Vector3(0, 0, 1000),
    physicalRadius: 100,
    exclusionRadius: 115,
    atmosphereRadius: 200,
  };

  it('prevents high-speed tunneling through planet and clamps to approach surface', () => {
    const physics = new CelestialPhysicsSystem([planet]);

    // Ship is moving at high speed (250 m/s) along Z towards planet center at (0, 0, 1000)
    // Starting at 920 (previous position), moving +250 in dt = 0.05 -> candidate position = 932.5 (penetration depth)
    // Even if framerate drops and candidate position jumps past the planet center to 1050:
    const candidatePos = new THREE.Vector3(0, 0, 1050); // Inside planet past center!
    const shipVel = new THREE.Vector3(0, 0, 250); // Forward velocity
    const dt = 0.8; // Large step where prevPos was 1050 - 250 * 0.8 = 850 (in front of planet)

    const result = physics.resolvePhysics(candidatePos, shipVel, dt);

    expect(result.hasCollided).toBe(true);
    // Crucial invariant: candidatePos MUST be clamped on the FRONT approach side (Z <= 1000 - 115 = 885)
    // NOT on the far side (Z >= 1115)
    expect(candidatePos.z).toBeLessThan(1000);
    expect(candidatePos.distanceTo(planet.position)).toBeCloseTo(115);

    // Inward velocity (+Z) must be canceled
    expect(shipVel.z).toBeLessThanOrEqual(0);
  });
});
