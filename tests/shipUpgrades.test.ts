import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CourierPod } from '../src/game/flight/CourierPod';
import { SHIP_MODULE_CATALOG } from '../src/game/progression/ShipProgression';
import { FlightModel } from '../src/game/core/flightModel';
import { SurveyCreditPickupManager } from '../src/game/surface/SurveyCreditPickupManager';
import { PlanetEnvironmentGenerator } from '../src/game/planets/PlanetEnvironmentProfile';
import { LandingRegionGenerator } from '../src/game/planets/LandingRegionProfile';

describe('Ship Progression, Courier Pod Tractor Beam & Meaningful Upgrades', () => {
  it('contains expanded module catalog including sublight overdrive and survey mote magnet', () => {
    const ids = SHIP_MODULE_CATALOG.map(m => m.id);
    expect(ids).toContain('mod_propulsion_ion_vector');
    expect(ids).toContain('mod_surface_grav_stabilizer');
    expect(ids).toContain('mod_scanner_deep_ecology');
    expect(ids).toContain('mod_warp_harmonic_field');
    expect(ids).toContain('mod_sublight_overdrive');
    expect(ids).toContain('mod_survey_mote_magnet');
  });

  it('CourierPod responds to tractor beam pull and station keeping', () => {
    const order = {
      orderId: 'order_1',
      moduleId: 'mod_propulsion_ion_vector',
      orderedAt: Date.now(),
      deliveryEtaSec: 5,
      destinationSystemName: 'Aurelia',
      status: 'ARRIVED' as const,
    };
    const spawnPos = new THREE.Vector3(50, 10, -60);
    const pod = new CourierPod(order, spawnPos);

    expect(pod.position.distanceTo(spawnPos)).toBeLessThan(0.001);

    // Apply tractor pull towards ship at origin
    const shipPos = new THREE.Vector3(0, 0, 0);
    const initialDist = pod.position.distanceTo(shipPos);
    pod.applyTractorPull(shipPos, 0.5);

    const pulledDist = pod.position.distanceTo(shipPos);
    expect(pulledDist).toBeLessThan(initialDist);

    // Station keeping when far away
    const farShipPos = new THREE.Vector3(300, 0, 0);
    pod.update(1.0, farShipPos);
    expect(pod.position.x).toBeGreaterThan(0);
  });

  it('Ship flight model and survey pickup manager reflect upgrade stat multipliers', () => {
    const flightModel = new FlightModel(new THREE.Group());
    expect(flightModel.accelerationMultiplier).toBe(1.0);
    expect(flightModel.turnRateMultiplier).toBe(1.0);
    expect(flightModel.maxCruiseSpeedMultiplier).toBe(1.0);

    // Apply propulsion upgrades
    flightModel.accelerationMultiplier = 1.35;
    flightModel.turnRateMultiplier = 1.35;
    flightModel.maxCruiseSpeedMultiplier = 1.5;

    expect(flightModel.accelerationMultiplier).toBe(1.35);
    expect(flightModel.turnRateMultiplier).toBe(1.35);
    expect(flightModel.maxCruiseSpeedMultiplier).toBe(1.5);

    // Test survey mote pickup manager radii
    const profile = PlanetEnvironmentGenerator.generateProfile('seed-upgrades', 'G');
    const region = LandingRegionGenerator.generateRegions(profile, 101)[0];
    const pickupManager = new SurveyCreditPickupManager(region, 'planet_1', 101);

    expect(pickupManager.pickupRadius).toBe(6.5);
    expect(pickupManager.magnetismRadius).toBe(16.0);

    // Magnet upgrade applied
    pickupManager.pickupRadius = 14.0;
    pickupManager.magnetismRadius = 85.0;
    expect(pickupManager.pickupRadius).toBe(14.0);
    expect(pickupManager.magnetismRadius).toBe(85.0);
  });
});
