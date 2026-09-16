import * as THREE from 'three';
import type { StarSystemDescriptor } from '../systems/PlanetDescriptor';
import type { FlightModel } from '../core/flightModel';
import type { SpaceScene } from '../scenes/spaceScene';
import type { WorldPosition, SectorCoord } from '../universe/WorldPosition';
import { FlightPhase, type FlightStateMachine } from './FlightStateMachine';
import { audio } from '../../audio/AudioEngine';

export interface DeepCruiseState {
  isActive: boolean;
  targetSystem: StarSystemDescriptor | null;
  targetSector: SectorCoord | null;
  targetWorldPos: WorldPosition | null;
  cruiseProgress: number; // 0.0 to 1.0
  cruiseDuration: number; // in seconds (typically 8 to 14s)
  currentWarpSpeed: number; // units/s
  travelDistanceRemaining: number;
}

export class DeepCruiseController {
  private stateMachine: FlightStateMachine;
  private flightModel: FlightModel;
  private spaceScene: SpaceScene;

  public state: DeepCruiseState = {
    isActive: false,
    targetSystem: null,
    targetSector: null,
    targetWorldPos: null,
    cruiseProgress: 0,
    cruiseDuration: 10,
    currentWarpSpeed: 0,
    travelDistanceRemaining: 0,
  };

  private maxWarpSpeed = 3500;
  private warpHeading: THREE.Vector3 = new THREE.Vector3(0, 0, -1);
  private onArrivalCallback: ((system: StarSystemDescriptor) => void) | null = null;

  constructor(
    stateMachine: FlightStateMachine,
    flightModel: FlightModel,
    spaceScene: SpaceScene
  ) {
    this.stateMachine = stateMachine;
    this.flightModel = flightModel;
    this.spaceScene = spaceScene;
  }

  public setOnArrival(cb: (system: StarSystemDescriptor) => void): void {
    this.onArrivalCallback = cb;
  }

  /**
   * Engages interstellar deep cruise toward the targeted star system.
   */
  public engage(
    targetSystem: StarSystemDescriptor,
    currentWorldPos: WorldPosition
  ): boolean {
    if (this.state.isActive) return false;

    // Calculate distance in sectors
    const dx = targetSystem.sectorX - currentWorldPos.sector.x;
    const dy = targetSystem.sectorY - currentWorldPos.sector.y;
    const dz = targetSystem.sectorZ - currentWorldPos.sector.z;
    const sectorDist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Duration: 7 to 14 seconds depending on sector distance
    const duration = Math.min(14, Math.max(7, 6 + sectorDist * 1.5));

    this.state.isActive = true;
    this.state.targetSystem = targetSystem;
    this.state.targetSector = { x: targetSystem.sectorX, y: targetSystem.sectorY, z: targetSystem.sectorZ };
    this.state.cruiseProgress = 0;
    this.state.cruiseDuration = duration;
    this.state.currentWarpSpeed = 0;
    this.state.travelDistanceRemaining = Math.max(1, sectorDist) * 4000;

    // Direction vector toward target system sector
    if (sectorDist > 0.001) {
      this.warpHeading.set(dx, dy, dz).normalize();
    } else {
      this.warpHeading.set(0, 0, -1).applyQuaternion(this.flightModel.quaternion);
    }

    // Orient ship along warp heading smoothly
    const targetQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), this.warpHeading);
    this.flightModel.quaternion.slerp(targetQuat, 0.85);

    this.stateMachine.transitionTo(FlightPhase.STELLAR_CRUISE);
    audio.setContext('deep_cruise');
    return true;
  }

  public update(dt: number, currentWorldPos: WorldPosition): void {
    if (!this.state.isActive || !this.state.targetSystem || !this.state.targetSector) return;

    this.state.cruiseProgress += dt / this.state.cruiseDuration;
    const p = Math.min(1, this.state.cruiseProgress);

    // Bell-curve speed profile: accelerates smoothly, cruises, decelerates into destination sector
    let speedCurve = 0;
    if (p < 0.25) {
      speedCurve = Math.sin((p / 0.25) * (Math.PI / 2));
    } else if (p > 0.75) {
      speedCurve = Math.cos(((p - 0.75) / 0.25) * (Math.PI / 2));
    } else {
      speedCurve = 1.0;
    }

    this.state.currentWarpSpeed = speedCurve * this.maxWarpSpeed;
    this.state.travelDistanceRemaining = (1 - p) * (this.state.cruiseDuration * 2500);

    // Subtle star stretching factor based on warp speed
    const warpFactor = speedCurve * 1.4;
    this.spaceScene.warpFactor = warpFactor;
    this.spaceScene.warpHeading = this.warpHeading;

    // Advance ship position forward in flight model
    this.flightModel.velocity.copy(this.warpHeading).multiplyScalar(Math.max(50, this.state.currentWarpSpeed * 0.08));

    // When progress completes, drop out of warp cleanly
    if (p >= 1.0) {
      this.dropOutOfCruise(currentWorldPos);
    }
  }

  public cancel(currentWorldPos: WorldPosition): void {
    if (!this.state.isActive) return;
    this.dropOutOfCruise(currentWorldPos);
  }

  private dropOutOfCruise(currentWorldPos: WorldPosition): void {
    this.state.isActive = false;
    this.spaceScene.warpFactor = 0;

    const targetSys = this.state.targetSystem;
    const targetSec = this.state.targetSector;

    if (targetSys && targetSec) {
      // Set logical player position at target sector
      currentWorldPos.sector.x = targetSec.x;
      currentWorldPos.sector.y = targetSec.y;
      currentWorldPos.sector.z = targetSec.z;
      currentWorldPos.localOffset.set(0, 0, 100);

      // Reset ship render position near entry point of target system
      this.flightModel.position.set(0, 0, 100);
      this.flightModel.velocity.set(0, 0, -25);

      // Load new system into SpaceScene
      this.spaceScene.loadSystem(targetSys);
      if (typeof this.flightModel.setPhysicsSystem === 'function' && this.spaceScene.physics) {
        this.flightModel.setPhysicsSystem(this.spaceScene.physics);
      }

      if (this.onArrivalCallback) {
        this.onArrivalCallback(targetSys);
      }
    }

    this.state.targetSystem = null;
    this.state.targetSector = null;
    this.stateMachine.transitionTo(FlightPhase.SYSTEM_CRUISE);
    audio.setContext('cruise');
  }
}
