import * as THREE from 'three';
import type { ModuleOrder } from '../../persistence/SaveManager';

export class CourierPod {
  public group: THREE.Group;
  public order: ModuleOrder;
  public position: THREE.Vector3;
  public isTractorLocked = false;
  private coreMesh: THREE.Mesh;
  private beaconLight: THREE.PointLight;
  private tractorGlowMesh: THREE.Mesh;
  private clock = 0;

  constructor(order: ModuleOrder, spawnPos: THREE.Vector3) {
    this.order = order;
    this.position = spawnPos.clone();
    this.group = new THREE.Group();

    // Geometric autonomous delivery capsule
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7, // Vibrant courier blue
      roughness: 0.35,
      metalness: 0.7,
      flatShading: true,
    });

    const trimMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15, // High-visibility hazard amber
      roughness: 0.4,
      metalness: 0.5,
    });

    // Hexagonal capsule body
    const bodyGeo = new THREE.CylinderGeometry(1.6, 1.8, 4.2, 6);
    this.coreMesh = new THREE.Mesh(bodyGeo, hullMat);
    this.group.add(this.coreMesh);

    // Docking collar / clamp ring
    const ringGeo = new THREE.TorusGeometry(1.9, 0.25, 6, 12);
    const ring = new THREE.Mesh(ringGeo, trimMat);
    ring.rotation.x = Math.PI / 2;
    this.group.add(ring);

    // Beacon signal light
    this.beaconLight = new THREE.PointLight(0x38bdf8, 3.5, 60);
    this.beaconLight.position.set(0, 2.5, 0);
    this.group.add(this.beaconLight);

    const beaconOrb = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    beaconOrb.position.set(0, 2.3, 0);
    this.group.add(beaconOrb);

    // Tractor beam lock halo ring (glows brighter when being pulled)
    const haloGeo = new THREE.RingGeometry(2.2, 2.6, 16);
    this.tractorGlowMesh = new THREE.Mesh(
      haloGeo,
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.2,
      })
    );
    this.tractorGlowMesh.rotation.x = Math.PI / 2;
    this.group.add(this.tractorGlowMesh);

    this.group.position.copy(this.position);
  }

  public applyTractorPull(targetPos: THREE.Vector3, dt: number): void {
    this.isTractorLocked = true;
    const toShip = new THREE.Vector3().subVectors(targetPos, this.position);
    const dist = toShip.length();
    if (dist > 1.0) {
      toShip.normalize();
      const pullSpeed = Math.min(45, Math.max(22, dist * 0.4));
      this.position.addScaledVector(toShip, pullSpeed * dt);
      this.group.position.copy(this.position);
    }
    (this.tractorGlowMesh.material as THREE.MeshBasicMaterial).opacity = 0.85;
    this.beaconLight.intensity = 5.0;
  }

  public update(dt: number, shipPos?: THREE.Vector3): void {
    this.clock += dt;
    this.coreMesh.rotation.y += dt * 0.6;

    // Station keeping: if ship has moved far away (> 110m) and tractor isn't engaged,
    // gently follow so the delivery pod isn't abandoned in empty vacuum
    if (!this.isTractorLocked && shipPos) {
      const dist = this.position.distanceTo(shipPos);
      if (dist > 120) {
        const dir = new THREE.Vector3().subVectors(shipPos, this.position).normalize();
        this.position.addScaledVector(dir, Math.min(25, (dist - 100) * 0.3) * dt);
      }
    }

    this.group.position.set(
      this.position.x,
      this.position.y + Math.sin(this.clock * 1.5) * 1.2,
      this.position.z
    );

    const pulse = 2.0 + Math.sin(this.clock * 5.0) * 1.5;
    this.beaconLight.intensity = pulse;

    if (!this.isTractorLocked) {
      (this.tractorGlowMesh.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.sin(this.clock * 3.0) * 0.15;
    }
    this.isTractorLocked = false; // Reset for next frame
  }
}
