import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { SectorManager } from '../src/game/universe/SectorManager';
import { AutopilotController } from '../src/game/flight/AutopilotController';
import { DeepCruiseController } from '../src/game/flight/DeepCruiseController';
import { FlightStateMachine, FlightPhase } from '../src/game/flight/FlightStateMachine';
import type { StarSystemDescriptor } from '../src/game/systems/PlanetDescriptor';

describe('Navigation Systems & Controllers', () => {
  describe('SectorManager.getSystemsInRadius', () => {
    it('queries star systems in a radius deterministically without meshes', () => {
      const sm = new SectorManager();

      const systemsOrigin = sm.getSystemsInRadius({ x: 0, y: 0, z: 0 }, 2);
      expect(systemsOrigin.length).toBeGreaterThan(0);

      // Verify origin system (0,0,0) is included
      const originSys = systemsOrigin.find(s => s.coord.x === 0 && s.coord.z === 0);
      expect(originSys).toBeDefined();
      expect(originSys?.system.star.name).toBe('Solara Prime');

      // Verify deterministic result across calls
      const systemsRepeat = sm.getSystemsInRadius({ x: 0, y: 0, z: 0 }, 2);
      expect(systemsRepeat.length).toBe(systemsOrigin.length);
      expect(systemsRepeat[0].system.name).toBe(systemsOrigin[0].system.name);
    });

    it('finds systems in distant sectors', () => {
      const sm = new SectorManager();

      const systemsDistant = sm.getSystemsInRadius({ x: 50, y: 0, z: -30 }, 2);
      expect(systemsDistant.length).toBeGreaterThan(0);
      for (const res of systemsDistant) {
        expect(Math.abs(res.coord.x - 50)).toBeLessThanOrEqual(2);
        expect(Math.abs(res.coord.z - (-30))).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('AutopilotController', () => {
    it('initializes inactive and activates toward target position', () => {
      const dummyFlightModel: any = {
        position: new THREE.Vector3(0, 0, 0),
        velocity: new THREE.Vector3(0, 0, 0),
        quaternion: new THREE.Quaternion(),
      };
      const autopilot = new AutopilotController(dummyFlightModel);

      expect(autopilot.isActive).toBe(false);

      autopilot.setTarget({
        type: 'vector',
        heading: new THREE.Vector3(0, 0, -1),
        name: 'Waypoint Alpha',
      });
      autopilot.engage();

      expect(autopilot.isActive).toBe(true);
      expect(autopilot.currentTarget?.type).toBe('vector');
    });

    it('calculates alignment steer and auto-disengages when cancelled', () => {
      const dummyFlightModel: any = {
        position: new THREE.Vector3(0, 0, 0),
        velocity: new THREE.Vector3(0, 0, 0),
        quaternion: new THREE.Quaternion(),
      };
      const autopilot = new AutopilotController(dummyFlightModel);

      autopilot.setTarget({
        type: 'vector',
        heading: new THREE.Vector3(0, 0, -1),
        name: 'Ahead Point',
      });
      autopilot.engage();

      const status = autopilot.update(0.016, dummyFlightModel.position);
      expect(status.isAligned).toBe(true);

      autopilot.disengage();
      expect(autopilot.isActive).toBe(false);
      const disengagedStatus = autopilot.update(0.016, dummyFlightModel.position);
      expect(disengagedStatus.isAligned).toBe(false);
    });
  });

  describe('DeepCruiseController', () => {
    let fsm: FlightStateMachine;
    let deepCruise: DeepCruiseController;
    let targetSys: StarSystemDescriptor;
    let dummyFlightModel: any;
    let dummySpaceScene: any;

    beforeEach(() => {
      fsm = new FlightStateMachine(FlightPhase.SYSTEM_CRUISE);
      dummyFlightModel = {
        position: new THREE.Vector3(0, 0, 0),
        velocity: new THREE.Vector3(0, 0, 0),
        quaternion: new THREE.Quaternion(),
      };
      dummySpaceScene = {
        warpFactor: 0,
        warpHeading: new THREE.Vector3(),
        loadSystem: () => {},
      };
      deepCruise = new DeepCruiseController(fsm, dummyFlightModel, dummySpaceScene);

      targetSys = {
        id: 'sys-3_0_-2',
        seed: 4242,
        name: 'Epsilon Eridani',
        sectorX: 3,
        sectorY: 0,
        sectorZ: -2,
        star: {
          id: 'star-1',
          name: 'Epsilon Eridani',
          spectralClass: 'K',
          radius: 180,
          lightColor: 0xffaa44,
          temperature: 4800,
          coronaColor: 0xffaa44,
        },
        planets: [],
      };
    });

    it('transitions flight phase to STELLAR_CRUISE when engaged', () => {
      expect(fsm.getPhase()).toBe(FlightPhase.SYSTEM_CRUISE);

      const worldPos = {
        sector: { x: 0, y: 0, z: 0 },
        localOffset: new THREE.Vector3(0, 0, 0),
      };

      const engaged = deepCruise.engage(targetSys, worldPos as any);
      expect(engaged).toBe(true);
      expect(fsm.getPhase()).toBe(FlightPhase.STELLAR_CRUISE);
      expect(deepCruise.state.isActive).toBe(true);
      expect(deepCruise.state.targetSystem?.name).toBe('Epsilon Eridani');
    });

    it('updates warp progress and invokes onArrival callback when timer completes', () => {
      let arrived = false;
      deepCruise.setOnArrival(() => {
        arrived = true;
      });

      const worldPos = {
        sector: { x: 0, y: 0, z: 0 },
        localOffset: new THREE.Vector3(0, 0, 0),
      };

      deepCruise.engage(targetSys, worldPos as any);

      // Step forward by 15 seconds (duration is 7-14s)
      deepCruise.update(15.0, worldPos as any);

      expect(arrived).toBe(true);
      expect(deepCruise.state.isActive).toBe(false);
      expect(fsm.getPhase()).toBe(FlightPhase.SYSTEM_CRUISE);
      expect(worldPos.sector.x).toBe(3);
      expect(worldPos.sector.z).toBe(-2);
    });

    it('cancels cruise cleanly and resets phase', () => {
      const worldPos = {
        sector: { x: 0, y: 0, z: 0 },
        localOffset: new THREE.Vector3(0, 0, 0),
      };

      deepCruise.engage(targetSys, worldPos as any);
      expect(deepCruise.state.isActive).toBe(true);

      deepCruise.cancel(worldPos as any);
      expect(deepCruise.state.isActive).toBe(false);
      expect(fsm.getPhase()).toBe(FlightPhase.SYSTEM_CRUISE);
    });
  });
});
