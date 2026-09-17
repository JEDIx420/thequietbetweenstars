import * as THREE from 'three';

export type CelestialType = 'star' | 'planet' | 'moon';

export interface CelestialBody {
  id: string;
  name: string;
  type: CelestialType;
  position: THREE.Vector3;
  physicalRadius: number;
  exclusionRadius: number;
  atmosphereRadius: number;
  dangerRadius?: number;
}

export interface CollisionResult {
  hasCollided: boolean;
  collidedBody?: CelestialBody;
  isDanger?: boolean;
  penetrationDepth: number;
  surfaceNormal?: THREE.Vector3;
}

export class CelestialPhysicsSystem {
  public bodies: CelestialBody[] = [];

  constructor(bodies: CelestialBody[] = []) {
    this.bodies = bodies;
  }

  public setBodies(bodies: CelestialBody[]): void {
    this.bodies = bodies;
  }

  public addBody(body: CelestialBody): void {
    this.bodies.push(body);
  }

  private static readonly scratchPrevPos = new THREE.Vector3();
  private static readonly scratchDelta = new THREE.Vector3();
  private static readonly scratchPrevDelta = new THREE.Vector3();
  private static readonly scratchHitNormal = new THREE.Vector3();
  private static readonly scratchSeg = new THREE.Vector3();
  private static readonly scratchHitPoint = new THREE.Vector3();
  private static readonly scratchNormal = new THREE.Vector3();
  private static readonly defaultNormal = new THREE.Vector3(0, 1, 0);

  private readonly cachedResult: CollisionResult = {
    hasCollided: false,
    penetrationDepth: 0,
    surfaceNormal: new THREE.Vector3(),
  };

  /**
   * Resolves collision and proximity physics for the ship.
   * Prevents tunneling through celestial bodies and projects velocity onto the tangent plane.
   */
  public resolvePhysics(
    shipPosition: THREE.Vector3,
    shipVelocity: THREE.Vector3,
    dt: number
  ): CollisionResult {
    this.cachedResult.hasCollided = false;
    this.cachedResult.collidedBody = undefined;
    this.cachedResult.isDanger = false;
    this.cachedResult.penetrationDepth = 0;

    // prevPos = shipPosition - shipVelocity * dt
    const prevPos = CelestialPhysicsSystem.scratchPrevPos.copy(shipPosition).addScaledVector(shipVelocity, -dt);

    for (const body of this.bodies) {
      const delta = CelestialPhysicsSystem.scratchDelta.subVectors(shipPosition, body.position);
      const dist = delta.length();
      const prevDelta = CelestialPhysicsSystem.scratchPrevDelta.subVectors(prevPos, body.position);
      const prevDist = prevDelta.length();

      // Continuous swept collision detection: check if segment from prevPos to shipPosition intersects exclusion sphere
      let sweptHit = false;
      const hitNormal = CelestialPhysicsSystem.scratchHitNormal.copy(CelestialPhysicsSystem.defaultNormal);

      if (dist < body.exclusionRadius) {
        // Direct penetration
        sweptHit = true;
        // Direction-safe normal: always face the approach vector (prevDelta) so we never clamp out the back side
        if (prevDist > 0.001) {
          hitNormal.copy(prevDelta).normalize();
        } else if (dist > 0.001) {
          hitNormal.copy(delta).normalize();
        }
      } else if (prevDist >= body.exclusionRadius) {
        // Check swept segment intersection (anti-tunneling at high speeds)
        const seg = CelestialPhysicsSystem.scratchSeg.subVectors(shipPosition, prevPos);
        const segLenSq = seg.lengthSq();
        if (segLenSq > 0.0001) {
          const a = segLenSq;
          const b = 2 * prevDelta.dot(seg);
          const c = prevDist * prevDist - body.exclusionRadius * body.exclusionRadius;
          const discriminant = b * b - 4 * a * c;
          if (discriminant >= 0) {
            const sqrtDisc = Math.sqrt(discriminant);
            const tEntry = (-b - sqrtDisc) / (2 * a);
            if (tEntry >= 0 && tEntry <= 1.0) {
              sweptHit = true;
              const hitPoint = CelestialPhysicsSystem.scratchHitPoint.copy(prevPos).addScaledVector(seg, tEntry);
              hitNormal.copy(hitPoint).sub(body.position).normalize();
            }
          }
        }
      }

      // Resolve collision with exclusion boundary
      if (sweptHit) {
        const penetration = Math.max(0, body.exclusionRadius - dist);

        // Clamp ship position strictly to exclusion radius on the approach surface
        shipPosition.copy(body.position).addScaledVector(hitNormal, body.exclusionRadius);

        // Project velocity onto tangent plane to allow smooth orbital gliding
        const inwardSpeed = shipVelocity.dot(hitNormal);
        if (inwardSpeed < 0) {
          // Cancel inward velocity and deflect along tangent
          shipVelocity.addScaledVector(hitNormal, -inwardSpeed);
          // Apply gentle outward deflection impulse (prevent sticking)
          const reboundSpeed = body.type === 'star' ? 18 : 6;
          shipVelocity.addScaledVector(hitNormal, reboundSpeed);
        }

        this.cachedResult.hasCollided = true;
        this.cachedResult.collidedBody = body;
        this.cachedResult.isDanger = body.type === 'star' || (body.dangerRadius !== undefined && dist < body.dangerRadius);
        this.cachedResult.penetrationDepth = penetration;
        this.cachedResult.surfaceNormal?.copy(hitNormal);

        return this.cachedResult;
      }

      // Progressive soft atmospheric buffer (exclusionRadius to 1.4 * exclusionRadius)
      const bufferOuter = body.exclusionRadius * 1.4;
      if (dist < bufferOuter && dist >= body.exclusionRadius) {
        const normal = CelestialPhysicsSystem.scratchNormal;
        if (dist > 0.001) {
          normal.copy(delta).normalize();
        } else {
          normal.copy(CelestialPhysicsSystem.defaultNormal);
        }
        const inwardSpeed = shipVelocity.dot(normal);
        if (inwardSpeed < 0) {
          // Progressively damp inward velocity as ship approaches exclusion boundary
          const tBuffer = 1 - (dist - body.exclusionRadius) / (bufferOuter - body.exclusionRadius);
          shipVelocity.addScaledVector(normal, -inwardSpeed * tBuffer * 0.75);
        }
      }

      // Subtle gravitational assist in upper atmosphere envelope
      if (dist < body.atmosphereRadius && dist >= body.exclusionRadius) {
        const normal = CelestialPhysicsSystem.scratchNormal.copy(delta).divideScalar(dist);
        // Very gentle orbital pull towards planet (relaxing cosmic drift, not harsh black hole)
        const gravityStrength = (body.type === 'star' ? 12 : 6) * (1 - (dist - body.exclusionRadius) / (body.atmosphereRadius - body.exclusionRadius));
        shipVelocity.addScaledVector(normal, -gravityStrength * dt);
      }
    }

    return this.cachedResult;
  }

  /**
   * Returns information about the closest celestial body to the ship.
   */
  public getNearestBody(shipPosition: THREE.Vector3): {
    body: CelestialBody;
    distance: number;
    altitude: number;
    inAtmosphere: boolean;
    inExclusion: boolean;
  } | null {
    if (this.bodies.length === 0) return null;

    let nearest: CelestialBody | null = null;
    let minDistance = Infinity;

    for (const body of this.bodies) {
      const dist = shipPosition.distanceTo(body.position);
      if (dist < minDistance) {
        minDistance = dist;
        nearest = body;
      }
    }

    if (!nearest) return null;

    const altitude = Math.max(0, minDistance - nearest.physicalRadius);

    return {
      body: nearest,
      distance: minDistance,
      altitude,
      inAtmosphere: minDistance <= nearest.atmosphereRadius,
      inExclusion: minDistance <= nearest.exclusionRadius,
    };
  }
}
