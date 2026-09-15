import * as THREE from 'three';
import type { ModuleOrder } from '../../persistence/SaveManager';

export class CourierPod {
  public group: THREE.Group;
  public order: ModuleOrder;
  public position: THREE.Vector3;
  private coreMesh: THREE.Mesh;
  private beaconLight: THREE.PointLight;
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
    this.beaconLight = new THREE.PointLight(0x38bdf8, 2.5, 30);
    this.beaconLight.position.set(0, 2.5, 0);
    this.group.add(this.beaconLight);

    const beaconOrb = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    beaconOrb.position.set(0, 2.3, 0);
    this.group.add(beaconOrb);

    this.group.position.copy(this.position);
  }

  public update(dt: number): void {
    this.clock += dt;
    this.coreMesh.rotation.y += dt * 0.4;
    this.group.position.y = this.position.y + Math.sin(this.clock * 1.5) * 1.2;

    const pulse = 1.5 + Math.sin(this.clock * 4.0) * 1.2;
    this.beaconLight.intensity = pulse;
  }
}
