import * as THREE from 'three';
import type { DockableEntity, DockingStatus } from '../docking/DockableEntity';

export interface StationConfig {
  id: string;
  name: string;
  faction: string;
  position: THREE.Vector3;
  services: ('signal_lab' | 'concourse' | 'archive' | 'dockyard' | 'supply')[];
}

export class SpaceStation implements DockableEntity {
  public id: string;
  public name: string;
  public faction: string;
  public position: THREE.Vector3;
  public dockingPortOffset: THREE.Vector3;
  public captureRadius = 120;
  public approachDistance = 450;
  public group: THREE.Group;
  public services: ('signal_lab' | 'concourse' | 'archive' | 'dockyard' | 'supply')[];

  private dockingStatus: DockingStatus = 'IDLE';
  private ringMesh: THREE.Mesh;
  private bayLights: THREE.PointLight[] = [];
  private lightClock = 0;

  constructor(config: StationConfig) {
    this.id = config.id;
    this.name = config.name;
    this.faction = config.faction;
    this.position = config.position.clone();
    this.services = [...config.services];
    this.dockingPortOffset = new THREE.Vector3(0, 0, 75);

    this.group = new THREE.Group();
    this.group.position.copy(this.position);

    // Build Station Geometries
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.8,
      roughness: 0.3,
      flatShading: true,
    });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const solarMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a8a,
      metalness: 0.9,
      roughness: 0.2,
    });

    // 1. Central Core Spire
    const coreGeo = new THREE.CylinderGeometry(14, 18, 90, 16);
    const core = new THREE.Mesh(coreGeo, hullMat);
    this.group.add(core);

    // 2. Rotating Toroidal Habitat Ring
    const ringGeo = new THREE.TorusGeometry(85, 9, 8, 32);
    this.ringMesh = new THREE.Mesh(ringGeo, hullMat);
    this.ringMesh.rotation.x = Math.PI / 2;
    this.group.add(this.ringMesh);

    // Spoke struts connecting core to ring
    for (let i = 0; i < 4; i++) {
      const spokeGeo = new THREE.CylinderGeometry(2, 2, 85, 6);
      const spoke = new THREE.Mesh(spokeGeo, hullMat);
      spoke.rotation.z = Math.PI / 2;
      spoke.rotation.y = (i * Math.PI) / 2;
      this.ringMesh.add(spoke);
    }

    // 3. Solar Arrays
    const solarWingGeo = new THREE.BoxGeometry(110, 1.5, 20);
    const solarWing = new THREE.Mesh(solarWingGeo, solarMat);
    solarWing.position.set(0, 42, 0);
    this.group.add(solarWing);

    // 4. Docking Bay Module
    const bayGeo = new THREE.CylinderGeometry(22, 26, 35, 12, 1, true);
    const bayMesh = new THREE.Mesh(bayGeo, hullMat);
    bayMesh.rotation.x = Math.PI / 2;
    bayMesh.position.copy(this.dockingPortOffset);
    this.group.add(bayMesh);

    // Docking Guide Lights
    for (let l = 0; l < 4; l++) {
      const light = new THREE.PointLight(0x38bdf8, 2.5, 45);
      const ang = (l / 4) * Math.PI * 2;
      light.position.set(Math.cos(ang) * 18, Math.sin(ang) * 18, this.dockingPortOffset.z + 10);
      this.group.add(light);
      this.bayLights.push(light);

      // Light beacon mesh
      const beaconMesh = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 8), glowMat);
      beaconMesh.position.copy(light.position);
      this.group.add(beaconMesh);
    }
  }

  public update(dt: number): void {
    this.ringMesh.rotation.z += dt * 0.08;
    this.group.rotation.y += dt * 0.02;

    this.lightClock += dt * 4;
    // Sequential pulse of guide lights
    for (let i = 0; i < this.bayLights.length; i++) {
      const offset = (i / this.bayLights.length) * Math.PI * 2;
      this.bayLights[i].intensity = 1.5 + Math.sin(this.lightClock + offset) * 1.5;
    }
  }

  public canDock(shipPosition: THREE.Vector3): { allowed: boolean; reason?: string } {
    const worldDockPort = this.position.clone().add(this.dockingPortOffset);
    const dist = shipPosition.distanceTo(worldDockPort);
    if (dist > this.captureRadius) {
      return {
        allowed: false,
        reason: `Too far from docking port (${Math.round(dist)}u). Approach within ${this.captureRadius}u.`,
      };
    }
    return { allowed: true };
  }

  public onDockInitiated(): void {
    this.dockingStatus = 'AUTOPILOT_TETHER';
  }

  public onDockComplete(): void {
    this.dockingStatus = 'DOCKED';
  }

  public onUndock(): void {
    this.dockingStatus = 'IDLE';
  }

  public getDockingStatus(): DockingStatus {
    return this.dockingStatus;
  }

  public setDockingStatus(status: DockingStatus): void {
    this.dockingStatus = status;
  }

  public onRebase(offset: THREE.Vector3): void {
    this.position.add(offset);
    this.group.position.add(offset);
  }

  public dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material?.dispose();
        }
      } else if (obj instanceof THREE.PointLight) {
        obj.dispose();
      }
    });
  }
}
