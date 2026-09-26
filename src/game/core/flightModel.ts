import * as THREE from 'three';
import type { NormalizedInputState } from '../input/InputSource';
import type { CelestialPhysicsSystem, CollisionResult } from './celestialPhysics';
import type { ApproachController } from '../flight/ApproachController';
import { ShipStructurePhysicsSystem, type StructureCollisionResult } from '../physics/ShipStructurePhysics';

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

  // Cinematic Chase & Cockpit POV Camera Rig
  public cameraViewMode: 'CHASE' | 'COCKPIT' = 'CHASE';
  public viewTransitionProgress = 0.0;
  private cameraTargetPos: THREE.Vector3 = new THREE.Vector3(0, 2.8, 12.5);
  private cameraLookTarget: THREE.Vector3 = new THREE.Vector3(0, 0.6, -6.0);
  private currentCameraUp: THREE.Vector3 = new THREE.Vector3(0, 1, 0);
  private currentFov = 60;
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
  public lastStructureCollision: StructureCollisionResult = {
    hasCollided: false,
    penetrationDepth: 0,
    surfaceNormal: new THREE.Vector3(),
    impactSpeed: 0,
  };
  public structurePhysicsSystem: ShipStructurePhysicsSystem = new ShipStructurePhysicsSystem();
  private physicsSystem: CelestialPhysicsSystem | null = null;
  private approachController: ApproachController | null = null;

  constructor(
    shipGroup?: THREE.Group,
    physicsSystem?: CelestialPhysicsSystem,
    approachController?: ApproachController,
    shipVisualRoot?: THREE.Group
  ) {
    const root = shipGroup || new THREE.Group();
    this.shipPhysicsRoot = root;
    this.shipGroup = root;

    if (shipVisualRoot) {
      this.shipVisualRoot = shipVisualRoot;
    } else {
      // Find or create child visual root
      if (root.children.length > 0 && (root.children[0] as THREE.Group).isGroup) {
        this.shipVisualRoot = root.children[0] as THREE.Group;
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

  public setCameraViewMode(mode: 'CHASE' | 'COCKPIT'): void {
    this.cameraViewMode = mode;
  }

  public getCameraViewMode(): 'CHASE' | 'COCKPIT' {
    return this.cameraViewMode;
  }

  public toggleCameraViewMode(): 'CHASE' | 'COCKPIT' {
    this.cameraViewMode = this.cameraViewMode === 'CHASE' ? 'COCKPIT' : 'CHASE';
    return this.cameraViewMode;
  }

  // Static persistent scratch vectors & quaternions for zero GC per frame
  private static readonly scratchRight = new THREE.Vector3();
  private static readonly scratchUp = new THREE.Vector3();
  private static readonly scratchForward = new THREE.Vector3();
  private static readonly scratchWorldUp = new THREE.Vector3(0, 1, 0);
  private static readonly scratchProjectedUp = new THREE.Vector3();
  private static readonly scratchCross = new THREE.Vector3();
  private static readonly scratchQPitch = new THREE.Quaternion();
  private static readonly scratchQYaw = new THREE.Quaternion();
  private static readonly scratchQRoll = new THREE.Quaternion();
  private static readonly scratchQAssist = new THREE.Quaternion();
  private static readonly scratchDesiredCamPos = new THREE.Vector3();
  private static readonly scratchDesiredLookTarget = new THREE.Vector3();
  private static readonly scratchDesiredUp = new THREE.Vector3();
  private static readonly scratchCockpitCamPos = new THREE.Vector3();
  private static readonly scratchCockpitLookTarget = new THREE.Vector3();
  private static readonly scratchCockpitUp = new THREE.Vector3();

  public update(input: NormalizedInputState, dt: number, camera: THREE.PerspectiveCamera): void {
    const clampedDt = Math.max(0.001, Math.min(dt, 0.05));
    this.stepSimulation(input, clampedDt);

    // 2. Visual banking on shipVisualRoot
    const targetBank = -input.axes.x * this.autoBankFactor;
    this.visualBankAngle += (targetBank - this.visualBankAngle) * Math.min(1, clampedDt * 8.0);
    this.shipVisualRoot.rotation.z = this.visualBankAngle;

    // 3. Update physics root transform
    this.shipPhysicsRoot.position.copy(this.position);
    this.shipPhysicsRoot.quaternion.copy(this.quaternion);

    // Telemetry angle delta
    const angleDeltaDeg = this.quaternion.angleTo(this.prevQuat) * (180 / Math.PI);
    const hasDiscontinuity = angleDeltaDeg > 45.0;
    this.prevQuat.copy(this.quaternion);

    // 4. Update Cinematic Chase Camera
    FlightModel.scratchForward.set(0, 0, -1).applyQuaternion(this.quaternion);
    const speed = this.velocity.length();
    this.updateCinematicCamera(camera, clampedDt, FlightModel.scratchForward, speed);

    // 5. Update Telemetry
    this.telemetry.physicsQuat.copy(this.quaternion);
    this.telemetry.visualQuat.copy(this.shipVisualRoot.quaternion);
    this.telemetry.angleDeltaDeg = angleDeltaDeg;
    this.telemetry.yawRate = this.yawVelocity;
    this.telemetry.pitchRate = this.pitchVelocity;
    this.telemetry.rollRate = this.rollVelocity;
    this.telemetry.simSteps = 1;
    this.telemetry.dt = clampedDt;
    this.telemetry.cameraUpDotWorldUp = camera.up.dot(FlightModel.scratchWorldUp);
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

    // 3. Local Axis-Angle Quaternion Integration using scratch vectors
    FlightModel.scratchRight.set(1, 0, 0).applyQuaternion(this.quaternion);
    FlightModel.scratchUp.set(0, 1, 0).applyQuaternion(this.quaternion);
    FlightModel.scratchForward.set(0, 0, -1).applyQuaternion(this.quaternion);

    // Pitch around local right
    if (Math.abs(this.pitchVelocity) > 0.0001) {
      FlightModel.scratchQPitch.setFromAxisAngle(FlightModel.scratchRight, this.pitchVelocity * stepDt);
      this.quaternion.premultiply(FlightModel.scratchQPitch);
    }

    // Yaw around local up
    if (Math.abs(this.yawVelocity) > 0.0001) {
      FlightModel.scratchQYaw.setFromAxisAngle(FlightModel.scratchUp, this.yawVelocity * stepDt);
      this.quaternion.premultiply(FlightModel.scratchQYaw);
    }

    // Roll around local forward
    if (Math.abs(this.rollVelocity) > 0.0001) {
      FlightModel.scratchQRoll.setFromAxisAngle(FlightModel.scratchForward, this.rollVelocity * stepDt);
      this.quaternion.premultiply(FlightModel.scratchQRoll);
    }

    // 4. Soft Horizon Restorative Tendency
    // If player is not actively commanding roll, gently nudge craft upright relative to reference up
    if (Math.abs(input.roll) < 0.05) {
      FlightModel.scratchUp.set(0, 1, 0).applyQuaternion(this.quaternion);

      // Determine tilt along roll axis
      FlightModel.scratchProjectedUp.copy(FlightModel.scratchUp).projectOnPlane(FlightModel.scratchForward).normalize();
      const dotUp = FlightModel.scratchProjectedUp.dot(FlightModel.scratchWorldUp);

      if (dotUp > -0.5 && dotUp < 0.999) {
        // Cross product gives correction sign around forward axis
        FlightModel.scratchCross.crossVectors(FlightModel.scratchProjectedUp, FlightModel.scratchWorldUp);
        const correctionAngle = FlightModel.scratchCross.dot(FlightModel.scratchForward) * this.horizonAssistStrength * stepDt;
        FlightModel.scratchQAssist.setFromAxisAngle(FlightModel.scratchForward, correctionAngle);
        this.quaternion.premultiply(FlightModel.scratchQAssist);
      }
    }

    // Strict invariant: normalize quaternion every step to prevent drift or NaN
    this.quaternion.normalize();

    // 5. Momentum & Propulsion Integration
    FlightModel.scratchForward.set(0, 0, -1).applyQuaternion(this.quaternion);
    const accel = this.baseAcceleration * this.accelerationMultiplier;
    const effectiveThrust = Math.pow(this.currentThrottle, 1.25) * accel;
    this.velocity.addScaledVector(FlightModel.scratchForward, effectiveThrust * stepDt);

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

    this.lastStructureCollision = this.structurePhysicsSystem.resolveCollisions(
      this.position,
      this.velocity,
      stepDt
    );
  }

  private updateCinematicCamera(
    camera: THREE.PerspectiveCamera,
    dt: number,
    forward: THREE.Vector3,
    speed: number
  ): void {
    FlightModel.scratchUp.set(0, 1, 0).applyQuaternion(this.quaternion);
    FlightModel.scratchRight.set(1, 0, 0).applyQuaternion(this.quaternion);

    const speedRatio = Math.min(1, speed / this.maxCruiseSpeed);

    // 1. Chase Camera Targets
    const distanceBehind = 12.5 + speedRatio * 2.5;
    const heightAbove = 2.8 + speedRatio * 0.4;

    FlightModel.scratchDesiredCamPos
      .copy(this.position)
      .addScaledVector(forward, -distanceBehind)
      .addScaledVector(FlightModel.scratchUp, heightAbove);

    const lookAheadDist = 6.0 + speedRatio * 3.0;
    const lookHeight = 0.6 + speedRatio * 0.2;
    FlightModel.scratchDesiredLookTarget
      .copy(this.position)
      .addScaledVector(forward, lookAheadDist)
      .addScaledVector(FlightModel.scratchUp, lookHeight);

    // Soft camera up interpolation preventing horizon flips
    FlightModel.scratchDesiredUp
      .copy(FlightModel.scratchUp)
      .lerp(FlightModel.scratchWorldUp, 0.15)
      .normalize();

    // 2. Cockpit POV Camera Targets
    // Pilot eye location: (0, 0.49, -0.42) relative to ship origin, plus dynamic G-force head shift
    const headGForceZ = -speedRatio * 0.025;
    const headGForceX = -this.yawVelocity * 0.015;

    FlightModel.scratchCockpitCamPos
      .copy(this.position)
      .addScaledVector(FlightModel.scratchUp, 0.49)
      .addScaledVector(forward, 0.42 + headGForceZ)
      .addScaledVector(FlightModel.scratchRight, headGForceX);

    FlightModel.scratchCockpitLookTarget
      .copy(FlightModel.scratchCockpitCamPos)
      .addScaledVector(forward, 100.0)
      .addScaledVector(FlightModel.scratchUp, 0.2);

    FlightModel.scratchCockpitUp.copy(FlightModel.scratchUp);

    // 3. Smooth View Transition (Chase <-> Cockpit)
    const targetProgress = this.cameraViewMode === 'COCKPIT' ? 1.0 : 0.0;
    this.viewTransitionProgress += (targetProgress - this.viewTransitionProgress) * Math.min(1.0, dt * 7.5);

    // Blend between Chase and Cockpit
    if (this.viewTransitionProgress > 0.001) {
      FlightModel.scratchDesiredCamPos.lerp(FlightModel.scratchCockpitCamPos, this.viewTransitionProgress);
      FlightModel.scratchDesiredLookTarget.lerp(FlightModel.scratchCockpitLookTarget, this.viewTransitionProgress);
      FlightModel.scratchDesiredUp.lerp(FlightModel.scratchCockpitUp, this.viewTransitionProgress).normalize();
    }

    if (!this.isCameraInitialized) {
      this.cameraTargetPos.copy(FlightModel.scratchDesiredCamPos);
      this.cameraLookTarget.copy(FlightModel.scratchDesiredLookTarget);
      this.currentCameraUp.copy(FlightModel.scratchDesiredUp);
      this.isCameraInitialized = true;
    } else {
      // High-precision frame-rate independent critical damping follow
      const posFollowRate = THREE.MathUtils.lerp(14.0, 28.0, this.viewTransitionProgress);
      const lookFollowRate = THREE.MathUtils.lerp(18.0, 32.0, this.viewTransitionProgress);
      const posLerp = 1 - Math.exp(-posFollowRate * dt);
      const lookLerp = 1 - Math.exp(-lookFollowRate * dt);
      this.cameraTargetPos.lerp(FlightModel.scratchDesiredCamPos, posLerp);
      this.cameraLookTarget.lerp(FlightModel.scratchDesiredLookTarget, lookLerp);
      this.currentCameraUp.lerp(FlightModel.scratchDesiredUp, Math.min(1, dt * 10.0)).normalize();
    }

    camera.position.copy(this.cameraTargetPos);
    camera.up.copy(this.currentCameraUp);
    camera.lookAt(this.cameraLookTarget);

    // Dynamic FOV easing (60° cruise to 69° boost in chase; 72° to 78° in cockpit)
    const chaseTargetFov = 60 + speedRatio * 9;
    const cockpitTargetFov = 72 + speedRatio * 6;
    const targetFov = THREE.MathUtils.lerp(chaseTargetFov, cockpitTargetFov, this.viewTransitionProgress);

    this.currentFov += (targetFov - this.currentFov) * Math.min(1, dt * 5.0);
    if (Math.abs(camera.fov - this.currentFov) > 0.05) {
      camera.fov = this.currentFov;
      camera.updateProjectionMatrix();
    }
  }

  public resetCamera(camera?: THREE.PerspectiveCamera): void {
    this.isCameraInitialized = false;
    this.currentFov = 60;

    if (this.shipPhysicsRoot) {
      this.position.copy(this.shipPhysicsRoot.position);
      this.quaternion.copy(this.shipPhysicsRoot.quaternion);
    }

    const forward = FlightModel.scratchForward.set(0, 0, -1).applyQuaternion(this.quaternion).normalize();
    FlightModel.scratchUp.set(0, 1, 0).applyQuaternion(this.quaternion).normalize();

    const camDistance = 3.6;
    const camHeight = 1.1;

    FlightModel.scratchDesiredCamPos
      .copy(this.position)
      .addScaledVector(forward, -camDistance)
      .addScaledVector(FlightModel.scratchUp, camHeight);

    const lookAheadDist = 6.0;
    const lookHeight = 0.6;
    FlightModel.scratchDesiredLookTarget
      .copy(this.position)
      .addScaledVector(forward, lookAheadDist)
      .addScaledVector(FlightModel.scratchUp, lookHeight);

    FlightModel.scratchDesiredUp
      .copy(FlightModel.scratchUp)
      .lerp(FlightModel.scratchWorldUp, 0.15)
      .normalize();

    this.cameraTargetPos.copy(FlightModel.scratchDesiredCamPos);
    this.cameraLookTarget.copy(FlightModel.scratchDesiredLookTarget);
    this.currentCameraUp.copy(FlightModel.scratchDesiredUp);
    this.isCameraInitialized = true;

    if (camera) {
      camera.position.copy(this.cameraTargetPos);
      camera.up.copy(this.currentCameraUp);
      camera.lookAt(this.cameraLookTarget);
      camera.fov = 60;
      camera.updateProjectionMatrix();
    }
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
