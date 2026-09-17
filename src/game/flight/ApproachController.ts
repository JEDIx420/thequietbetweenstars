import * as THREE from 'three';
import type { PlanetDescriptor } from '../systems/PlanetDescriptor';

export interface TargetPlanetInfo {
  planet: PlanetDescriptor;
  position: THREE.Vector3;
  distance: number;
  approachRatio: number; // 0 (far) to 1.0 (at boundary)
  canInspect: boolean;
}

/**
 * ApproachController
 * Detects nearby planets, limits speed smoothly within approach envelopes,
 * and signals contextual inspection eligibility to HUD and controls.
 */
export class ApproachController {
  public static readonly APPROACH_TRIGGER_DIST = 900;
  public static readonly ORBIT_INSPECT_DIST = 450;
  public static readonly MIN_SAFE_DIST_MARGIN = 28;

  public activeTarget: TargetPlanetInfo | null = null;

  public update(
    shipPos: THREE.Vector3,
    planets: Array<{ descriptor: PlanetDescriptor; position: THREE.Vector3 }>,
    shipForward?: THREE.Vector3
  ): TargetPlanetInfo | null {
    let nearest: TargetPlanetInfo | null = null;
    let minScore = Infinity;

    for (const item of planets) {
      const dist = shipPos.distanceTo(item.position);
      const approachDistance = item.descriptor.radius + ApproachController.APPROACH_TRIGGER_DIST;

      if (dist < approachDistance) {
        // Prioritize planet ahead of the ship's forward vector over one behind
        let score = dist;
        if (shipForward && dist > 0.1) {
          const dirToPlanet = item.position.clone().sub(shipPos).normalize();
          const forwardDot = shipForward.dot(dirToPlanet); // +1.0 dead ahead, -1.0 behind
          // Planets ahead get a score discount (0.65x), planets behind get a penalty (1.35x)
          const headingFactor = 1.0 - (forwardDot * 0.35);
          score = dist * headingFactor;
        }

        if (score < minScore) {
          minScore = score;
          const orbitDistance = item.descriptor.radius + ApproachController.ORBIT_INSPECT_DIST;
          const ratio = Math.max(0, Math.min(1, 1 - (dist - item.descriptor.radius) / ApproachController.APPROACH_TRIGGER_DIST));

          nearest = {
            planet: item.descriptor,
            position: item.position.clone(),
            distance: dist,
            approachRatio: ratio,
            canInspect: dist <= orbitDistance,
          };
        }
      }
    }

    this.activeTarget = nearest;
    return nearest;
  }

  /**
   * Floating-origin offset rebase handler
   */
  public onRebase(offset: THREE.Vector3): void {
    if (this.activeTarget) {
      this.activeTarget.position.add(offset);
    }
  }

  /**
   * Applies safety braking when penetrating deep into an approach envelope
   */
  public applyApproachBraking(velocity: THREE.Vector3, shipPos: THREE.Vector3): void {
    if (!this.activeTarget) return;

    const toPlanet = this.activeTarget.position.clone().sub(shipPos);
    const dist = toPlanet.length();
    const minSafeDist = this.activeTarget.planet.radius + ApproachController.MIN_SAFE_DIST_MARGIN;

    if (dist < minSafeDist) {
      // Inward velocity projection
      const inwardNormal = toPlanet.normalize();
      const dot = velocity.dot(inwardNormal);
      if (dot > 0) {
        // Cancel inward velocity component and deflect tangentially
        velocity.addScaledVector(inwardNormal, -dot * 1.2);
      }
    } else if (dist < minSafeDist * 1.8) {
      // Gentle progressive approach deceleration
      velocity.multiplyScalar(0.96);
    }
  }
}
