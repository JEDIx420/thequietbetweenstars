import * as THREE from 'three';

export type LockableTargetType =
  | 'encounter'
  | 'courier'
  | 'planet'
  | 'anomaly'
  | 'creature'
  | 'titan'
  | 'landmark'
  | 'resource'
  | 'spacecraft';

export interface LockableTarget {
  id: string;
  name: string;
  type: LockableTargetType;
  position: THREE.Vector3;
  radius: number;
  distance?: number;
  isSentient?: boolean;
  isScanned?: boolean;
  data?: any;
}

export interface ForwardConeOptions {
  maxDistance?: number;
  minDot?: number;
}

export class TargetLockSystem {
  private lockedTarget: LockableTarget | null = null;
  private forwardCandidates: LockableTarget[] = [];
  private cycleIndex = 0;

  private static readonly scratchForward = new THREE.Vector3();
  private static readonly scratchDir = new THREE.Vector3();
  private static readonly scratchToTarget = new THREE.Vector3();

  public getLockedTarget(): LockableTarget | null {
    return this.lockedTarget;
  }

  public setLockedTarget(target: LockableTarget | null): void {
    this.lockedTarget = target;
  }

  public clearLockedTarget(): void {
    this.lockedTarget = null;
    this.forwardCandidates = [];
    this.cycleIndex = 0;
  }

  public isTargetLocked(id: string): boolean {
    return this.lockedTarget !== null && this.lockedTarget.id === id;
  }

  /**
   * Filters and sorts targets within the forward vision cone of the ship.
   * If a target is already locked among the forward candidates, cycles to the next one.
   */
  public lockTargetInForwardCone(
    shipPos: THREE.Vector3,
    shipQuat: THREE.Quaternion,
    candidates: LockableTarget[],
    options?: ForwardConeOptions
  ): LockableTarget | null {
    if (candidates.length === 0) {
      this.clearLockedTarget();
      return null;
    }

    const maxDist = options?.maxDistance ?? 4000;
    const minDot = options?.minDot ?? 0.35; // ~69.5° half-angle vision cone

    const shipForward = TargetLockSystem.scratchForward.set(0, 0, -1).applyQuaternion(shipQuat);

    // Filter valid forward candidates
    const filtered: Array<{ target: LockableTarget; dist: number; dot: number; score: number }> = [];

    for (const c of candidates) {
      TargetLockSystem.scratchToTarget.subVectors(c.position, shipPos);
      const dist = TargetLockSystem.scratchToTarget.length();

      if (dist <= 0.01 || dist > maxDist) continue;

      TargetLockSystem.scratchDir.copy(TargetLockSystem.scratchToTarget).multiplyScalar(1 / dist);
      const dot = shipForward.dot(TargetLockSystem.scratchDir);

      if (dot >= minDot) {
        // Priority bonus for interactive objects over distant celestial bodies
        let typeWeight = 0.5;
        switch (c.type) {
          case 'titan':
            typeWeight = 0.1;
            break;
          case 'creature':
            typeWeight = 0.2;
            break;
          case 'encounter':
            typeWeight = 0.2;
            break;
          case 'courier':
            typeWeight = 0.2;
            break;
          case 'landmark':
            typeWeight = 0.3;
            break;
          case 'resource':
            typeWeight = 0.3;
            break;
          case 'anomaly':
            typeWeight = 0.35;
            break;
          case 'planet':
            typeWeight = 0.6;
            break;
          default:
            typeWeight = 0.5;
        }

        // Lower score = higher selection priority
        const score = (1.0 - dot) * 2.0 + (dist / maxDist) * 1.0 + typeWeight;
        filtered.push({ target: c, dist, dot, score });
      }
    }

    if (filtered.length === 0) {
      return null;
    }

    // Sort by ascending score
    filtered.sort((a, b) => a.score - b.score);
    this.forwardCandidates = filtered.map((f) => f.target);

    // If currently locked target is in the list, cycle to the next candidate
    const currentLockedId = this.lockedTarget?.id;
    const currentIdx = currentLockedId
      ? this.forwardCandidates.findIndex((t) => t.id === currentLockedId)
      : -1;

    if (currentIdx !== -1) {
      this.cycleIndex = (currentIdx + 1) % this.forwardCandidates.length;
    } else {
      this.cycleIndex = 0;
    }

    const chosen = this.forwardCandidates[this.cycleIndex];
    chosen.distance = Math.round(shipPos.distanceTo(chosen.position));
    this.lockedTarget = chosen;
    return chosen;
  }

  /**
   * Selects a target from a 3D ray (e.g. from screen tap or mouse click).
   * Uses bounding spheres with friendly touch padding so mobile/tablet taps are reliable.
   */
  public findTargetFromRay(
    ray: THREE.Ray,
    candidates: LockableTarget[],
    touchPadding = 30
  ): LockableTarget | null {
    let bestTarget: LockableTarget | null = null;
    let minRayDist = Infinity;

    for (const c of candidates) {
      TargetLockSystem.scratchToTarget.subVectors(c.position, ray.origin);
      const forwardAlongRay = ray.direction.dot(TargetLockSystem.scratchToTarget);

      // Must be in front of camera
      if (forwardAlongRay <= 0) continue;

      const distToRay = ray.distanceToPoint(c.position);
      const effectiveRadius = Math.max(c.radius, touchPadding);

      if (distToRay <= effectiveRadius) {
        // Prefer entity closest to ray line of sight
        const score = distToRay + (forwardAlongRay * 0.005);
        if (score < minRayDist) {
          minRayDist = score;
          bestTarget = c;
        }
      }
    }

    if (bestTarget) {
      this.lockedTarget = bestTarget;
    }
    return bestTarget;
  }

  /**
   * Updates distance to currently locked target
   */
  public updateTargetDistance(shipPos: THREE.Vector3): void {
    if (this.lockedTarget) {
      this.lockedTarget.distance = Math.round(shipPos.distanceTo(this.lockedTarget.position));
    }
  }

  /**
   * Gets prompt action text based on target type
   */
  public static getActionVerb(target: LockableTarget): { verb: string; keyHint: string } {
    switch (target.type) {
      case 'titan':
        return { verb: 'COMMUNICATE', keyHint: 'SPACE' };
      case 'creature':
        return { verb: 'SCAN SPECIMEN', keyHint: 'SPACE' };
      case 'encounter':
        return { verb: target.isScanned ? 'ANALYZE' : 'SCAN & HARVEST', keyHint: 'SPACE' };
      case 'courier':
        return { verb: 'DOCK & RETRIEVE', keyHint: 'SPACE' };
      case 'landmark':
        return { verb: 'SURVEY LANDMARK', keyHint: 'SPACE' };
      case 'resource':
        return { verb: 'EXTRACT SAMPLE', keyHint: 'SPACE' };
      case 'anomaly':
        return { verb: 'ANALYZE SIGNATURE', keyHint: 'SPACE' };
      case 'planet':
        return { verb: 'ORBITAL INSPECTION', keyHint: 'SPACE' };
      default:
        return { verb: 'INTERACT', keyHint: 'SPACE' };
    }
  }
}
