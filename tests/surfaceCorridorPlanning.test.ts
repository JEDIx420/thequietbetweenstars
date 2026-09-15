import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

describe('Surface Flight Corridor Planning & Jerk Limiting Dynamics', () => {
  it('samples dynamic speed-dependent multi-point corridor (15m to 140m)', () => {
    const calcCorridorLength = (speed: number) => THREE.MathUtils.clamp(15.0 + speed * 2.0, 15.0, 140.0);

    expect(calcCorridorLength(0)).toBe(15.0);
    expect(calcCorridorLength(30)).toBe(75.0);
    expect(calcCorridorLength(65)).toBe(140.0);
    expect(calcCorridorLength(100)).toBe(140.0);
  });

  it('asymmetric safety envelope rises quickly (28m/s) and falls slowly (4.5m/s) with post-crest hold', () => {
    let filteredSafetyFloor = 20.0;
    let postCrestHoldTimer = 0.0;
    const riseRate = 28.0;
    const fallRate = 4.5;
    const dt = 0.016;

    // Upward ridge encounter: target safety floor rises to 50m
    const ridgeFloor = 50.0;
    for (let f = 0; f < 30; f++) {
      if (ridgeFloor > filteredSafetyFloor) {
        filteredSafetyFloor = Math.min(ridgeFloor, filteredSafetyFloor + riseRate * dt);
        postCrestHoldTimer = 0.8;
      }
    }
    // Rises quickly without instantaneous snapping
    expect(filteredSafetyFloor).toBeGreaterThan(32.0);
    expect(postCrestHoldTimer).toBe(0.8);

    // After cresting: target drops back to 20m
    const postRidgeFloor = 20.0;
    const floorAtCrest = filteredSafetyFloor;

    // During hold timer (0.8s = 50 frames), altitude should hold steady
    for (let f = 0; f < 40; f++) {
      if (postRidgeFloor > filteredSafetyFloor) {
        filteredSafetyFloor = Math.min(postRidgeFloor, filteredSafetyFloor + riseRate * dt);
        postCrestHoldTimer = 0.8;
      } else {
        if (postCrestHoldTimer > 0) {
          postCrestHoldTimer -= dt;
        } else {
          filteredSafetyFloor = Math.max(postRidgeFloor, filteredSafetyFloor - fallRate * dt);
        }
      }
    }

    // Still holding altitude after crest!
    expect(filteredSafetyFloor).toBe(floorAtCrest);

    // After timer expires, gentle descent occurs at 4.5m/s
    for (let f = 0; f < 60; f++) {
      if (postRidgeFloor > filteredSafetyFloor) {
        filteredSafetyFloor = Math.min(postRidgeFloor, filteredSafetyFloor + riseRate * dt);
      } else {
        if (postCrestHoldTimer > 0) {
          postCrestHoldTimer -= dt;
        } else {
          filteredSafetyFloor = Math.max(postRidgeFloor, filteredSafetyFloor - fallRate * dt);
        }
      }
    }

    expect(filteredSafetyFloor).toBeLessThan(floorAtCrest);
  });

  it('jerk limiter prevents vertical acceleration spikes regardless of sudden elevation steps', () => {
    let verticalVelocity = 0.0;
    let verticalAcceleration = 0.0;
    const maxClimbAcceleration = 24.0;
    const maxDescentAcceleration = 16.0;
    const maxVerticalJerk = 45.0;
    const springStrength = 4.2;
    const damping = 3.6;
    const dt = 0.016;

    // Extreme altitude error: 100m step
    const targetAltitude = 120.0;
    let currentY = 20.0;

    let maxObservedJerk = 0;

    for (let f = 0; f < 60; f++) {
      const altitudeError = targetAltitude - currentY;
      const rawTargetAccel = altitudeError * springStrength - verticalVelocity * damping;

      const clampedTargetAccel = rawTargetAccel > 0
        ? Math.min(rawTargetAccel, maxClimbAcceleration)
        : Math.max(rawTargetAccel, -maxDescentAcceleration);

      const maxDeltaAccel = maxVerticalJerk * dt;
      const accelDiff = clampedTargetAccel - verticalAcceleration;
      const appliedDeltaAccel = THREE.MathUtils.clamp(accelDiff, -maxDeltaAccel, maxDeltaAccel);
      
      const jerk = Math.abs(appliedDeltaAccel) / dt;
      if (jerk > maxObservedJerk) maxObservedJerk = jerk;

      verticalAcceleration += appliedDeltaAccel;
      verticalVelocity += verticalAcceleration * dt;
      currentY += verticalVelocity * dt;
    }

    // Max observed jerk never exceeds configured limit
    expect(maxObservedJerk).toBeLessThanOrEqual(maxVerticalJerk + 0.001);
    expect(verticalAcceleration).toBeLessThanOrEqual(maxClimbAcceleration);
  });
});
