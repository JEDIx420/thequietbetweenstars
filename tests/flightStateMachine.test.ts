import { describe, it, expect } from 'vitest';
import { FlightStateMachine, FlightPhase } from '../src/game/flight/FlightStateMachine';
import { ApproachController } from '../src/game/flight/ApproachController';
import * as THREE from 'three';
import type { PlanetDescriptor } from '../src/game/systems/PlanetDescriptor';
import { PlanetEnvironmentGenerator } from '../src/game/planets/PlanetEnvironmentProfile';

describe('FlightStateMachine & ApproachController', () => {
  it('allows valid sequential flight transitions', () => {
    const sm = new FlightStateMachine(FlightPhase.SYSTEM_CRUISE);

    expect(sm.canTransition(FlightPhase.PLANET_APPROACH)).toBe(true);
    sm.transitionTo(FlightPhase.PLANET_APPROACH);

    expect(sm.canTransition(FlightPhase.ORBIT)).toBe(true);
    sm.transitionTo(FlightPhase.ORBIT);

    expect(sm.canTransition(FlightPhase.ENTRY)).toBe(true);
    sm.transitionTo(FlightPhase.ENTRY);

    expect(sm.canTransition(FlightPhase.SURFACE_FLIGHT)).toBe(true);
    sm.transitionTo(FlightPhase.SURFACE_FLIGHT);

    expect(sm.canTransition(FlightPhase.ASCENT)).toBe(true);
    sm.transitionTo(FlightPhase.ASCENT);

    expect(sm.canTransition(FlightPhase.ORBIT)).toBe(true);
    sm.transitionTo(FlightPhase.ORBIT);

    expect(sm.canTransition(FlightPhase.SYSTEM_CRUISE)).toBe(true);
    sm.transitionTo(FlightPhase.SYSTEM_CRUISE);
  });

  it('rejects invalid transitions like jumping directly from cruise to surface flight', () => {
    const sm = new FlightStateMachine(FlightPhase.SYSTEM_CRUISE);
    expect(sm.canTransition(FlightPhase.SURFACE_FLIGHT)).toBe(false);
  });

  it('detects planet approach and triggers inspection eligibility', () => {
    const controller = new ApproachController();
    const profile = PlanetEnvironmentGenerator.generateProfile(1234, 'G', 'temperate-terrestrial');
    const planet: PlanetDescriptor = {
      id: 'p-test',
      seed: 1234,
      name: 'Test Planet',
      type: 'temperate-terrestrial',
      radius: 160,
      gravity: 9.8,
      hasAtmosphere: true,
      atmosphereDensity: 1.0,
      temperatureKelvin: 288,
      surfacePressureAtm: 1.0,
      oceanCoverage: 0.6,
      cloudCoverage: 0.4,
      biosignature: 'complex-ecosystem',
      hasRings: false,
      moonsCount: 0,
      palette: { primary: '#111', secondary: '#222', atmosphereGlow: '#333', cloudColor: '#fff' },
      shortDescription: 'Test',
      isLandable: true,
      profile,
    };

    const planetPos = new THREE.Vector3(0, 0, 0);

    // Far away: outside approach range (160 + 900 = 1060)
    const farShip = new THREE.Vector3(2000, 0, 0);
    const resFar = controller.update(farShip, [{ descriptor: planet, position: planetPos }]);
    expect(resFar).toBeNull();

    // In approach envelope: (160 + 450 = 610)
    const midShip = new THREE.Vector3(800, 0, 0);
    const resMid = controller.update(midShip, [{ descriptor: planet, position: planetPos }]);
    expect(resMid).not.toBeNull();
    expect(resMid!.canInspect).toBe(false);

    // In orbital inspection distance: dist <= 610
    const nearShip = new THREE.Vector3(500, 0, 0);
    const resNear = controller.update(nearShip, [{ descriptor: planet, position: planetPos }]);
    expect(resNear).not.toBeNull();
    expect(resNear!.canInspect).toBe(true);
  });
});
