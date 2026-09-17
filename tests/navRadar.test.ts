import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { NavRadar } from '../src/game/ui/NavRadar';
import { AutopilotController } from '../src/game/flight/AutopilotController';
import { FlightModel } from '../src/game/core/flightModel';
import type { PlanetDescriptor } from '../src/game/systems/PlanetDescriptor';

// Headless mock DOM for testing in Node.js
class MockDOMElement {
  public id = '';
  public innerHTML = '';
  public textContent = '';
  public style: Record<string, any> = {};
  public children: any[] = [];
  public width = 140;
  public height = 140;

  appendChild(el: any) {
    this.children.push(el);
    return el;
  }
  remove() {}
  addEventListener() {}
  removeEventListener() {}
  getContext() {
    return {
      clearRect: () => {},
      beginPath: () => {},
      arc: () => {},
      stroke: () => {},
      strokeRect: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      fill: () => {},
      createRadialGradient: () => ({
        addColorStop: () => {},
      }),
      fillText: () => {},
      drawImage: () => {},
      setLineDash: () => {},
      save: () => {},
      restore: () => {},
    };
  }
}

// Attach mock document to global
if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    createElement: () => new MockDOMElement(),
  };
}

describe('NavRadar: Yaw-Stabilized Radar & Target Navigation', () => {
  let container: any;
  let autopilot: AutopilotController;
  let flightModel: FlightModel;
  let radar: NavRadar;

  const mockPlanetAhead: PlanetDescriptor = {
    id: 'p-ahead',
    seed: 101,
    name: 'Ahead Planet',
    type: 'temperate-terrestrial',
    radius: 120,
    gravity: 9.8,
    hasAtmosphere: true,
    atmosphereDensity: 1.0,
    temperatureKelvin: 288,
    surfacePressureAtm: 1.0,
    oceanCoverage: 0.5,
    cloudCoverage: 0.3,
    biosignature: 'complex-ecosystem',
    hasRings: false,
    moonsCount: 0,
    palette: { primary: '#22c55e', secondary: '#15803d', atmosphereGlow: '#86efac', cloudColor: '#ffffff' },
    shortDescription: 'Ahead Planet',
    isLandable: true,
    profile: {} as any,
  };

  const mockPlanetStarboard: PlanetDescriptor = {
    id: 'p-starboard',
    seed: 202,
    name: 'Starboard World',
    type: 'gas-giant',
    radius: 200,
    gravity: 24.0,
    hasAtmosphere: true,
    atmosphereDensity: 2.5,
    temperatureKelvin: 160,
    surfacePressureAtm: 10.0,
    oceanCoverage: 0,
    cloudCoverage: 1.0,
    biosignature: 'none',
    hasRings: true,
    moonsCount: 3,
    palette: { primary: '#eab308', secondary: '#ca8a04', atmosphereGlow: '#fef08a', cloudColor: '#ffffff' },
    shortDescription: 'Starboard World',
    isLandable: true,
    profile: {} as any,
  };

  beforeEach(() => {
    container = new MockDOMElement();
    const shipGroup = new THREE.Group();
    flightModel = new FlightModel(shipGroup);
    autopilot = new AutopilotController(flightModel);
    radar = new NavRadar(container, autopilot);
  });

  it('stabilizes target relative angle invariant to ship pitch and roll', () => {
    const shipPos = new THREE.Vector3(0, 0, 0);
    const planetPos = new THREE.Vector3(0, 0, -3000); // Dead ahead in standard space (-Z)

    radar.setPlanets([{ descriptor: mockPlanetAhead, position: planetPos }]);

    // 1. Level ship flight facing forward (-Z)
    const levelQuat = new THREE.Quaternion(); // Identity (forward = (0, 0, -1))
    radar.update(shipPos, levelQuat, new THREE.Vector3(0, 0, 5000));
    expect(radar.getSelectedTarget()?.name).toBe('Ahead Planet');

    // 2. Pitch up by 45 degrees
    const pitchedQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 4);
    // When pitched up, target remains directly ahead along horizontal heading
    radar.update(shipPos, pitchedQuat, new THREE.Vector3(0, 0, 5000));
    expect(radar.getSelectedTarget()?.name).toBe('Ahead Planet');

    // 3. Roll by 90 degrees
    const rolledQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, -1), Math.PI / 2);
    radar.update(shipPos, rolledQuat, new THREE.Vector3(0, 0, 5000));
    expect(radar.getSelectedTarget()?.name).toBe('Ahead Planet');
  });

  it('selects target in forward vision cone via selectTargetInForwardView', () => {
    const shipPos = new THREE.Vector3(0, 0, 0);
    const posAhead = new THREE.Vector3(0, 0, -2500); // Dead ahead (-Z)
    const posRight = new THREE.Vector3(4000, 0, 0); // Starboard (+X)

    radar.setPlanets([
      { descriptor: mockPlanetStarboard, position: posRight },
      { descriptor: mockPlanetAhead, position: posAhead },
    ]);

    // Initial selected index is 0 (Starboard)
    expect(radar.getSelectedTarget()?.name).toBe('Starboard World');

    // Lock forward target with ship facing -Z
    const shipQuat = new THREE.Quaternion(); // facing -Z
    const locked = radar.selectTargetInForwardView(shipPos, shipQuat);

    expect(locked).toBe(true);
    expect(radar.getSelectedTarget()?.name).toBe('Ahead Planet');
  });

  it('shifts anomaly positions when onRebase is triggered', () => {
    const anomaly = {
      id: 'anom-test',
      name: 'Resonance Monolith',
      type: 'resonance_monolith' as const,
      distanceFromStar: 1000,
      angle: 0,
      description: 'Test anomaly',
      scanned: false,
      hasResonance: false,
    };

    radar.setPlanets([], [anomaly]);
    const targetBefore = radar.getSelectedTarget();
    expect(targetBefore?.name).toBe('Resonance Monolith');
    const initialPos = targetBefore!.position.clone();

    // Perform floating origin rebase by offset (-2500, 0, 0)
    radar.onRebase(new THREE.Vector3(-2500, 0, 0));

    expect(targetBefore!.position.x).toBeCloseTo(initialPos.x - 2500);
  });
});
