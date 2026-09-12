import * as THREE from 'three';
import type { PlanetDescriptor } from '../systems/PlanetDescriptor';

export class OrbitController {
  public planet: PlanetDescriptor | null = null;
  public planetPosition: THREE.Vector3 = new THREE.Vector3();
  public orbitRadius = 320;
  public orbitAngle = 0;
  public orbitSpeed = 0.08; // Radians per second
  public transitionProgress = 0;
  public isTransitioning = false;

  private startPos: THREE.Vector3 = new THREE.Vector3();
  private targetPos: THREE.Vector3 = new THREE.Vector3();

  public enterOrbit(planet: PlanetDescriptor, planetPos: THREE.Vector3, currentShipPos: THREE.Vector3): void {
    this.planet = planet;
    this.planetPosition.copy(planetPos);
    this.orbitRadius = planet.radius * 1.75;
    this.isTransitioning = true;
    this.transitionProgress = 0;

    this.startPos.copy(currentShipPos);

    // Initial tangent orbital entry point
    const relative = currentShipPos.clone().sub(planetPos);
    this.orbitAngle = Math.atan2(relative.z, relative.x);
    this.targetPos.set(
      planetPos.x + Math.cos(this.orbitAngle) * this.orbitRadius,
      planetPos.y + this.orbitRadius * 0.25,
      planetPos.z + Math.sin(this.orbitAngle) * this.orbitRadius
    );
  }

  public update(dt: number, shipGroup: THREE.Group, camera: THREE.PerspectiveCamera): void {
    if (!this.planet) return;

    if (this.isTransitioning) {
      this.transitionProgress += dt * 0.4; // 2.5 second smooth ease-in
      const t = Math.min(1, this.transitionProgress);
      const ease = 0.5 - 0.5 * Math.cos(t * Math.PI); // smooth sinusoidal ease

      shipGroup.position.lerpVectors(this.startPos, this.targetPos, ease);
      shipGroup.lookAt(
        this.planetPosition.x + Math.cos(this.orbitAngle + 0.3) * this.orbitRadius,
        shipGroup.position.y,
        this.planetPosition.z + Math.sin(this.orbitAngle + 0.3) * this.orbitRadius
      );

      // Camera transitions to cinematic inspection framing
      const camOffset = new THREE.Vector3(0, 8, 24);
      camOffset.applyQuaternion(shipGroup.quaternion);
      camera.position.lerp(shipGroup.position.clone().add(camOffset), dt * 3.5);
      camera.lookAt(this.planetPosition);

      if (t >= 1) {
        this.isTransitioning = false;
      }
    } else {
      // Steady orbital circulation
      this.orbitAngle += this.orbitSpeed * dt;
      const x = this.planetPosition.x + Math.cos(this.orbitAngle) * this.orbitRadius;
      const z = this.planetPosition.z + Math.sin(this.orbitAngle) * this.orbitRadius;
      const y = this.planetPosition.y + Math.sin(this.orbitAngle * 0.5) * (this.orbitRadius * 0.15);

      shipGroup.position.set(x, y, z);

      // Tangent orientation
      const tangentTarget = new THREE.Vector3(
        this.planetPosition.x + Math.cos(this.orbitAngle + 0.1) * this.orbitRadius,
        y,
        this.planetPosition.z + Math.sin(this.orbitAngle + 0.1) * this.orbitRadius
      );
      shipGroup.lookAt(tangentTarget);

      // Cinematic camera framing looking toward planet horizon
      const camPos = shipGroup.position.clone().add(new THREE.Vector3(0, 10, 26).applyQuaternion(shipGroup.quaternion));
      camera.position.lerp(camPos, dt * 4.0);
      camera.lookAt(this.planetPosition);
    }
  }

  public leaveOrbit(): void {
    this.planet = null;
    this.isTransitioning = false;
  }
}
