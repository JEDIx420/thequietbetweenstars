import * as THREE from 'three';
import type { DockableEntity, DockingStatus } from './DockableEntity';

export class DockingController {
  private activeTarget: DockableEntity | null = null;
  private status: DockingStatus = 'IDLE';
  private transitionTimer = 0;
  private readonly transitionDuration = 2.5; // Smooth 2.5s docking sequence

  private initialShipPos = new THREE.Vector3();
  private initialShipQuat = new THREE.Quaternion();
  private targetDockPos = new THREE.Vector3();
  private targetDockQuat = new THREE.Quaternion();

  public getStatus(): DockingStatus {
    return this.status;
  }

  public getProgress(): number {
    const duration = this.status === 'UNDOCKING' ? 1.5 : this.transitionDuration;
    return Math.min(1.0, Math.max(0, this.transitionTimer / duration));
  }

  public getActiveTarget(): DockableEntity | null {
    return this.activeTarget;
  }

  public requestDocking(
    target: DockableEntity,
    shipPosition: THREE.Vector3,
    shipQuaternion?: THREE.Quaternion
  ): { success: boolean; message: string } {
    if (this.status !== 'IDLE') {
      return { success: false, message: 'Docking sequence already in progress.' };
    }

    const check = target.canDock(shipPosition);
    if (!check.allowed) {
      return { success: false, message: check.reason || 'Cannot dock with target.' };
    }

    this.activeTarget = target;
    this.status = 'CLEARED';
    this.initialShipPos.copy(shipPosition);
    if (shipQuaternion) {
      this.initialShipQuat.copy(shipQuaternion);
    }
    this.targetDockPos.copy(target.position).add(target.dockingPortOffset);

    // Compute target docking alignment orientation
    const toStation = new THREE.Vector3().subVectors(target.position, this.targetDockPos).normalize();
    if (toStation.lengthSq() > 0.001) {
      const lookMat = new THREE.Matrix4().lookAt(this.targetDockPos, target.position, new THREE.Vector3(0, 1, 0));
      this.targetDockQuat.setFromRotationMatrix(lookMat);
    } else if (shipQuaternion) {
      this.targetDockQuat.copy(shipQuaternion);
    }

    this.transitionTimer = 0;

    target.onDockInitiated();
    this.status = 'AUTOPILOT_TETHER';
    return { success: true, message: `Docking clearance granted for ${target.name}. Autopilot tether engaged.` };
  }

  public update(
    dt: number,
    shipPosition: THREE.Vector3,
    shipQuaternion: THREE.Quaternion
  ): { isDocked: boolean; isTransitioning: boolean } {
    if (this.status === 'IDLE') {
      return { isDocked: false, isTransitioning: false };
    }

    if (this.status === 'AUTOPILOT_TETHER' && this.activeTarget) {
      this.transitionTimer += dt;
      const progress = Math.min(1.0, this.transitionTimer / this.transitionDuration);
      const ease = 0.5 - 0.5 * Math.cos(progress * Math.PI); // smooth sinusoidal ease

      // Interpolate ship position and orientation smoothly into docking bay
      shipPosition.lerpVectors(this.initialShipPos, this.targetDockPos, ease);
      shipQuaternion.slerpQuaternions(this.initialShipQuat, this.targetDockQuat, ease);

      if (progress >= 1.0) {
        this.status = 'DOCKED';
        this.activeTarget.onDockComplete();
        return { isDocked: true, isTransitioning: false };
      }

      return { isDocked: false, isTransitioning: true };
    }

    if (this.status === 'DOCKED') {
      if (this.activeTarget) {
        shipPosition.copy(this.targetDockPos);
        shipQuaternion.copy(this.targetDockQuat);
      }
      return { isDocked: true, isTransitioning: false };
    }

    if (this.status === 'UNDOCKING' && this.activeTarget) {
      this.transitionTimer += dt;
      const progress = Math.min(1.0, this.transitionTimer / 1.5);
      const ease = 0.5 - 0.5 * Math.cos(progress * Math.PI);

      // Back away along docking port normal
      const offsetDir = this.activeTarget.dockingPortOffset.lengthSq() > 0.001
        ? this.activeTarget.dockingPortOffset.clone().normalize()
        : new THREE.Vector3(0, 0, 1);
      const departurePos = this.targetDockPos.clone().add(offsetDir.multiplyScalar(160));
      shipPosition.lerpVectors(this.targetDockPos, departurePos, ease);

      if (progress >= 1.0) {
        this.activeTarget.onUndock();
        this.activeTarget = null;
        this.status = 'IDLE';
        return { isDocked: false, isTransitioning: false };
      }

      return { isDocked: false, isTransitioning: true };
    }

    return { isDocked: false, isTransitioning: false };
  }

  public undock(): boolean {
    if (this.status !== 'DOCKED') return false;
    this.status = 'UNDOCKING';
    this.transitionTimer = 0;
    return true;
  }
}
