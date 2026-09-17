import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SpaceTrafficDirector } from '../src/game/scenes/SpaceTrafficDirector';
import { SpaceEncounterManager } from '../src/game/scenes/SpaceEncounterManager';

describe('Space Traffic & Cosmic Encounters Suite', () => {
  const sunPos = new THREE.Vector3(1200, 500, -2200);
  const planetPositions = [
    new THREE.Vector3(-1000, -300, -1800),
    new THREE.Vector3(-720, -180, -1550),
  ];

  it('SpaceTrafficDirector spawns diverse vessels with comms hail behaviors and supports floating-origin rebase', () => {
    const traffic = new SpaceTrafficDirector(1337, sunPos, planetPositions);
    expect(traffic.vessels.length).toBeGreaterThanOrEqual(3);

    // Verify vessels have valid geometry and properties
    const vessel = traffic.vessels[0];
    expect(vessel.group.children.length).toBeGreaterThan(0);
    expect(vessel.name.length).toBeGreaterThan(3);
    expect(vessel.commMessage).toContain('[COMMS]');

    // Proximity hail check: far away ship does not hail
    const farShip = new THREE.Vector3(9999, 9999, 9999);
    const msgFar = traffic.update(0.1, farShip);
    expect(msgFar).toBeNull();

    // Proximity hail check: close ship triggers comms message
    const closeShip = vessel.position.clone().add(new THREE.Vector3(10, 0, 10));
    const msgClose = traffic.update(0.1, closeShip);
    expect(msgClose).toContain(vessel.name);

    // Floating-origin rebase test
    const offset = new THREE.Vector3(500, -200, 300);
    const origPos = vessel.position.clone();
    traffic.onRebase(offset);
    expect(vessel.position.x).toBeCloseTo(origPos.x + offset.x);
    expect(vessel.position.y).toBeCloseTo(origPos.y + offset.y);
    expect(vessel.position.z).toBeCloseTo(origPos.z + offset.z);
  });

  it('SpaceEncounterManager spawns scannable asteroid clusters, derelict probes, and gravitic anomalies', () => {
    const encounters = new SpaceEncounterManager(1337, sunPos, planetPositions);
    expect(encounters.encounters.length).toBeGreaterThanOrEqual(3);

    const types = encounters.encounters.map(e => e.type);
    expect(types).toContain('asteroid_cluster');
    expect(types).toContain('derelict_probe');
    expect(types).toContain('gravitic_anomaly');

    const enc = encounters.encounters[0];
    expect(enc.group.children.length).toBeGreaterThan(0);
    expect(enc.rewardCredits).toBeGreaterThan(0);
    expect(enc.logSnippet.length).toBeGreaterThan(10);

    // Nearby encounter detection
    const nearby = encounters.getNearbyEncounter(enc.position, 50);
    expect(nearby?.id).toBe(enc.id);

    // Floating-origin rebase test
    const offset = new THREE.Vector3(200, 100, -300);
    const origPos = enc.position.clone();
    encounters.onRebase(offset);
    expect(enc.position.x).toBeCloseTo(origPos.x + offset.x);
  });
});
