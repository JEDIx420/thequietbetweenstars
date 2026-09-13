import * as THREE from 'three';
import { WorldPosition } from './WorldPosition';

export interface RebaseListener {
  onRebase: (offset: THREE.Vector3) => void;
}

/**
 * FloatingOrigin
 * Prevents 32-bit floating point precision degradation in Three.js when travelling far into space.
 * When the ship's render position exceeds rebaseThreshold, the render origin is shifted back,
 * subtracting the offset from all active render objects while updating the logical WorldPosition.
 */
export class FloatingOrigin {
  public readonly rebaseThreshold: number;
  private listeners: RebaseListener[] = [];
  public totalRebaseOffset: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public rebaseCount = 0;

  constructor(rebaseThreshold = 2500) {
    this.rebaseThreshold = rebaseThreshold;
  }

  public registerListener(listener: RebaseListener): void {
    this.listeners.push(listener);
  }

  public unregisterListener(listener: RebaseListener): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  /**
   * Performs an immediate floating-origin rebase by shifting the given render position.
   */
  public executeRebase(
    shipRenderPos: THREE.Vector3,
    worldPos: WorldPosition,
    activeRootObjects: THREE.Object3D[],
    shiftVector?: THREE.Vector3
  ): THREE.Vector3 {
    const shift = shiftVector ? shiftVector.clone() : shipRenderPos.clone();
    const offset = shift.clone().negate();

    // 1. Advance logical universe coordinates
    worldPos.add(shift);

    // 2. Shift ship render position
    shipRenderPos.add(offset);

    // 3. Shift active root objects
    this.totalRebaseOffset.add(shift);
    this.rebaseCount++;

    for (const obj of activeRootObjects) {
      obj.position.add(offset);
    }

    // 4. Notify listeners (such as camera target positions, SpaceScene, particles)
    for (const listener of this.listeners) {
      listener.onRebase(offset);
    }

    return offset;
  }

  /**
   * Checks whether the current ship render position requires rebasing.
   * If so, shifts ship position, notifies all registered scene listeners, and updates world position.
   */
  public checkAndRebase(
    shipRenderPos: THREE.Vector3,
    worldPos: WorldPosition,
    activeRootObjects: THREE.Object3D[]
  ): boolean {
    const distSq = shipRenderPos.lengthSq();
    if (distSq < this.rebaseThreshold * this.rebaseThreshold) {
      return false;
    }

    this.executeRebase(shipRenderPos, worldPos, activeRootObjects);
    return true;
  }
}
