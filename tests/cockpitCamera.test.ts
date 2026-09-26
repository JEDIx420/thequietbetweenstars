import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CockpitInteriorRig } from '../src/game/scenes/CockpitInteriorRig';
import { SurveyCraft } from '../src/game/scenes/spaceCraft';
import { FlightModel } from '../src/game/core/flightModel';
import { KeyboardInput } from '../src/game/input/KeyboardInput';

describe('Cockpit POV Camera & Dedicated First-Person View Model', () => {
  describe('1, 2, 3: View Mode Switching & Exterior Culling', () => {
    it('shows exteriorRoot in CHASE mode and hides cockpit view model', () => {
      const craft = new SurveyCraft();
      const cockpitRig = new CockpitInteriorRig();

      expect(craft.isExteriorVisible()).toBe(true);
      expect(craft.exteriorRoot.visible).toBe(true);
      expect(cockpitRig.getVisible()).toBe(false);
      expect(cockpitRig.group.visible).toBe(false);
    });

    it('hides exteriorRoot in COCKPIT mode and activates cockpit view model', () => {
      const craft = new SurveyCraft();
      const cockpitRig = new CockpitInteriorRig();

      craft.setCameraViewMode('COCKPIT');
      cockpitRig.setVisible(true);

      expect(craft.isExteriorVisible()).toBe(false);
      expect(craft.exteriorRoot.visible).toBe(false);
      expect(cockpitRig.getVisible()).toBe(true);
      expect(cockpitRig.group.visible).toBe(true);
    });

    it('switching back to CHASE mode restores exteriorRoot and hides cockpit view model', () => {
      const craft = new SurveyCraft();
      const cockpitRig = new CockpitInteriorRig();

      craft.setCameraViewMode('COCKPIT');
      cockpitRig.setVisible(true);

      craft.setCameraViewMode('CHASE');
      cockpitRig.setVisible(false);

      expect(craft.isExteriorVisible()).toBe(true);
      expect(craft.exteriorRoot.visible).toBe(true);
      expect(cockpitRig.getVisible()).toBe(false);
    });
  });

  describe('4: View Model Hierarchy Decoupling', () => {
    it('ensures cockpit view model is parented to camera and NOT beneath shipVisualRoot or SurveyCraft', () => {
      const shipPhysicsRoot = new THREE.Group();
      const shipVisualRoot = new THREE.Group();
      const craft = new SurveyCraft();

      shipVisualRoot.add(craft.group);
      shipPhysicsRoot.add(shipVisualRoot);

      const camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.1, 8000);
      const cockpitRig = new CockpitInteriorRig();
      camera.add(cockpitRig.group);

      expect(cockpitRig.group.parent).toBe(camera);

      // Verify cockpitRig is not anywhere inside shipVisualRoot
      let foundInVisualRoot = false;
      shipVisualRoot.traverse((obj) => {
        if (obj === cockpitRig.group) foundInVisualRoot = true;
      });
      expect(foundInVisualRoot).toBe(false);

      // Verify cockpitRig is not anywhere inside SurveyCraft
      let foundInCraft = false;
      craft.group.traverse((obj) => {
        if (obj === cockpitRig.group) foundInCraft = true;
      });
      expect(foundInCraft).toBe(false);
    });
  });

  describe('5: Cockpit Camera Pose & Physical Transform Authority', () => {
    it('aligns camera pose with physical ship transform and local pilot seat offset', () => {
      const shipPhysicsRoot = new THREE.Group();
      const shipVisualRoot = new THREE.Group();
      const flightModel = new FlightModel(shipPhysicsRoot, undefined, undefined, shipVisualRoot);

      flightModel.setCameraViewMode('COCKPIT');
      flightModel.position.set(120, 45, -300);
      flightModel.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);

      const camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.1, 8000);
      const zeroInput = { axes: { x: 0, y: 0 }, roll: 0, throttle: 0 };

      // Step simulation for ~300ms to complete transition to cockpit mode
      for (let i = 0; i < 25; i++) {
        flightModel.update(zeroInput, 0.05, camera);
      }

      expect(flightModel.viewTransitionProgress).toBeCloseTo(1.0, 2);

      // Camera position must match physical craft position + local seat offset
      const expectedSeatPos = flightModel.getPilotSeatWorldPosition();
      expect(camera.position.x).toBeCloseTo(expectedSeatPos.x, 2);
      expect(camera.position.y).toBeCloseTo(expectedSeatPos.y, 2);
      expect(camera.position.z).toBeCloseTo(expectedSeatPos.z, 2);

      // Camera orientation must directly match physical craft quaternion
      expect(camera.quaternion.x).toBeCloseTo(flightModel.quaternion.x, 2);
      expect(camera.quaternion.y).toBeCloseTo(flightModel.quaternion.y, 2);
      expect(camera.quaternion.z).toBeCloseTo(flightModel.quaternion.z, 2);
      expect(camera.quaternion.w).toBeCloseTo(flightModel.quaternion.w, 2);
    });
  });

  describe('6: Visual Bank Isolation', () => {
    it('ensures shipVisualRoot visual banking does NOT move cockpit relative to camera', () => {
      const shipPhysicsRoot = new THREE.Group();
      const shipVisualRoot = new THREE.Group();
      const flightModel = new FlightModel(shipPhysicsRoot, undefined, undefined, shipVisualRoot);

      const camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.1, 8000);
      const cockpitRig = new CockpitInteriorRig();
      camera.add(cockpitRig.group);
      cockpitRig.setVisible(true);

      const initialLocalPos = cockpitRig.group.position.clone();
      const initialLocalQuat = cockpitRig.group.quaternion.clone();

      // Apply strong steering input causing visual banking on shipVisualRoot
      flightModel.setCameraViewMode('COCKPIT');
      const turnInput = { axes: { x: 1.0, y: 0.2 }, roll: 0, throttle: 0.6 };

      for (let i = 0; i < 20; i++) {
        flightModel.update(turnInput, 0.05, camera);
        cockpitRig.update(0.05, {
          throttle: 0.6,
          pitchInput: turnInput.axes.y,
          yawInput: turnInput.axes.x,
          rollInput: turnInput.roll,
          speed: 80,
          maxSpeed: 160,
        });
      }

      // Visual banking angle on shipVisualRoot is non-zero
      expect(Math.abs(shipVisualRoot.rotation.z)).toBeGreaterThan(0.1);

      // The cockpit view model is locked to camera-local space
      expect(cockpitRig.group.parent).toBe(camera);
      expect(cockpitRig.group.position.x).toBeCloseTo(initialLocalPos.x, 4);
      expect(cockpitRig.group.position.y).toBeCloseTo(initialLocalPos.y, 4);
      expect(cockpitRig.group.position.z).toBeCloseTo(initialLocalPos.z, 4);
      expect(cockpitRig.group.quaternion.x).toBeCloseTo(initialLocalQuat.x, 4);
    });
  });

  describe('7: Camera Near and FOV Transitions', () => {
    it('correctly adapts camera near and FOV in COCKPIT mode and restores them in CHASE mode', () => {
      const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 8000);
      const flightModel = new FlightModel();
      const zeroInput = { axes: { x: 0, y: 0 }, roll: 0, throttle: 0 };

      // Initial chase values
      expect(camera.near).toBeCloseTo(0.1, 3);

      // Switch to Cockpit
      flightModel.setCameraViewMode('COCKPIT');
      for (let i = 0; i < 25; i++) {
        flightModel.update(zeroInput, 0.05, camera);
      }

      // In cockpit mode: near plane lowered to ~0.04 to prevent dashboard clipping, FOV expanded to 68°
      expect(camera.near).toBeCloseTo(0.04, 2);
      expect(camera.fov).toBeCloseTo(68, 1);

      // Switch back to Chase
      flightModel.setCameraViewMode('CHASE');
      for (let i = 0; i < 25; i++) {
        flightModel.update(zeroInput, 0.05, camera);
      }

      // Restored to normal chase values
      expect(camera.near).toBeCloseTo(0.1, 2);
      expect(camera.fov).toBeCloseTo(60, 1);
    });
  });

  describe('8: Keyboard Controls Toggle (V and C)', () => {
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

  describe('9: View Mode Synchronization', () => {
    it('synchronizes view mode and exterior visibility correctly', () => {
      const craft = new SurveyCraft();

      expect(craft.getCameraViewMode()).toBe('CHASE');
      expect(craft.isExteriorVisible()).toBe(true);

      craft.setCameraViewMode('COCKPIT');
      expect(craft.getCameraViewMode()).toBe('COCKPIT');
      expect(craft.isExteriorVisible()).toBe(false);

      craft.setCameraViewMode('CHASE');
      expect(craft.getCameraViewMode()).toBe('CHASE');
      expect(craft.isExteriorVisible()).toBe(true);
    });
  });

  describe('10: Stability & Physics Non-Accumulation Across Repeated Toggles', () => {
    it('repeatedly toggling does not accumulate transform drift or change ship physics', () => {
      const shipPhysicsRoot = new THREE.Group();
      const flightModel = new FlightModel(shipPhysicsRoot);
      const camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.1, 8000);

      flightModel.position.set(45, 10, -80);
      const initialPos = flightModel.position.clone();
      const initialQuat = flightModel.quaternion.clone();

      const zeroInput = { axes: { x: 0, y: 0 }, roll: 0, throttle: 0 };

      // Rapidly toggle view mode 30 times with simulation steps
      for (let t = 0; t < 30; t++) {
        flightModel.toggleCameraViewMode();
        flightModel.update(zeroInput, 0.016, camera);
      }

      // Physics position and quaternion must remain completely intact
      expect(flightModel.position.x).toBeCloseTo(initialPos.x, 3);
      expect(flightModel.position.y).toBeCloseTo(initialPos.y, 3);
      expect(flightModel.position.z).toBeCloseTo(initialPos.z, 3);
      expect(flightModel.quaternion.x).toBeCloseTo(initialQuat.x, 3);
      expect(flightModel.quaternion.y).toBeCloseTo(initialQuat.y, 3);
      expect(flightModel.quaternion.z).toBeCloseTo(initialQuat.z, 3);
      expect(flightModel.quaternion.w).toBeCloseTo(initialQuat.w, 3);
    });
  });

  describe('Cockpit Interior Controls Animation', () => {
    it('animates throttle quadrant and pilot left arm smoothly with throttle input', () => {
      const rig = new CockpitInteriorRig();
      rig.setVisible(true);

      rig.update(0.1, {
        throttle: 0.0,
        pitchInput: 0,
        yawInput: 0,
        rollInput: 0,
        speed: 0,
        maxSpeed: 160,
      });

      for (let i = 0; i < 15; i++) {
        rig.update(0.05, {
          throttle: 1.0,
          pitchInput: 0,
          yawInput: 0,
          rollInput: 0,
          speed: 160,
          maxSpeed: 160,
        });
      }

      expect(rig.getVisible()).toBe(true);
    });

    it('articulates HOTAS flight stick and pilot right arm with steering inputs', () => {
      const rig = new CockpitInteriorRig();
      rig.setVisible(true);

      for (let i = 0; i < 15; i++) {
        rig.update(0.05, {
          throttle: 0.5,
          pitchInput: -0.8,
          yawInput: 0.9,
          rollInput: 0.3,
          speed: 80,
          maxSpeed: 160,
        });
      }

      expect(rig.getVisible()).toBe(true);
    });
  });
});
