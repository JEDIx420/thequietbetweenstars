import * as THREE from 'three';
import type { FlightModel } from '../core/flightModel';
import type { PlanetDescriptor, StarSystemDescriptor } from '../systems/PlanetDescriptor';

export type AutopilotTarget =
  | { type: 'planet'; descriptor: PlanetDescriptor; position: THREE.Vector3 }
  | { type: 'system'; descriptor: StarSystemDescriptor }
  | { type: 'vector'; heading: THREE.Vector3; name: string };

export class AutopilotController {
  private flightModel: FlightModel;
  public isActive = false;
  public currentTarget: AutopilotTarget | null = null;
  private alignSpeed = 2.2;

  constructor(flightModel: FlightModel) {
    this.flightModel = flightModel;
  }

  public setTarget(target: AutopilotTarget | null): void {
    this.currentTarget = target;
  }

  public toggle(): boolean {
    if (this.isActive) {
      this.disengage();
      return false;
    } else {
      if (this.currentTarget) {
        this.engage();
        return true;
      }
      return false;
    }
  }

  public engage(): void {
    if (this.currentTarget) {
      this.isActive = true;
    }
  }

  public disengage(): void {
    this.isActive = false;
  }

  public update(dt: number, shipPos: THREE.Vector3): { isAligned: boolean; distance: number } {
    if (!this.isActive || !this.currentTarget) {
      return { isAligned: false, distance: 0 };
    }

    const clampedDt = Math.min(dt, 0.06);
    let targetWorldDir = new THREE.Vector3(0, 0, -1);
    let dist = 0;

    if (this.currentTarget.type === 'planet') {
      const toTarget = new THREE.Vector3().subVectors(this.currentTarget.position, shipPos);
      dist = toTarget.length();
      if (dist > 0.001) {
        targetWorldDir.copy(toTarget).normalize();
      }
    } else if (this.currentTarget.type === 'vector') {
      targetWorldDir.copy(this.currentTarget.heading).normalize();
      dist = 5000;
    } else if (this.currentTarget.type === 'system') {
      // Direction in sector space
      targetWorldDir.set(
        this.currentTarget.descriptor.sectorX,
        this.currentTarget.descriptor.sectorY,
        this.currentTarget.descriptor.sectorZ
      ).normalize();
      dist = 10000;
    }

    // Desired craft orientation pointing along targetWorldDir
    const currentForward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.flightModel.quaternion);
    const dot = currentForward.dot(targetWorldDir);
    const isAligned = dot > 0.985;

    // Smooth spherical interpolation toward target orientation
    const targetQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), targetWorldDir);
    this.flightModel.quaternion.slerp(targetQuat, Math.min(1, clampedDt * this.alignSpeed));

    // When aligned and in planet transit, apply gentle cruising thrust
    if (isAligned && this.currentTarget.type === 'planet' && dist > (this.currentTarget.descriptor.radius + 180)) {
      this.flightModel.velocity.addScaledVector(currentForward, 35 * clampedDt);
    }

    return { isAligned, distance: dist };
  }
}
