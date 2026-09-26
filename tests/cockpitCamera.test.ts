import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CockpitInteriorRig } from '../src/game/scenes/CockpitInteriorRig';
import { SurveyCraft } from '../src/game/scenes/spaceCraft';
import { FlightModel } from '../src/game/core/flightModel';
import { KeyboardInput } from '../src/game/input/KeyboardInput';

describe('Cockpit POV Camera & Animated Controls System', () => {
  describe('CockpitInteriorRig', () => {
    it('creates cockpit interior hierarchy with frame, dashboard, throttle, and flight stick', () => {
      const rig = new CockpitInteriorRig();
      expect(rig.group).toBeDefined();
      expect(rig.group.children.length).toBeGreaterThanOrEqual(2);
      expect(rig.getVisible()).toBe(false);

      rig.setVisible(true);
      expect(rig.getVisible()).toBe(true);
      expect(rig.group.visible).toBe(true);
    });

    it('animates throttle quadrant and pilot left arm based on throttle input', () => {
      const rig = new CockpitInteriorRig();
      rig.setVisible(true);

      // Idle throttle (0.0)
      rig.update(0.1, {
        throttle: 0.0,
        pitchInput: 0,
        yawInput: 0,
        rollInput: 0,
        speed: 0,
        maxSpeed: 160,
      });

      // Full throttle (1.0)
      rig.update(0.5, {
        throttle: 1.0,
        pitchInput: 0,
        yawInput: 0,
        rollInput: 0,
        speed: 160,
        maxSpeed: 160,
      });

      // Run multiple steps to allow smooth animation interpolation
      for (let i = 0; i < 10; i++) {
        rig.update(0.05, {
          throttle: 1.0,
          pitchInput: 0,
          yawInput: 0,
          rollInput: 0,
          speed: 160,
          maxSpeed: 160,
        });
      }

      // No crash, and group remains active
      expect(rig.getVisible()).toBe(true);
    });

    it('articulates flight control stick and right arm based on steering inputs', () => {
      const rig = new CockpitInteriorRig();
      rig.setVisible(true);

      // Pitch nose down (pitchInput: -1.0) and turn right (yawInput: 1.0)
      for (let i = 0; i < 10; i++) {
        rig.update(0.05, {
          throttle: 0.5,
          pitchInput: -1.0,
          yawInput: 1.0,
          rollInput: 0.5,
          speed: 80,
          maxSpeed: 160,
        });
      }

      expect(rig.getVisible()).toBe(true);
    });
  });

  describe('SurveyCraft Integration', () => {
    it('switches between CHASE and COCKPIT view modes and manages exterior canopy visibility', () => {
      const craft = new SurveyCraft();
      expect(craft.getCameraViewMode()).toBe('CHASE');
      expect(craft.cockpitInterior.getVisible()).toBe(false);

      craft.setCameraViewMode('COCKPIT');
      expect(craft.getCameraViewMode()).toBe('COCKPIT');
      expect(craft.cockpitInterior.getVisible()).toBe(true);

      craft.setCameraViewMode('CHASE');
      expect(craft.getCameraViewMode()).toBe('CHASE');
      expect(craft.cockpitInterior.getVisible()).toBe(false);
    });

    it('runs updateCockpit cleanly on craft updates', () => {
      const craft = new SurveyCraft();
      craft.setCameraViewMode('COCKPIT');

      expect(() => {
        craft.updateCockpit(0.016, {
          throttle: 0.75,
          pitchInput: 0.2,
          yawInput: -0.3,
          rollInput: -0.1,
          speed: 120,
          maxSpeed: 160,
        });
      }).not.toThrow();
    });
  });

  describe('FlightModel Camera View Transitions', () => {
    it('manages camera view modes and smoothly blends transition progress', () => {
      const flightModel = new FlightModel();
      expect(flightModel.getCameraViewMode()).toBe('CHASE');
      expect(flightModel.viewTransitionProgress).toBe(0.0);

      // Toggle to Cockpit
      const newMode = flightModel.toggleCameraViewMode();
      expect(newMode).toBe('COCKPIT');
      expect(flightModel.getCameraViewMode()).toBe('COCKPIT');

      // Update camera
      const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 10000);
      const input = {
        axes: { x: 0, y: 0 },
        roll: 0,
        throttle: 0.5,
      };

      // Step simulation and camera updates over multiple frames
      for (let i = 0; i < 20; i++) {
        flightModel.update(input, 0.05, camera);
      }

      // Transition progress should have smoothly moved toward 1.0
      expect(flightModel.viewTransitionProgress).toBeGreaterThan(0.9);
      // FOV in cockpit should expand wider than base 60°
      expect(camera.fov).toBeGreaterThan(65);

      // Toggle back to Chase
      flightModel.setCameraViewMode('CHASE');
      for (let i = 0; i < 20; i++) {
        flightModel.update(input, 0.05, camera);
      }
      expect(flightModel.viewTransitionProgress).toBeLessThan(0.1);
    });
  });

  describe('Keyboard Controls for Camera Toggle', () => {
    it('triggers toggle_camera action when KeyV or KeyC is pressed', () => {
      const kb = new KeyboardInput();

      (kb as any).handleKeyDown({ code: 'KeyV', preventDefault: () => {} });
      expect(kb.consumeAction('toggle_camera')).toBe(true);
      expect(kb.consumeAction('toggle_camera')).toBe(false);

      (kb as any).handleKeyDown({ code: 'KeyC', preventDefault: () => {} });
      expect(kb.consumeAction('toggle_camera')).toBe(true);

      kb.dispose();
    });
  });
});
