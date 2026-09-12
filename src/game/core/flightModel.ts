import * as THREE from 'three';
import type { NormalizedInputState } from '../input/InputSource';

export class FlightModel {
  public shipGroup: THREE.Group;
  public position: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public velocity: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public rotation: THREE.Euler = new THREE.Euler(0, 0, 0, 'YXZ');
  public quaternion: THREE.Quaternion = new THREE.Quaternion();

  // Angular velocities
  private pitchRate = 0;
  private yawRate = 0;
  private rollRate = 0;
  private currentThrottle = 0;

  // Flight dynamics parameters
  private readonly maxSpeed = 120;
  private readonly acceleration = 60;
  private readonly linearDamping = 0.985;
  private readonly turnSpeed = 1.6;
  private readonly angularDamping = 0.88;
  private readonly autoBankFactor = 0.45;

  // Camera follow vectors
  private cameraTargetPos: THREE.Vector3 = new THREE.Vector3();
  private cameraLookTarget: THREE.Vector3 = new THREE.Vector3();

  constructor(shipGroup: THREE.Group) {
    this.shipGroup = shipGroup;
    this.quaternion.setFromEuler(this.rotation);
  }

  public update(input: NormalizedInputState, dt: number, camera: THREE.PerspectiveCamera): void {
    // Clamp delta time to avoid huge leaps during lag
    const clampedDt = Math.min(dt, 0.1);

    // Update throttle smoothly towards input throttle
    const throttleTarget = input.throttle;
    this.currentThrottle += (throttleTarget - this.currentThrottle) * Math.min(1, clampedDt * 4);

    // Apply angular inputs (axes.y = pitch, axes.x = yaw)
    // Note: in 3D flight, pitch down = negative X rotation or vice versa
    const targetPitchRate = input.axes.y * this.turnSpeed;
    const targetYawRate = -input.axes.x * this.turnSpeed;
    const targetRollRate = (-input.roll - input.axes.x * this.autoBankFactor) * this.turnSpeed;

    this.pitchRate += (targetPitchRate - this.pitchRate) * (1 - Math.pow(this.angularDamping, clampedDt * 60));
    this.yawRate += (targetYawRate - this.yawRate) * (1 - Math.pow(this.angularDamping, clampedDt * 60));
    this.rollRate += (targetRollRate - this.rollRate) * (1 - Math.pow(this.angularDamping, clampedDt * 60));

    // Incremental rotation quaternions
    const deltaRot = new THREE.Quaternion();
    const eulerDelta = new THREE.Euler(
      this.pitchRate * clampedDt,
      this.yawRate * clampedDt,
      this.rollRate * clampedDt,
      'YXZ'
    );
    deltaRot.setFromEuler(eulerDelta);
    this.quaternion.multiply(deltaRot);
    this.shipGroup.quaternion.copy(this.quaternion);

    // Forward direction from ship orientation
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);

    // Apply engine thrust along forward vector
    const thrust = forward.clone().multiplyScalar(this.currentThrottle * this.acceleration * clampedDt);
    this.velocity.add(thrust);

    // Apply subtle atmospheric/space drag
    this.velocity.multiplyScalar(Math.pow(this.linearDamping, clampedDt * 60));

    // Cap velocity
    if (this.velocity.length() > this.maxSpeed) {
      this.velocity.setLength(this.maxSpeed);
    }

    // Update position
    this.position.addScaledVector(this.velocity, clampedDt);
    this.shipGroup.position.copy(this.position);

    // Smooth Chase Camera
    this.updateCamera(camera, clampedDt, forward);
  }

  private updateCamera(camera: THREE.PerspectiveCamera, dt: number, forward: THREE.Vector3): void {
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);

    // Camera offset behind and slightly above ship
    // Pulls back subtly with throttle for dynamic feeling of speed
    const distanceBehind = 7.5 + this.currentThrottle * 2.0;
    const heightAbove = 2.2 + this.currentThrottle * 0.4;

    const desiredCamPos = this.position
      .clone()
      .sub(forward.clone().multiplyScalar(distanceBehind))
      .add(up.clone().multiplyScalar(heightAbove));

    // Camera look target ahead of ship
    const desiredLookTarget = this.position.clone().add(forward.clone().multiplyScalar(15));

    // Smooth lerp
    const camLerp = 1 - Math.pow(0.005, dt);
    this.cameraTargetPos.lerp(desiredCamPos, camLerp);
    this.cameraLookTarget.lerp(desiredLookTarget, camLerp);

    camera.position.copy(this.cameraTargetPos);
    camera.up.copy(up);
    camera.lookAt(this.cameraLookTarget);
  }

  public getSpeed(): number {
    return this.velocity.length();
  }

  public getThrottle(): number {
    return this.currentThrottle;
  }
}
