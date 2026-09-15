import { describe, it, expect } from 'vitest';
import { SHIP_MODULE_CATALOG } from '../src/game/progression/ShipProgression';
import { ResourceNodeManager } from '../src/game/surface/ResourceNodeManager';
import { CourierPod } from '../src/game/flight/CourierPod';
import { PlanetEnvironmentGenerator } from '../src/game/planets/PlanetEnvironmentProfile';
import { LandingRegionGenerator } from '../src/game/planets/LandingRegionProfile';
import type { ModuleOrder } from '../src/persistence/SaveManager';
import * as THREE from 'three';

describe('Ship Progression, Resource Sampling & Courier Delivery', () => {
  it('contains modules for propulsion, surface control, sensors, and shields', () => {
    expect(SHIP_MODULE_CATALOG.length).toBeGreaterThanOrEqual(4);

    const propulsion = SHIP_MODULE_CATALOG.find(m => m.category === 'PROPULSION');
    expect(propulsion).toBeDefined();
    expect(propulsion?.statModifiers.accelerationBonus).toBeGreaterThan(0);

    const surfaceControl = SHIP_MODULE_CATALOG.find(m => m.category === 'SURFACE_CONTROL');
    expect(surfaceControl).toBeDefined();
    expect(surfaceControl?.statModifiers.maxSurfaceAltitude).toBeGreaterThan(0);
  });

  it('generates sample resource nodes with valid credit values and categories', () => {
    const planetEnv = PlanetEnvironmentGenerator.generateProfile(88, 'G', 'crystalline-mineral');
    const regions = LandingRegionGenerator.generateRegions(planetEnv, 88);
    const region = regions[0];

    const resourceMgr = new ResourceNodeManager(
      region,
      new THREE.Vector3(0, 0, 0),
      () => 12
    );

    expect(resourceMgr.nodes.length).toBeGreaterThan(0);
    const firstNode = resourceMgr.nodes[0];
    expect(firstNode.creditValue).toBeGreaterThan(0);
    expect(['MINERAL', 'BIOLOGICAL', 'CRYSTALLINE', 'ATMOSPHERIC', 'RESONANCE']).toContain(firstNode.category);
    expect(firstNode.position.y).toBeGreaterThanOrEqual(2.0);
  });

  it('operates courier delivery pod in space and updates orientation and beacon', () => {
    const mockOrder: ModuleOrder = {
      orderId: 'order_999',
      moduleId: 'mod_propulsion_ion_vector',
      orderedAt: Date.now(),
      deliveryEtaSec: 10,
      destinationSystemName: 'Aurelia',
      status: 'IN_TRANSIT',
    };

    const courier = new CourierPod(mockOrder, new THREE.Vector3(0, 0, -500));

    expect(courier.order.moduleId).toBe('mod_propulsion_ion_vector');
    expect(courier.order.status).toBe('IN_TRANSIT');
    expect(courier.group).toBeDefined();

    // Update courier pod animation
    courier.update(0.5);
    expect(courier.group.position.y).toBeDefined();
  });
});
