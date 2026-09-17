import * as THREE from 'three';
import type { NormalizedInputState } from '../input/InputSource';
import type { CelestialPhysicsSystem, CollisionResult } from './celestialPhysics';
import type { ApproachController } from '../flight/ApproachController';

export interface FlightTelemetryState {
  physicsQuat: THREE.Quaternion;
  visualQuat: THREE.Quaternion;
  angleDeltaDeg: number;
  yawRate: number;
  pitchRate: number;
  rollRate: number;
  simSteps: number;
  dt: number;
  cameraUpDotWorldUp: number;
  hasDiscontinuity: boolean;
}

export class FlightModel {
  // Transform hierarchy:
  // FlightModel owns ONLY shipPhysicsRoot.position and shipPhysicsRoot.quaternion.
  // Visual banking is applied to shipVisualRoot.
  public shipGroup: THREE.Group; // Aliased to shipPhysicsRoot
  public shipPhysicsRoot: THREE.Group;
  public shipVisualRoot: THREE.Group;

  public position: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public velocity: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public quaternion: THREE.Quaternion = new THREE.Quaternion();

  // Explicit angular velocities (rad/sec)
  private yawVelocity = 0;
  private pitchVelocity = 0;
  private rollVelocity = 0;
  private currentThrottle = 0;

  // Visual bank angle on shipVisualRoot
  private visualBankAngle = 0;

  // Arcade flight parameters
  private readonly maxCruiseSpeed = 160;
  public maxCruiseSpeedMultiplier = 1.0;
  private readonly baseAcceleration = 78;
  public accelerationMultiplier = 1.0;
  public turnRateMultiplier = 1.0;
  private readonly linearDamping = 0.988;
  private readonly turnRateMax = 1.85; // rad/s
  private readonly angularDampingFactor = 12.0; // Exponential response rate
  private readonly autoBankFactor = 0.52; // Visual roll into turns
  private readonly horizonAssistStrength = 0.85; // Gentle upright restorative tendency

  // Cinematic Chase Camera Rig
  private cameraTargetPos: THREE.Vector3 = new THREE.Vector3(0, 3.2, 10.5);
  private cameraLookTarget: THREE.Vector3 = new THREE.Vector3(0, 0, -22);
  private currentCameraUp: THREE.Vector3 = new THREE.Vector3(0, 1, 0);
  private currentFov = 64;
  private isCameraInitialized = false;

  // Telemetry & discontinuity tracking
  private prevQuat: THREE.Quaternion = new THREE.Quaternion();
  public telemetry: FlightTelemetryState = {
    physicsQuat: new THREE.Quaternion(),
    visualQuat: new THREE.Quaternion(),
    angleDeltaDeg: 0,
    yawRate: 0,
    pitchRate: 0,
    rollRate: 0,
    simSteps: 0,
    dt: 0,
    cameraUpDotWorldUp: 1,
    hasDiscontinuity: false,
  };

  // Collision & safety systems
  public lastCollision: CollisionResult = { hasCollided: false, penetrationDepth: 0 };
  private physicsSystem: CelestialPhysicsSystem | null = null;
  private approachController: ApproachController | null = null;

  constructor(
    shipGroup: THREE.Group,
    physicsSystem?: CelestialPhysicsSystem,
    approachController?: ApproachController,
    shipVisualRoot?: THREE.Group
  ) {
    this.shipPhysicsRoot = shipGroup;
    this.shipGroup = shipGroup;

    if (shipVisualRoot) {
      this.shipVisualRoot = shipVisualRoot;
    } else {
      // Find or create child visual root
      if (shipGroup.children.length > 0 && (shipGroup.children[0] as THREE.Group).isGroup) {
        this.shipVisualRoot = shipGroup.children[0] as THREE.Group;
      } else {
        this.shipVisualRoot = new THREE.Group();
        this.shipPhysicsRoot.add(this.shipVisualRoot);
      }
    }

    this.physicsSystem = physicsSystem || null;
    this.approachController = approachController || null;
    this.quaternion.identity();
    this.prevQuat.copy(this.quaternion);
  }

  public setPhysicsSystem(physics: CelestialPhysicsSystem): void {
    this.physicsSystem = physics;
  }

  public setApproachController(controller: ApproachController): void {
    this.approachController = controller;
  }

  public onRebase(offset: THREE.Vector3, camera?: THREE.PerspectiveCamera): void {
    this.cameraTargetPos.add(offset);
    this.cameraLookTarget.add(offset);
    if (camera) {
      camera.position.add(offset);
    }
  }

  public update(input: NormalizedInputState, dt: number, camera: THREE.PerspectiveCamera): void {
    const clampedDt = Math.max(0.001, Math.min(dt, 0.05));
    this.stepSimulation(input, clampedDt);

    // Apply strict transform ownership
    // 1. Physics root receives position and orientation quaternion
    this.shipPhysicsRoot.position.copy(this.position);
    this.shipPhysicsRoot.quaternion.copy(this.quaternion);

    // 2. Visual banking tilt is applied strictly to shipVisualRoot
    const targetBank = -input.axes.x * this.autoBankFactor;
    this.visualBankAngle += (targetBank - this.visualBankAngle) * Math.min(1, clampedDt * 8.0);
    this.shipVisualRoot.rotation.set(0, 0, 0);
    this.shipVisualRoot.rotateZ(this.visualBankAngle);

    // 3. Angular discontinuity detection
    const angleDeltaRad = 2 * Math.acos(Math.min(1.0, Math.abs(this.quaternion.dot(this.prevQuat))));
    const angleDeltaDeg = (angleDeltaRad * 180) / Math.PI;
    const hasDiscontinuity = angleDeltaDeg > 45.0;
    this.prevQuat.copy(this.quaternion);

    // 4. Update Cinematic Chase Camera
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
    const speed = this.velocity.length();
    this.updateCinematicCamera(camera, clampedDt, forward, speed);

    // 5. Update Telemetry
    this.telemetry.physicsQuat.copy(this.quaternion);
    this.telemetry.visualQuat.copy(this.shipVisualRoot.quaternion);
    this.telemetry.angleDeltaDeg = angleDeltaDeg;
    this.telemetry.yawRate = this.yawVelocity;
    this.telemetry.pitchRate = this.pitchVelocity;
    this.telemetry.rollRate = this.rollVelocity;
    this.telemetry.simSteps = 1;
    this.telemetry.dt = clampedDt;
    this.telemetry.cameraUpDotWorldUp = camera.up.dot(new THREE.Vector3(0, 1, 0));
    this.telemetry.hasDiscontinuity = hasDiscontinuity;
  }

  private stepSimulation(input: NormalizedInputState, stepDt: number): void {
    // 1. Smooth Throttle Response
    const throttleTarget = THREE.MathUtils.clamp(input.throttle, 0, 1);
    const throttleRampSpeed = throttleTarget > this.currentThrottle ? 3.8 : 2.6;
    this.currentThrottle += (throttleTarget - this.currentThrottle) * Math.min(1, stepDt * throttleRampSpeed);

    // 2. Target Angular Rates from Input
    const effectiveTurnMax = this.turnRateMax * this.turnRateMultiplier;
    const targetPitch = input.axes.y * effectiveTurnMax;
    const targetYaw = -input.axes.x * effectiveTurnMax;
    const targetRoll = (-input.roll) * effectiveTurnMax;

    // Frame-rate independent exponential approach
    const angularBlend = 1 - Math.exp(-this.angularDampingFactor * stepDt);
    this.pitchVelocity += (targetPitch - this.pitchVelocity) * angularBlend;
    this.yawVelocity += (targetYaw - this.yawVelocity) * angularBlend;
    this.rollVelocity += (targetRoll - this.rollVelocity) * angularBlend;

    // 3. Local Axis-Angle Quaternion Integration
    // Derive current local basis vectors from existing quaternion
    const localRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quaternion);
    const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);
    const localForward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);

    // Pitch around local right
    if (Math.abs(this.pitchVelocity) > 0.0001) {
      const qPitch = new THREE.Quaternion().setFromAxisAngle(localRight, this.pitchVelocity * stepDt);
      this.quaternion.premultiply(qPitch);
    }

    // Yaw around local up
    if (Math.abs(this.yawVelocity) > 0.0001) {
      const qYaw = new THREE.Quaternion().setFromAxisAngle(localUp, this.yawVelocity * stepDt);
      this.quaternion.premultiply(qYaw);
    }

    // Roll around local forward
    if (Math.abs(this.rollVelocity) > 0.0001) {
      const qRoll = new THREE.Quaternion().setFromAxisAngle(localForward, this.rollVelocity * stepDt);
      this.quaternion.premultiply(qRoll);
    }

    // 4. Soft Horizon Restorative Tendency
    // If player is not actively commanding roll, gently nudge craft upright relative to reference up
    if (Math.abs(input.roll) < 0.05) {
      const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);
      const worldUp = new THREE.Vector3(0, 1, 0);

      // Determine tilt along roll axis
      const projectedUp = currentUp.clone().projectOnPlane(localForward).normalize();
      const dotUp = projectedUp.dot(worldUp);

      if (dotUp > -0.5 && dotUp < 0.999) {
        // Cross product gives correction sign around forward axis
        const cross = new THREE.Vector3().crossVectors(projectedUp, worldUp);
        const correctionAngle = cross.dot(localForward) * this.horizonAssistStrength * stepDt;
        const qAssist = new THREE.Quaternion().setFromAxisAngle(localForward, correctionAngle);
        this.quaternion.premultiply(qAssist);
      }
    }

    // Strict invariant: normalize quaternion every step to prevent drift or NaN
    this.quaternion.normalize();

    // 5. Momentum & Propulsion Integration
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
    const accel = this.baseAcceleration * this.accelerationMultiplier;
    const effectiveThrust = Math.pow(this.currentThrottle, 1.25) * accel;
    this.velocity.addScaledVector(forward, effectiveThrust * stepDt);

    // Space drag / velocity damping
    this.velocity.multiplyScalar(Math.pow(this.linearDamping, stepDt * 60));

    // Approach envelope intelligent speed braking
    if (this.approachController) {
      this.approachController.applyApproachBraking(this.velocity, this.position);
    }

    // Cap maximum cruise speed
    const maxSpeed = this.maxCruiseSpeed * this.maxCruiseSpeedMultiplier;
    const speed = this.velocity.length();
    if (speed > maxSpeed) {
      this.velocity.setLength(maxSpeed);
    }

    // 6. Update Position & Resolve Physics Collisions
    this.position.addScaledVector(this.velocity, stepDt);

    if (this.physicsSystem) {
      this.lastCollision = this.physicsSystem.resolvePhysics(this.position, this.velocity, stepDt);
    }
  }

  private updateCinematicCamera(
    camera: THREE.PerspectiveCamera,
    dt: number,
    forward: THREE.Vector3,
    speed: number
  ): void {
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);

    const speedRatio = Math.min(1, speed / this.maxCruiseSpeed);
    const distanceBehind = 6.5 + speedRatio * 1.8;
    const heightAbove = 1.15 + speedRatio * 0.4;

    const desiredCamPos = this.position
      .clone()
      .sub(forward.clone().multiplyScalar(distanceBehind))
      .add(up.clone().multiplyScalar(heightAbove));

    const lookAheadDist = 16.0 + speedRatio * 8.0;
    const lookHeight = 0.35 + speedRatio * 0.25;
    const desiredLookTarget = this.position
      .clone()
      .add(forward.clone().multiplyScalar(lookAheadDist))
      .add(up.clone().multiplyScalar(lookHeight));

    // Soft camera up interpolation preventing horizon flips
    const desiredUp = up.clone().lerp(new THREE.Vector3(0, 1, 0), 0.15).normalize();

    if (!this.isCameraInitialized) {
      this.cameraTargetPos.copy(desiredCamPos);
      this.cameraLookTarget.copy(desiredLookTarget);
      this.currentCameraUp.copy(desiredUp);
      this.isCameraInitialized = true;
    } else {
      // High-precision frame-rate independent critical damping follow
      const posLerp = 1 - Math.exp(-14.0 * dt);
      const lookLerp = 1 - Math.exp(-18.0 * dt);
      this.cameraTargetPos.lerp(desiredCamPos, posLerp);
      this.cameraLookTarget.lerp(desiredLookTarget, lookLerp);
      this.currentCameraUp.lerp(desiredUp, Math.min(1, dt * 8.0)).normalize();
    }

    camera.position.copy(this.cameraTargetPos);
    camera.up.copy(this.currentCameraUp);
    camera.lookAt(this.cameraLookTarget);

    // Dynamic FOV easing (63° cruise to 72° boost)
    const targetFov = 63 + speedRatio * 9;
    this.currentFov += (targetFov - this.currentFov) * Math.min(1, dt * 4.0);
    camera.fov = this.currentFov;
    camera.updateProjectionMatrix();
  }

  public getSpeed(): number {
    return this.velocity.length();
  }

  public getThrottle(): number {
    return this.currentThrottle;
  }

  public getSteeringRates(): { yaw: number; pitch: number; roll: number } {
    return { yaw: this.yawVelocity, pitch: this.pitchVelocity, roll: this.rollVelocity };
  }
}
