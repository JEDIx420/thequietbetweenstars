import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FlightModel } from '../src/game/core/flightModel';
import { SurveyCraft } from '../src/game/scenes/spaceCraft';
import type { NormalizedInputState } from '../src/game/input/InputSource';

describe('FlightModel Transform Ownership & Stability', () => {
  it('enforces strict hierarchy separation: surveyCraft visual updates never alter physics root quaternion', () => {
    const physicsRoot = new THREE.Group();
    const visualRoot = new THREE.Group();
    const surveyCraft = new SurveyCraft();

    visualRoot.add(surveyCraft.group);
    physicsRoot.add(visualRoot);

    const flightModel = new FlightModel(physicsRoot, undefined, undefined, visualRoot);

    const input: NormalizedInputState = {
      axes: { x: 0.8, y: -0.5 },
      throttle: 0.9,
      roll: 0.0,
    };

    const dummyCam = new THREE.PerspectiveCamera(60, 1.5, 0.1, 1000);

    // Simulate 30 frames of active steering
    for (let f = 0; f < 30; f++) {
      flightModel.update(input, 0.016, dummyCam);
      const quatBeforeVisuals = physicsRoot.quaternion.clone();

      // Call SurveyCraft visual update
      surveyCraft.updateVisuals(0.016, input.throttle, 'space');

      // Assert physicsRoot quaternion was not perturbed or overwritten by mesh animations
      expect(physicsRoot.quaternion.x).toBeCloseTo(quatBeforeVisuals.x, 6);
      expect(physicsRoot.quaternion.y).toBeCloseTo(quatBeforeVisuals.y, 6);
      expect(physicsRoot.quaternion.z).toBeCloseTo(quatBeforeVisuals.z, 6);
      expect(physicsRoot.quaternion.w).toBeCloseTo(quatBeforeVisuals.w, 6);
    }
  });

  it('guarantees zero orientation discontinuities (>45 deg / frame) during rapid control reversals', () => {
    const physicsRoot = new THREE.Group();
    const visualRoot = new THREE.Group();
    physicsRoot.add(visualRoot);
    const flightModel = new FlightModel(physicsRoot, undefined, undefined, visualRoot);
    const dummyCam = new THREE.PerspectiveCamera(60, 1.5, 0.1, 1000);

    const inputRight: NormalizedInputState = {
      axes: { x: 1.0, y: 0.0 },
      throttle: 1.0,
      roll: 0.0,
    };

    const inputHardLeft: NormalizedInputState = {
      axes: { x: -1.0, y: 0.0 },
      throttle: 1.0,
      roll: 0.0,
    };

    // Fly right for 15 frames
    for (let f = 0; f < 15; f++) {
      flightModel.update(inputRight, 0.016, dummyCam);
      expect(flightModel.telemetry.hasDiscontinuity).toBe(false);
      expect(flightModel.telemetry.angleDeltaDeg).toBeLessThan(45.0);
    }

    // Instantly slam left for 15 frames
    for (let f = 0; f < 15; f++) {
      flightModel.update(inputHardLeft, 0.016, dummyCam);
      expect(flightModel.telemetry.hasDiscontinuity).toBe(false);
      expect(flightModel.telemetry.angleDeltaDeg).toBeLessThan(45.0);
    }
  });
});
