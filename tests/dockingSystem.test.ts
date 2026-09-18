import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SpaceStation } from '../src/game/stations/SpaceStationManager';
import { DockingController } from '../src/game/docking/DockingController';

describe('Space Stations & Docking Architecture', () => {
  it('SpaceStation initializes with procedural components and services', () => {
    const station = new SpaceStation({
      id: 'test_station',
      name: 'Research Outpost Epsilon-7',
      faction: 'Frontier Signal Collective',
      position: new THREE.Vector3(1000, 200, -500),
      services: ['concourse', 'signal_lab', 'archive', 'dockyard', 'supply'],
    });

    expect(station.id).toBe('test_station');
    expect(station.captureRadius).toBe(120);
    expect(station.group.children.length).toBeGreaterThanOrEqual(4);
    expect(station.getDockingStatus()).toBe('IDLE');

    // Distance check
    const farShip = new THREE.Vector3(2000, 200, -500);
    expect(station.canDock(farShip).allowed).toBe(false);

    const nearShip = new THREE.Vector3(1000, 200, -425);
    expect(station.canDock(nearShip).allowed).toBe(true);

    station.dispose();
  });

  it('DockingController smoothly sequences from request to docked and undocked', () => {
    const station = new SpaceStation({
      id: 'test_station',
      name: 'Research Outpost Epsilon-7',
      faction: 'Frontier Signal Collective',
      position: new THREE.Vector3(0, 0, 0),
      services: ['concourse'],
    });

    const controller = new DockingController();
    const shipPos = new THREE.Vector3(0, 0, 80);
    const shipQuat = new THREE.Quaternion();

    // Far check failure
    const farPos = new THREE.Vector3(0, 0, 500);
    const failReq = controller.requestDocking(station, farPos);
    expect(failReq.success).toBe(false);

    // Near check success
    const req = controller.requestDocking(station, shipPos);
    expect(req.success).toBe(true);
    expect(controller.getStatus()).toBe('AUTOPILOT_TETHER');

    // Update during tether
    let updateRes = controller.update(1.0, shipPos, shipQuat);
    expect(updateRes.isTransitioning).toBe(true);
    expect(updateRes.isDocked).toBe(false);

    // Finish tether
    updateRes = controller.update(2.0, shipPos, shipQuat);
    expect(updateRes.isDocked).toBe(true);
    expect(controller.getStatus()).toBe('DOCKED');

    // Undock
    const undockStarted = controller.undock();
    expect(undockStarted).toBe(true);
    expect(controller.getStatus()).toBe('UNDOCKING');

    // Finish undocking
    updateRes = controller.update(1.6, shipPos, shipQuat);
    expect(updateRes.isDocked).toBe(false);
    expect(controller.getStatus()).toBe('IDLE');

    station.dispose();
  });

  it('DockingController smoothly aligns orientation and reports accurate progress', () => {
    const station = new SpaceStation({
      id: 'test_station_orient',
      name: 'Research Outpost Epsilon-7',
      faction: 'Frontier Signal Collective',
      position: new THREE.Vector3(0, 0, 0),
      services: ['signal_lab'],
    });

    const controller = new DockingController();
    const shipPos = new THREE.Vector3(0, 0, 80);
    const initialQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
    const shipQuat = initialQuat.clone();

    const req = controller.requestDocking(station, shipPos, shipQuat);
    expect(req.success).toBe(true);
    expect(controller.getProgress()).toBe(0);

    // Step halfway
    controller.update(1.25, shipPos, shipQuat);
    expect(controller.getProgress()).toBeCloseTo(0.5, 1);
    // Quat should have slerped towards alignment
    expect(shipQuat.equals(initialQuat)).toBe(false);

    // Finish docking
    const fin = controller.update(1.5, shipPos, shipQuat);
    expect(fin.isDocked).toBe(true);
    expect(controller.getStatus()).toBe('DOCKED');

    // Initiate undock
    controller.undock();
    expect(controller.getStatus()).toBe('UNDOCKING');
    expect(controller.getProgress()).toBe(0);

    controller.update(0.75, shipPos, shipQuat);
    expect(controller.getProgress()).toBeCloseTo(0.5, 1);

    controller.update(0.8, shipPos, shipQuat);
    expect(controller.getStatus()).toBe('IDLE');

    station.dispose();
  });
});
