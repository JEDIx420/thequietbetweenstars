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

  public addBody(body: CelestialBody): void {
    this.bodies.push(body);
  }

  /**
   * Resolves collision and proximity physics for the ship.
   * Prevents tunneling through celestial bodies and projects velocity onto the tangent plane.
   */
  public resolvePhysics(
    shipPosition: THREE.Vector3,
    shipVelocity: THREE.Vector3,
    dt: number
  ): CollisionResult {
    let result: CollisionResult = {
      hasCollided: false,
      penetrationDepth: 0,
    };

    for (const body of this.bodies) {
      const delta = new THREE.Vector3().subVectors(shipPosition, body.position);
      const dist = delta.length();

      // Check collision with exclusion boundary
      if (dist < body.exclusionRadius) {
        const penetration = body.exclusionRadius - dist;
        const normal = dist > 0.0001 ? delta.clone().divideScalar(dist) : new THREE.Vector3(0, 1, 0);

        // Clamp ship position strictly to exclusion radius
        shipPosition.copy(body.position).addScaledVector(normal, body.exclusionRadius);

        // Project velocity onto tangent plane to allow smooth orbital gliding
        const inwardSpeed = shipVelocity.dot(normal);
        if (inwardSpeed < 0) {
          // Cancel inward velocity and deflect along tangent
          shipVelocity.addScaledVector(normal, -inwardSpeed);
          // Apply gentle outward deflection impulse (prevent sticking)
          const reboundSpeed = body.type === 'star' ? 18 : 6;
          shipVelocity.addScaledVector(normal, reboundSpeed);
        }

        result = {
          hasCollided: true,
          collidedBody: body,
          isDanger: body.type === 'star' || (body.dangerRadius !== undefined && dist < body.dangerRadius),
          penetrationDepth: penetration,
          surfaceNormal: normal,
        };

        break;
      }

      // Subtle gravitational assist in upper atmosphere envelope
      if (dist < body.atmosphereRadius && dist >= body.exclusionRadius) {
        const normal = delta.clone().divideScalar(dist);
        // Very gentle orbital pull towards planet (relaxing cosmic drift, not harsh black hole)
        const gravityStrength = (body.type === 'star' ? 12 : 6) * (1 - (dist - body.exclusionRadius) / (body.atmosphereRadius - body.exclusionRadius));
        shipVelocity.addScaledVector(normal, -gravityStrength * dt);
      }
    }

    return result;
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
