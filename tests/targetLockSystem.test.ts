import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TargetLockSystem, LockableTarget } from '../src/game/targeting/TargetLockSystem';

describe('TargetLockSystem', () => {
  it('filters and locks onto targets within forward cone', () => {
    const system = new TargetLockSystem();
    const shipPos = new THREE.Vector3(0, 0, 0);
    // Facing negative Z (default Three.js forward)
    const shipQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0);

    const candidates: LockableTarget[] = [
      {
        id: 'target-behind',
        name: 'Behind Ship',
        type: 'encounter',
        position: new THREE.Vector3(0, 0, 500), // Behind
        radius: 20,
      },
      {
        id: 'target-ahead',
        name: 'Ahead Ship',
        type: 'encounter',
        position: new THREE.Vector3(0, 0, -400), // Directly ahead
        radius: 25,
      },
      {
        id: 'target-side',
        name: 'Side Ship',
        type: 'planet',
        position: new THREE.Vector3(800, 0, 0), // Directly to side (90 deg)
        radius: 100,
      },
    ];

    const locked = system.lockTargetInForwardCone(shipPos, shipQuat, candidates);
    expect(locked).not.toBeNull();
    expect(locked?.id).toBe('target-ahead');
    expect(locked?.distance).toBe(400);
  });

  it('cycles through multiple targets in forward vision cone on successive calls', () => {
    const system = new TargetLockSystem();
    const shipPos = new THREE.Vector3(0, 0, 0);
    const shipQuat = new THREE.Quaternion();

    const candidates: LockableTarget[] = [
      {
        id: 'probe-1',
        name: 'Derelict Probe 1',
        type: 'encounter',
        position: new THREE.Vector3(-10, 0, -300),
        radius: 20,
      },
      {
        id: 'probe-2',
        name: 'Derelict Probe 2',
        type: 'encounter',
        position: new THREE.Vector3(15, 0, -450),
        radius: 20,
      },
    ];

    // First lock
    const locked1 = system.lockTargetInForwardCone(shipPos, shipQuat, candidates);
    expect(locked1?.id).toBe('probe-1');

    // Second lock: should cycle to second target
    const locked2 = system.lockTargetInForwardCone(shipPos, shipQuat, candidates);
    expect(locked2?.id).toBe('probe-2');

    // Third lock: should wrap back to first target
    const locked3 = system.lockTargetInForwardCone(shipPos, shipQuat, candidates);
    expect(locked3?.id).toBe('probe-1');
  });

  it('selects targets accurately via 3D ray for touch devices', () => {
    const system = new TargetLockSystem();
    const candidates: LockableTarget[] = [
      {
        id: 'creature-1',
        name: 'Colossus',
        type: 'titan',
        position: new THREE.Vector3(0, 5, -50),
        radius: 15,
        isSentient: true,
      },
      {
        id: 'creature-2',
        name: 'Distant Strider',
        type: 'creature',
        position: new THREE.Vector3(200, 0, -50),
        radius: 10,
      },
    ];

    // Ray shooting from camera (0, 5, 0) straight towards negative Z
    const ray = new THREE.Ray(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, 0, -1));

    const hit = system.findTargetFromRay(ray, candidates, 20);
    expect(hit).not.toBeNull();
    expect(hit?.id).toBe('creature-1');
    expect(hit?.isSentient).toBe(true);

    // Ray pointing away from all targets
    const missRay = new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
    const missHit = system.findTargetFromRay(missRay, candidates, 20);
    expect(missHit).toBeNull();
  });

  it('provides correct contextual action verbs for each entity type', () => {
    expect(TargetLockSystem.getActionVerb({ id: '1', name: 'Titan', type: 'titan', position: new THREE.Vector3(), radius: 10 }).verb)
      .toBe('COMMUNICATE');

    expect(TargetLockSystem.getActionVerb({ id: '2', name: 'Creature', type: 'creature', position: new THREE.Vector3(), radius: 5 }).verb)
      .toBe('SCAN SPECIMEN');

    expect(TargetLockSystem.getActionVerb({ id: '3', name: 'Probe', type: 'encounter', position: new THREE.Vector3(), radius: 10, isScanned: false }).verb)
      .toBe('SCAN & HARVEST');

    expect(TargetLockSystem.getActionVerb({ id: '4', name: 'Courier', type: 'courier', position: new THREE.Vector3(), radius: 10 }).verb)
      .toBe('DOCK & RETRIEVE');

    expect(TargetLockSystem.getActionVerb({ id: '5', name: 'Resource', type: 'resource', position: new THREE.Vector3(), radius: 5 }).verb)
      .toBe('EXTRACT SAMPLE');
  });
});
