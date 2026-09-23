import * as THREE from 'three';
import type { StoryDirector } from '../../story/StoryDirector';

export interface HarmonicRelayConfig {
  id: string;
  name: string;
  position: THREE.Vector3;
}

export interface RelayPillar {
  index: number;
  position: THREE.Vector3;
  mesh: THREE.Mesh;
  light: THREE.PointLight;
  isAligned: boolean;
}

export class HarmonicRelay {
  public id: string;
  public name: string;
  public position: THREE.Vector3;
  public group: THREE.Group;
  public pillars: RelayPillar[] = [];
  public isActivated = false;

  private gatewayRing: THREE.Mesh;
  private energyBeam: THREE.Mesh | null = null;
  private animClock = 0;
  private pillarMaterialDormant: THREE.MeshStandardMaterial;
  private pillarMaterialActive: THREE.MeshStandardMaterial;

  constructor(config: HarmonicRelayConfig) {
    this.id = config.id;
    this.name = config.name;
    this.position = config.position.clone();

    this.group = new THREE.Group();
    this.group.position.copy(this.position);

    // Materials
    const structureMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.9,
      roughness: 0.2,
      flatShading: true,
    });

    this.pillarMaterialDormant = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xb45309,
      emissiveIntensity: 0.4,
      metalness: 0.6,
      roughness: 0.3,
    });

    this.pillarMaterialActive = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 1.0,
      metalness: 0.4,
      roughness: 0.2,
    });

    // 1. Massive Central Gateway Ring
    const ringGeo = new THREE.TorusGeometry(180, 16, 12, 48);
    this.gatewayRing = new THREE.Mesh(ringGeo, structureMat);
    this.group.add(this.gatewayRing);

    // Inner Gateway Iris Shards
    const irisMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true });
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(140, 4, 8, 32), irisMat);
    this.gatewayRing.add(innerRing);

    // 2. Three Harmonic Tuning Pillars
    const pillarDist = 380;
    for (let i = 0; i < 3; i++) {
      const angle = (i * 2 * Math.PI) / 3;
      const pX = Math.cos(angle) * pillarDist;
      const pZ = Math.sin(angle) * pillarDist;
      const pPos = new THREE.Vector3(pX, 0, pZ);

      // Spire geometry
      const spireGeo = new THREE.CylinderGeometry(8, 22, 140, 6);
      const spireMesh = new THREE.Mesh(spireGeo, this.pillarMaterialDormant);
      spireMesh.position.copy(pPos);
      this.group.add(spireMesh);

      const light = new THREE.PointLight(0xf59e0b, 3.0, 150);
      light.position.set(pX, 80, pZ);
      this.group.add(light);

      this.pillars.push({
        index: i,
        position: this.position.clone().add(pPos),
        mesh: spireMesh,
        light,
        isAligned: false,
      });
    }
  }

  public update(dt: number): void {
    this.animClock += dt;

    if (this.isActivated) {
      // Rapid spin when fully activated
      this.gatewayRing.rotation.z += dt * 0.8;
      if (this.energyBeam) {
        this.energyBeam.scale.x = 1.0 + Math.sin(this.animClock * 8) * 0.15;
        this.energyBeam.scale.z = 1.0 + Math.cos(this.animClock * 8) * 0.15;
      }
    } else {
      // Gentle mystical rotation
      this.gatewayRing.rotation.z += dt * 0.05;
    }

    // Pulse lights on aligned pillars
    for (const p of this.pillars) {
      if (p.isAligned) {
        p.light.intensity = 4.0 + Math.sin(this.animClock * 3 + p.index) * 2.0;
      }
    }
  }

  public get alignedCount(): number {
    return this.pillars.filter((p) => p.isAligned).length;
  }

  public getNearbyUnalignedPillar(shipPos: THREE.Vector3, threshold = 220): RelayPillar | null {
    for (const pillar of this.pillars) {
      if (!pillar.isAligned && pillar.position.distanceTo(shipPos) <= threshold) {
        return pillar;
      }
    }
    return null;
  }

  public setPillarAlignedSilently(index: number): void {
    const pillar = this.pillars[index];
    if (!pillar || pillar.isAligned) return;
    pillar.isAligned = true;
    pillar.mesh.material = this.pillarMaterialActive;
    pillar.light.color.setHex(0x38bdf8);
    pillar.light.intensity = 5.0;
  }

  public setActivatedSilently(): void {
    if (this.isActivated) return;
    this.activateRelay();
  }

  public restoreFromState(state: { alignedPillars?: number[]; activated?: boolean }): void {
    if (!state) return;
    if (Array.isArray(state.alignedPillars)) {
      for (const idx of state.alignedPillars) {
        this.setPillarAlignedSilently(idx);
      }
    }
    if (state.activated || this.pillars.every((p) => p.isAligned)) {
      this.setActivatedSilently();
    }
  }

  public alignPillar(index: number, storyDirector?: StoryDirector): boolean {
    const pillar = this.pillars[index];
    if (!pillar || pillar.isAligned || this.isActivated) return false;

    pillar.isAligned = true;
    pillar.mesh.material = this.pillarMaterialActive;
    pillar.light.color.setHex(0x38bdf8);
    pillar.light.intensity = 5.0;

    if (storyDirector) {
      storyDirector.emit({
        type: 'RELAY_PILLAR_ALIGNED',
        payload: { pillarIndex: index },
        timestamp: Date.now(),
      });
    }

    const allAligned = this.pillars.every((p) => p.isAligned);
    if (allAligned && !this.isActivated) {
      this.activateRelay(storyDirector);
    }

    return true;
  }

  public activateRelay(storyDirector?: StoryDirector): void {
    if (this.isActivated) return;
    this.isActivated = true;

    // Ensure all pillars are visually aligned when activated
    for (let i = 0; i < this.pillars.length; i++) {
      this.setPillarAlignedSilently(i);
    }

    // Create spectacular energy beam firing toward deep space
    if (!this.energyBeam) {
      const beamGeo = new THREE.CylinderGeometry(18, 26, 3200, 16, 1, true);
      const beamMat = new THREE.MeshBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
      });
      this.energyBeam = new THREE.Mesh(beamGeo, beamMat);
      this.energyBeam.rotation.x = Math.PI / 2;
      this.energyBeam.position.set(0, 0, 1600);
      this.group.add(this.energyBeam);

      const beamLight = new THREE.PointLight(0x38bdf8, 8.0, 600);
      this.group.add(beamLight);
    }

    if (storyDirector) {
      storyDirector.emit({
        type: 'RELAY_ACTIVATED',
        payload: { systemSeed: this.id },
        timestamp: Date.now(),
      });
    }
  }

  public onRebase(offset: THREE.Vector3): void {
    this.position.add(offset);
    this.group.position.add(offset);
    for (const pillar of this.pillars) {
      pillar.position.add(offset);
    }
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
