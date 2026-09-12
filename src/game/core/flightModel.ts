import * as THREE from 'three';
import type { NormalizedInputState } from '../input/InputSource';
import type { CelestialPhysicsSystem, CollisionResult } from './celestialPhysics';
import type { ApproachController } from '../flight/ApproachController';

export class FlightModel {
  public shipGroup: THREE.Group;
  public position: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public velocity: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public quaternion: THREE.Quaternion = new THREE.Quaternion();

  // Angular rates
  private pitchRate = 0;
  private yawRate = 0;
  private rollRate = 0;
  private currentThrottle = 0;

  // Visual bank angle (local ship tilt during yaw turns)
  private currentBankAngle = 0;

  // Refined flight dynamics parameters
  private readonly maxCruiseSpeed = 160;
  private readonly acceleration = 75;
  private readonly linearDamping = 0.988; // Gentle glide
  private readonly turnSpeed = 1.75;
  private readonly angularDamping = 0.86;
  private readonly autoBankFactor = 0.55;

  // Considered Chase Camera Follow
  private cameraTargetPos: THREE.Vector3 = new THREE.Vector3(0, 3, 10);
  private cameraLookTarget: THREE.Vector3 = new THREE.Vector3(0, 0, -20);
  private currentFov = 64;

  // Collision & safety state
  public lastCollision: CollisionResult = { hasCollided: false, penetrationDepth: 0 };
  private physicsSystem: CelestialPhysicsSystem | null = null;
  private approachController: ApproachController | null = null;

  constructor(
    shipGroup: THREE.Group,
    physicsSystem?: CelestialPhysicsSystem,
    approachController?: ApproachController
  ) {
    this.shipGroup = shipGroup;
    this.physicsSystem = physicsSystem || null;
    this.approachController = approachController || null;
    this.quaternion.setFromEuler(new THREE.Euler(0, 0, 0, 'YXZ'));
  }

  public setPhysicsSystem(physics: CelestialPhysicsSystem): void {
    this.physicsSystem = physics;
  }

  public setApproachController(controller: ApproachController): void {
    this.approachController = controller;
  }

  public onRebase(offset: THREE.Vector3): void {
    // When floating origin rebases, camera offsets shift cleanly
    this.cameraTargetPos.add(offset);
    this.cameraLookTarget.add(offset);
  }

  public update(input: NormalizedInputState, dt: number, camera: THREE.PerspectiveCamera): void {
    const clampedDt = Math.min(dt, 0.06);

    // 1. Smooth Throttle Response
    const throttleTarget = Math.max(0, Math.min(1, input.throttle));
    const throttleRampSpeed = throttleTarget > this.currentThrottle ? 3.5 : 2.5;
    this.currentThrottle += (throttleTarget - this.currentThrottle) * Math.min(1, clampedDt * throttleRampSpeed);

    // 2. Coordinated Angular Steering
    const targetPitchRate = input.axes.y * this.turnSpeed;
    const targetYawRate = -input.axes.x * this.turnSpeed;
    const targetRollRate = (-input.roll) * this.turnSpeed;

    const angularEase = 1 - Math.pow(this.angularDamping, clampedDt * 60);
    this.pitchRate += (targetPitchRate - this.pitchRate) * angularEase;
    this.yawRate += (targetYawRate - this.yawRate) * angularEase;
    this.rollRate += (targetRollRate - this.rollRate) * angularEase;

    // Apply incremental rotation to ship quaternion
    const deltaRot = new THREE.Quaternion();
    const eulerDelta = new THREE.Euler(
      this.pitchRate * clampedDt,
      this.yawRate * clampedDt,
      this.rollRate * clampedDt,
      'YXZ'
    );
    deltaRot.setFromEuler(eulerDelta);
    this.quaternion.multiply(deltaRot);

    // 3. Visual Banking Tilt into Turns
    const targetBank = -input.axes.x * this.autoBankFactor;
    this.currentBankAngle += (targetBank - this.currentBankAngle) * Math.min(1, clampedDt * 6);

    const bankQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.currentBankAngle);
    const finalVisualQuat = this.quaternion.clone().multiply(bankQuat);
    this.shipGroup.quaternion.copy(finalVisualQuat);

    // 4. Momentum & Thrust Vector
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
    const effectiveThrust = Math.pow(this.currentThrottle, 1.3) * this.acceleration;
    this.velocity.addScaledVector(forward, effectiveThrust * clampedDt);

    // Space inertia damping
    this.velocity.multiplyScalar(Math.pow(this.linearDamping, clampedDt * 60));

    // Approach envelope intelligent speed braking
    if (this.approachController) {
      this.approachController.applyApproachBraking(this.velocity, this.position);
    }

    // Cap velocity
    const speed = this.velocity.length();
    if (speed > this.maxCruiseSpeed) {
      this.velocity.setLength(this.maxCruiseSpeed);
    }

    // 5. Update Position and Resolve Celestial Collisions
    this.position.addScaledVector(this.velocity, clampedDt);

    if (this.physicsSystem) {
      this.lastCollision = this.physicsSystem.resolvePhysics(this.position, this.velocity, clampedDt);
    }

    this.shipGroup.position.copy(this.position);

    // 6. Considered Chase Camera Follow
    this.updateCamera(camera, clampedDt, forward, speed);
  }

  private updateCamera(
    camera: THREE.PerspectiveCamera,
    dt: number,
    forward: THREE.Vector3,
    speed: number
  ): void {
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);

    // Dynamic camera distance: expands back slightly with speed
    const speedRatio = Math.min(1, speed / this.maxCruiseSpeed);
    const distanceBehind = 7.8 + speedRatio * 3.2;
    const heightAbove = 2.4 + speedRatio * 0.6;

    const desiredCamPos = this.position
      .clone()
      .sub(forward.clone().multiplyScalar(distanceBehind))
      .add(up.clone().multiplyScalar(heightAbove));

    // Look-ahead target ahead of craft
    const lookAheadDist = 18 + speedRatio * 12;
    const desiredLookTarget = this.position.clone().add(forward.clone().multiplyScalar(lookAheadDist));

    // Smooth spring-damper lerp
    const camFollowLerp = 1 - Math.pow(0.002, dt);
    this.cameraTargetPos.lerp(desiredCamPos, camFollowLerp);
    this.cameraLookTarget.lerp(desiredLookTarget, camFollowLerp);

    camera.position.copy(this.cameraTargetPos);
    camera.up.copy(up);
    camera.lookAt(this.cameraLookTarget);

    // Dynamic FOV for speed sensation (63° to 71°)
    const targetFov = 63 + speedRatio * 8;
    this.currentFov += (targetFov - this.currentFov) * Math.min(1, dt * 3);
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
    return { yaw: this.yawRate, pitch: this.pitchRate, roll: this.rollRate };
  }
}
