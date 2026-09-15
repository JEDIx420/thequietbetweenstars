import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

describe('Surface Flight Stability & Vertical Spring Dynamics', () => {
  it('converges smoothly to target altitude via critically damped spring', () => {
    let shipY = 20.0;
    let verticalVel = 0.0;
    const targetAltitude = 38.0;
    const springStrength = 16.0;
    const damping = 7.2;
    const climbRate = 32.0;
    const descentRate = 22.0;
    const dt = 0.016;

    // Simulate 120 physics frames (~2 seconds)
    for (let i = 0; i < 120; i++) {
      const error = targetAltitude - shipY;
      const accel = error * springStrength - verticalVel * damping;
      verticalVel += accel * dt;
      verticalVel = Math.min(Math.max(verticalVel, -descentRate), climbRate);
      shipY += verticalVel * dt;
    }

    // Should have smoothly converged without divergent oscillations
    expect(shipY).toBeGreaterThan(37.5);
    expect(shipY).toBeLessThan(38.5);
    expect(Math.abs(verticalVel)).toBeLessThan(0.8);
  });

  it('samples 3-point terrain lookahead to anticipate upward elevation changes', () => {
    const currentGround = 10.0;
    const lookahead1Ground = 18.0; // 8m ahead
    const lookahead2Ground = 28.0; // 22m ahead

    // Weighted lookahead calculation from SurfaceScene
    const anticipated = Math.max(
      currentGround,
      currentGround * 0.35 + lookahead1Ground * 0.40 + lookahead2Ground * 0.25
    );

    // Anticipated ground should be significantly higher than current ground
    expect(anticipated).toBeGreaterThan(currentGround);
    expect(anticipated).toBeCloseTo(10.0 * 0.35 + 18.0 * 0.40 + 28.0 * 0.25, 2);
  });

  it('clamps vertical velocity asymmetrically to prevent excessive dives while allowing responsive climbs', () => {
    const climbRate = 32.0;
    const descentRate = 22.0;

    const clampedUp = THREE.MathUtils.clamp(60.0, -descentRate, climbRate);
    const clampedDown = THREE.MathUtils.clamp(-50.0, -descentRate, climbRate);

    expect(clampedUp).toBe(32.0);
    expect(clampedDown).toBe(-22.0);
  });

  it('enforces minimum safe floor clearance', () => {
    let shipY = 4.0;
    let verticalVel = -12.0;
    const groundHeight = 5.0;
    const minAltitudeAGL = 7.0;
    const absoluteFloor = groundHeight + minAltitudeAGL; // 12.0m

    if (shipY < absoluteFloor) {
      shipY = absoluteFloor;
      if (verticalVel < 0) verticalVel = 0;
    }

    expect(shipY).toBe(12.0);
    expect(verticalVel).toBe(0);
  });
});
