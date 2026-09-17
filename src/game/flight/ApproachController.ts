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
  private readonly targetHolder: TargetPlanetInfo = {
    planet: null as unknown as PlanetDescriptor,
    position: new THREE.Vector3(),
    distance: 0,
    approachRatio: 0,
    canInspect: false,
  };

  private static readonly scratchDirToPlanet = new THREE.Vector3();
  private static readonly scratchToPlanet = new THREE.Vector3();

  public update(
    shipPos: THREE.Vector3,
    planets: Array<{ descriptor: PlanetDescriptor; position: THREE.Vector3 }>,
    shipForward?: THREE.Vector3
  ): TargetPlanetInfo | null {
    let nearestPlanet: PlanetDescriptor | null = null;
    let nearestPos: THREE.Vector3 | null = null;
    let nearestDist = 0;
    let nearestRatio = 0;
    let nearestCanInspect = false;
    let minScore = Infinity;

    for (const item of planets) {
      const dist = shipPos.distanceTo(item.position);
      const approachDistance = item.descriptor.radius + ApproachController.APPROACH_TRIGGER_DIST;

      if (dist < approachDistance) {
        // Prioritize planet ahead of the ship's forward vector over one behind
        let score = dist;
        if (shipForward && dist > 0.1) {
          ApproachController.scratchDirToPlanet.subVectors(item.position, shipPos).normalize();
          const forwardDot = shipForward.dot(ApproachController.scratchDirToPlanet); // +1.0 dead ahead, -1.0 behind
          // Planets ahead get a score discount (0.65x), planets behind get a penalty (1.35x)
          const headingFactor = 1.0 - (forwardDot * 0.35);
          score = dist * headingFactor;
        }

        if (score < minScore) {
          minScore = score;
          const orbitDistance = item.descriptor.radius + ApproachController.ORBIT_INSPECT_DIST;
          const ratio = Math.max(0, Math.min(1, 1 - (dist - item.descriptor.radius) / ApproachController.APPROACH_TRIGGER_DIST));

          nearestPlanet = item.descriptor;
          nearestPos = item.position;
          nearestDist = dist;
          nearestRatio = ratio;
          nearestCanInspect = dist <= orbitDistance;
        }
      }
    }

    if (nearestPlanet && nearestPos) {
      this.targetHolder.planet = nearestPlanet;
      this.targetHolder.position.copy(nearestPos);
      this.targetHolder.distance = nearestDist;
      this.targetHolder.approachRatio = nearestRatio;
      this.targetHolder.canInspect = nearestCanInspect;
      this.activeTarget = this.targetHolder;
      return this.targetHolder;
    }

    this.activeTarget = null;
    return null;
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

    ApproachController.scratchToPlanet.subVectors(this.activeTarget.position, shipPos);
    const dist = ApproachController.scratchToPlanet.length();
    const minSafeDist = this.activeTarget.planet.radius + ApproachController.MIN_SAFE_DIST_MARGIN;

    if (dist < minSafeDist) {
      // Inward velocity projection
      ApproachController.scratchToPlanet.normalize();
      const dot = velocity.dot(ApproachController.scratchToPlanet);
      if (dot > 0) {
        // Cancel inward velocity component and deflect tangentially
        velocity.addScaledVector(ApproachController.scratchToPlanet, -dot * 1.2);
      }
    } else if (dist < minSafeDist * 1.8) {
      // Gentle progressive approach deceleration
      velocity.multiplyScalar(0.96);
    }
  }
}
