import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ShipStructurePhysicsSystem, type StructureCollider } from '../src/game/physics/ShipStructurePhysics';
import { FlightModel } from '../src/game/core/flightModel';

describe('ShipStructurePhysicsSystem', () => {
  const stationCollider: StructureCollider = {
    id: 'station-central',
    name: 'Central Trading Spire',
    position: new THREE.Vector3(0, 0, 500),
    radius: 75,
    dockingPortOffset: new THREE.Vector3(0, 0, 75),
    dockingCorridorRadius: 25,
    entityKind: 'STATION',
  };

  const capitalShipCollider: StructureCollider = {
    id: 'flagship-vessel',
    name: 'Cathedral Flagship',
    position: new THREE.Vector3(200, 0, 0),
    radius: 50,
    entityKind: 'VESSEL',
  };

  it('clamps ship position to exterior hull boundary and reflects velocity upon penetration', () => {
    const physics = new ShipStructurePhysicsSystem();
    physics.setColliders([stationCollider]);

    // Position penetrating 15m inside the 75m station radius from the side (outside docking corridor)
    const shipPos = new THREE.Vector3(60, 0, 500); // distance is 60m from (0,0,500), radius is 75m
    const shipVel = new THREE.Vector3(-50, 0, 0); // moving inwards (-X)
    const dt = 0.05;

    const res = physics.resolveCollisions(shipPos, shipVel, dt);

    expect(res.hasCollided).toBe(true);
    expect(res.collidedName).toBe('Central Trading Spire');
    expect(res.penetrationDepth).toBeCloseTo(15);
    // Ship position must be pushed outside the 75m radius (75.1m from station center)
    expect(shipPos.distanceTo(stationCollider.position)).toBeGreaterThanOrEqual(75.0);
    // Inward velocity (-X) must be canceled and reversed to +X rebound
    expect(shipVel.x).toBeGreaterThan(0);
  });

  it('prevents tunneling at high speed via continuous swept intersection', () => {
    const physics = new ShipStructurePhysicsSystem();
    physics.setColliders([capitalShipCollider]);

    // Ship travels at 300 m/s along +X. In a 0.5s step, it moves 150m,
    // which would tunnel clean through the 50m radius ship centered at (200, 0, 0)
    const shipPos = new THREE.Vector3(260, 0, 0); // candidate position past center
    const shipVel = new THREE.Vector3(300, 0, 0);
    const dt = 0.5; // prevPos was 260 - 150 = 110 (in front of ship at 200 - 50 = 150)

    const res = physics.resolveCollisions(shipPos, shipVel, dt);

    expect(res.hasCollided).toBe(true);
    expect(res.collidedName).toBe('Cathedral Flagship');
    // Crucial: ship must be clamped to approach entry side (X <= 150)
    expect(shipPos.x).toBeLessThan(200);
    expect(shipPos.distanceTo(capitalShipCollider.position)).toBeCloseTo(50.1, 1);
    // Inward velocity (+X) must be reversed
    expect(shipVel.x).toBeLessThanOrEqual(0);
  });

  it('permits approach within designated docking corridor without collision deflection', () => {
    const physics = new ShipStructurePhysicsSystem();
    physics.setColliders([stationCollider]);

    // Docking port is at station.position + (0, 0, 75) = (0, 0, 575)
    // Corridor radius is 25. Position at (0, 0, 570) is 5m from port
    const shipPos = new THREE.Vector3(0, 0, 570);
    const shipVel = new THREE.Vector3(0, 0, -15);
    const dt = 0.05;

    const res = physics.resolveCollisions(shipPos, shipVel, dt);

    // Should NOT collide or deflect because ship is in the designated docking corridor
    expect(res.hasCollided).toBe(false);
    expect(shipVel.z).toBe(-15);
  });

  it('bypasses collisions when an entity is designated as active bypass (docked/tethered)', () => {
    const physics = new ShipStructurePhysicsSystem();
    physics.setColliders([stationCollider, capitalShipCollider]);
    physics.setActiveBypassId('station-central');

    const shipPos = new THREE.Vector3(0, 0, 520); // 20m from station center (deep inside 75m)
    const shipVel = new THREE.Vector3(0, 0, 0);
    const dt = 0.05;

    const res = physics.resolveCollisions(shipPos, shipVel, dt);

    expect(res.hasCollided).toBe(false);
  });

  it('triggers proximity warning when closing on a large structure at speed', () => {
    const physics = new ShipStructurePhysicsSystem();
    physics.setColliders([capitalShipCollider]);

    // Distance 65m from capitalShipCollider (radius 50m, warnRadius ~77m)
    const shipPos = new THREE.Vector3(135, 0, 0);
    // High closing speed towards +X
    const shipVel = new THREE.Vector3(60, 0, 0);

    const warn = physics.checkProximityWarning(shipPos, shipVel);
    expect(warn.isWarning).toBe(true);
    expect(warn.colliderName).toBe('Cathedral Flagship');
    expect(warn.distance).toBe(15);

    // If moving away from the structure, no warning
    const shipVelAway = new THREE.Vector3(-60, 0, 0);
    const warnAway = physics.checkProximityWarning(shipPos, shipVelAway);
    expect(warnAway.isWarning).toBe(false);
  });

  it('integrates cleanly into FlightModel stepSimulation loop', () => {
    const flightModel = new FlightModel();
    flightModel.structurePhysicsSystem.setColliders([stationCollider]);

    flightModel.position.set(50, 0, 500); // 50m from station center (radius 75m) from side
    flightModel.velocity.set(-40, 0, 0);

    const dummyCam = new THREE.PerspectiveCamera();
    flightModel.update(
      {
        axes: { x: 0, y: 0 },
        throttle: 0,
        roll: 0,
      },
      0.05,
      dummyCam
    );

    expect(flightModel.lastStructureCollision.hasCollided).toBe(true);
    expect(flightModel.lastStructureCollision.collidedName).toBe('Central Trading Spire');
    expect(flightModel.position.distanceTo(stationCollider.position)).toBeGreaterThanOrEqual(75.0);
  });
});
