import * as THREE from 'three';
import type { DockableEntity, DockingStatus } from './DockableEntity';

export class DockingController {
  private activeTarget: DockableEntity | null = null;
  private status: DockingStatus = 'IDLE';
  private transitionTimer = 0;
  private readonly transitionDuration = 2.5; // Smooth 2.5s docking sequence

  private initialShipPos = new THREE.Vector3();
  private targetDockPos = new THREE.Vector3();

  public getStatus(): DockingStatus {
    return this.status;
  }

  public getActiveTarget(): DockableEntity | null {
    return this.activeTarget;
  }

  public requestDocking(
    target: DockableEntity,
    shipPosition: THREE.Vector3
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
    this.targetDockPos.copy(target.position).add(target.dockingPortOffset);
    this.transitionTimer = 0;

    target.onDockInitiated();
    this.status = 'AUTOPILOT_TETHER';
    return { success: true, message: `Docking clearance granted for ${target.name}. Autopilot engaged.` };
  }

  public update(
    dt: number,
    shipPosition: THREE.Vector3,
    _shipQuaternion: THREE.Quaternion
  ): { isDocked: boolean; isTransitioning: boolean } {
    if (this.status === 'IDLE') {
      return { isDocked: false, isTransitioning: false };
    }

    if (this.status === 'AUTOPILOT_TETHER' && this.activeTarget) {
      this.transitionTimer += dt;
      const progress = Math.min(1.0, this.transitionTimer / this.transitionDuration);
      const ease = 0.5 - 0.5 * Math.cos(progress * Math.PI); // smooth sinusoidal ease

      // Interpolate ship smoothly into docking bay
      shipPosition.lerpVectors(this.initialShipPos, this.targetDockPos, ease);

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
      }
      return { isDocked: true, isTransitioning: false };
    }

    if (this.status === 'UNDOCKING' && this.activeTarget) {
      this.transitionTimer += dt;
      const progress = Math.min(1.0, this.transitionTimer / 1.5);
      const ease = 0.5 - 0.5 * Math.cos(progress * Math.PI);

      // Back away from docking port
      const departurePos = this.targetDockPos.clone().add(new THREE.Vector3(0, 0, 160));
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
