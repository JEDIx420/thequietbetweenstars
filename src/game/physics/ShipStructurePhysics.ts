import * as THREE from 'three';

export interface StructureCollider {
  id: string;
  name: string;
  position: THREE.Vector3;
  radius: number;
  dockingPortOffset?: THREE.Vector3;
  dockingCorridorRadius?: number;
  entityKind: 'STATION' | 'VESSEL' | 'TRAFFIC';
}

export interface StructureCollisionResult {
  hasCollided: boolean;
  collidedName?: string;
  collidedId?: string;
  penetrationDepth: number;
  surfaceNormal: THREE.Vector3;
  impactSpeed: number;
}

export class ShipStructurePhysicsSystem {
  private colliders: StructureCollider[] = [];
  private activeBypassId: string | null = null;

  // Scratch vectors for zero GC in simulation loop
  private static readonly scratchDelta = new THREE.Vector3();
  private static readonly scratchPrevPos = new THREE.Vector3();
  private static readonly scratchPrevDelta = new THREE.Vector3();
  private static readonly scratchSeg = new THREE.Vector3();
  private static readonly scratchHitPoint = new THREE.Vector3();
  private static readonly scratchHitNormal = new THREE.Vector3();
  private static readonly defaultNormal = new THREE.Vector3(0, 1, 0);
  private static readonly scratchDockWorld = new THREE.Vector3();
  private static readonly scratchToDock = new THREE.Vector3();

  private readonly cachedResult: StructureCollisionResult = {
    hasCollided: false,
    penetrationDepth: 0,
    surfaceNormal: new THREE.Vector3(),
    impactSpeed: 0,
  };

  public setColliders(colliders: StructureCollider[]): void {
    this.colliders = colliders;
  }

  public setActiveBypassId(id: string | null): void {
    this.activeBypassId = id;
  }

  public getColliders(): StructureCollider[] {
    return this.colliders;
  }

  /**
   * Resolves physical collisions between the player ship and large structures/vessels.
   * Clamps ship position to the outer hull envelope, deflects velocity tangentially,
   * and applies an elastic rebound impulse.
   */
  public resolveCollisions(
    shipPosition: THREE.Vector3,
    shipVelocity: THREE.Vector3,
    dt: number
  ): StructureCollisionResult {
    this.cachedResult.hasCollided = false;
    this.cachedResult.collidedName = undefined;
    this.cachedResult.collidedId = undefined;
    this.cachedResult.penetrationDepth = 0;
    this.cachedResult.impactSpeed = 0;

    if (this.colliders.length === 0) {
      return this.cachedResult;
    }

    const prevPos = ShipStructurePhysicsSystem.scratchPrevPos
      .copy(shipPosition)
      .addScaledVector(shipVelocity, -dt);

    for (let i = 0; i < this.colliders.length; i++) {
      const col = this.colliders[i];

      // Bypass currently docked or tethered target
      if (this.activeBypassId && col.id === this.activeBypassId) {
        continue;
      }

      const delta = ShipStructurePhysicsSystem.scratchDelta.subVectors(shipPosition, col.position);
      const dist = delta.length();
      const prevDelta = ShipStructurePhysicsSystem.scratchPrevDelta.subVectors(prevPos, col.position);
      const prevDist = prevDelta.length();

      // Quick bounding sphere rejection
      const maxCheckDist = col.radius + 150.0;
      if (dist > maxCheckDist && prevDist > maxCheckDist) {
        continue;
      }

      // Check if ship is in the designated docking approach corridor
      if (col.dockingPortOffset) {
        const dockWorld = ShipStructurePhysicsSystem.scratchDockWorld
          .copy(col.position)
          .add(col.dockingPortOffset);
        const toDock = ShipStructurePhysicsSystem.scratchToDock.subVectors(shipPosition, dockWorld);
        const dockDist = toDock.length();
        const corridorRadius = col.dockingCorridorRadius ?? 24.0;

        // If pilot is aligned within the docking corridor, allow safe approach without deflection
        if (dockDist < corridorRadius) {
          continue;
        }
      }

      let sweptHit = false;
      const hitNormal = ShipStructurePhysicsSystem.scratchHitNormal.copy(
        ShipStructurePhysicsSystem.defaultNormal
      );

      if (dist < col.radius) {
        // Direct penetration
        sweptHit = true;
        if (prevDist > 0.001) {
          hitNormal.copy(prevDelta).normalize();
        } else if (dist > 0.001) {
          hitNormal.copy(delta).normalize();
        }
      } else if (prevDist >= col.radius) {
        // Continuous swept segment anti-tunneling
        const seg = ShipStructurePhysicsSystem.scratchSeg.subVectors(shipPosition, prevPos);
        const segLenSq = seg.lengthSq();
        if (segLenSq > 0.0001) {
          const a = segLenSq;
          const b = 2 * prevDelta.dot(seg);
          const c = prevDist * prevDist - col.radius * col.radius;
          const discriminant = b * b - 4 * a * c;
          if (discriminant >= 0) {
            const sqrtDisc = Math.sqrt(discriminant);
            const tEntry = (-b - sqrtDisc) / (2 * a);
            if (tEntry >= 0 && tEntry <= 1.0) {
              sweptHit = true;
              const hitPoint = ShipStructurePhysicsSystem.scratchHitPoint
                .copy(prevPos)
                .addScaledVector(seg, tEntry);
              hitNormal.copy(hitPoint).sub(col.position).normalize();
            }
          }
        }
      }

      if (sweptHit) {
        const penetration = Math.max(0, col.radius - dist);

        // Clamp ship position strictly to outside the hull boundary
        shipPosition.copy(col.position).addScaledVector(hitNormal, col.radius + 0.1);

        // Calculate inward collision speed
        const inwardSpeed = shipVelocity.dot(hitNormal);
        if (inwardSpeed < 0) {
          // Cancel inward component
          shipVelocity.addScaledVector(hitNormal, -inwardSpeed);

          // Apply elastic rebound impulse (restitution)
          const reboundSpeed = Math.min(24.0, Math.max(10.0, Math.abs(inwardSpeed) * 0.45));
          shipVelocity.addScaledVector(hitNormal, reboundSpeed);
        }

        this.cachedResult.hasCollided = true;
        this.cachedResult.collidedName = col.name;
        this.cachedResult.collidedId = col.id;
        this.cachedResult.penetrationDepth = penetration;
        this.cachedResult.surfaceNormal.copy(hitNormal);
        this.cachedResult.impactSpeed = Math.abs(inwardSpeed);

        return this.cachedResult;
      }
    }

    return this.cachedResult;
  }

  /**
   * Checks if any large collider is dangerously close (< 1.5x hull radius).
   */
  public checkProximityWarning(
    shipPosition: THREE.Vector3,
    shipVelocity: THREE.Vector3
  ): { isWarning: boolean; colliderName?: string; distance?: number } {
    if (this.colliders.length === 0) return { isWarning: false };

    const speed = shipVelocity.length();
    if (speed < 20) return { isWarning: false };

    for (let i = 0; i < this.colliders.length; i++) {
      const col = this.colliders[i];
      if (this.activeBypassId && col.id === this.activeBypassId) continue;

      const dist = shipPosition.distanceTo(col.position);
      const warnRadius = col.radius * 1.55;

      if (dist < warnRadius && dist > col.radius) {
        // Check if moving towards the collider
        ShipStructurePhysicsSystem.scratchDelta.subVectors(col.position, shipPosition).normalize();
        const closingSpeed = shipVelocity.dot(ShipStructurePhysicsSystem.scratchDelta);
        if (closingSpeed > 20) {
          return {
            isWarning: true,
            colliderName: col.name,
            distance: Math.round(dist - col.radius),
          };
        }
      }
    }

    return { isWarning: false };
  }
}
