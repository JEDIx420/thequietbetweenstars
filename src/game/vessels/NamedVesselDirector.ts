import * as THREE from 'three';
import type { DockableEntity, DockingStatus } from '../docking/DockableEntity';
import type { VesselArchetype, VesselSizeClass } from '../population/PopulationTypes';

export type VesselSilhouette =
  | VesselArchetype
  | 'avian_solar_sail'
  | 'organic_bio_hull'
  | 'counter_rotating_rings';

export interface NamedVesselConfig {
  id: string;
  name: string;
  captainName: string;
  species: string;
  silhouetteType?: VesselSilhouette;
  archetype?: VesselArchetype;
  sizeClass?: VesselSizeClass;
  position: THREE.Vector3;
  patrolRadius?: number;
  hailRadius?: number;
  isDockable?: boolean;
  captureRadius?: number;
  approachDistance?: number;
  dialogueTopic?: string;
  greeting?: string;
  lore?: string;
}

export class NamedVessel implements DockableEntity {
  public id: string;
  public name: string;
  public captainName: string;
  public species: string;
  public silhouetteType: VesselSilhouette;
  public archetype: VesselArchetype;
  public sizeClass: VesselSizeClass;
  public position: THREE.Vector3;
  public group: THREE.Group;
  public hailRadius = 900;
  public isHailed = false;
  public isDockable = false;
  public captureRadius = 100;
  public approachDistance = 350;
  public dockingPortOffset: THREE.Vector3;
  public dialogueTopic?: string;
  public greeting?: string;
  public lore?: string;

  private dockingStatus: DockingStatus = 'IDLE';
  private rotatingParts: THREE.Object3D[] = [];
  private thrusterLight: THREE.PointLight | null = null;
  private patrolClock = 0;
  private patrolRadius = 35;
  private basePosition: THREE.Vector3;

  constructor(config: NamedVesselConfig) {
    this.id = config.id;
    this.name = config.name;
    this.captainName = config.captainName;
    this.species = config.species;
    this.sizeClass = config.sizeClass || 'CRUISER';
    this.hailRadius = config.hailRadius || 900;
    this.patrolRadius = config.patrolRadius || 35;
    this.dialogueTopic = config.dialogueTopic;
    this.greeting = config.greeting;
    this.lore = config.lore;

    // Resolve archetype & silhouette
    if (config.archetype) {
      this.archetype = config.archetype;
      this.silhouetteType = config.archetype;
    } else if (config.silhouetteType === 'avian_solar_sail') {
      this.archetype = 'SOLAR_SAIL';
      this.silhouetteType = 'avian_solar_sail';
    } else if (config.silhouetteType === 'organic_bio_hull') {
      this.archetype = 'ORGANIC_BIO';
      this.silhouetteType = 'organic_bio_hull';
    } else if (config.silhouetteType === 'counter_rotating_rings') {
      this.archetype = 'ROTATING_RING';
      this.silhouetteType = 'counter_rotating_rings';
    } else {
      this.archetype = 'SOLAR_SAIL';
      this.silhouetteType = 'avian_solar_sail';
    }

    this.isDockable = config.isDockable ?? (this.sizeClass === 'CARRIER' || this.sizeClass === 'CAPITAL');
    this.captureRadius = config.captureRadius || (this.isDockable ? 100 : 0);
    this.approachDistance = config.approachDistance || 350;
    this.dockingPortOffset = new THREE.Vector3(0, 0, 40);

    this.position = config.position.clone();
    this.basePosition = config.position.clone();

    this.group = new THREE.Group();
    this.group.position.copy(this.position);

    this.buildGeometryForArchetype(this.archetype);
  }

  private buildGeometryForArchetype(archetype: VesselArchetype): void {
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.25,
      metalness: 0.85,
    });
    const industrialMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.4,
      metalness: 0.8,
    });
    const tealSailMat = new THREE.MeshStandardMaterial({
      color: 0x2dd4bf,
      emissive: 0x0f766e,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const amberGlowMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const emeraldMat = new THREE.MeshStandardMaterial({
      color: 0x059669,
      emissive: 0x047857,
      emissiveIntensity: 0.4,
      roughness: 0.3,
    });

    switch (archetype) {
      case 'INDUSTRIAL_HAULER': {
        // Spine with multi-pod cargo modules
        const spineGeo = new THREE.BoxGeometry(4, 4, 48);
        const spine = new THREE.Mesh(spineGeo, industrialMat);
        this.group.add(spine);

        // Bridge cabin
        const bridgeGeo = new THREE.BoxGeometry(8, 6, 10);
        const bridge = new THREE.Mesh(bridgeGeo, hullMat);
        bridge.position.set(0, 3, -20);
        this.group.add(bridge);

        // Cargo containers
        for (let i = -1; i <= 1; i++) {
          const podGeo = new THREE.BoxGeometry(12, 10, 10);
          const pod = new THREE.Mesh(podGeo, industrialMat);
          pod.position.set(0, 0, i * 14);
          this.group.add(pod);
        }

        this.thrusterLight = new THREE.PointLight(0xf59e0b, 3.0, 50);
        this.thrusterLight.position.set(0, 0, 26);
        this.group.add(this.thrusterLight);
        break;
      }

      case 'ROTATING_RING': {
        // Central hub spindle with gyroscopic rotating ring
        const hubGeo = new THREE.CylinderGeometry(3, 4, 36, 12);
        hubGeo.rotateX(Math.PI / 2);
        const hub = new THREE.Mesh(hubGeo, hullMat);
        this.group.add(hub);

        const ringGeo = new THREE.TorusGeometry(14, 0.8, 6, 24);
        const ring = new THREE.Mesh(ringGeo, tealSailMat);
        ring.rotation.x = Math.PI / 2;
        this.group.add(ring);
        this.rotatingParts.push(ring);

        this.thrusterLight = new THREE.PointLight(0x38bdf8, 3.2, 55);
        this.thrusterLight.position.set(0, 0, 20);
        this.group.add(this.thrusterLight);
        break;
      }

      case 'ORGANIC_BIO': {
        // Living alien pod
        const bodyGeo = new THREE.SphereGeometry(6, 12, 12);
        bodyGeo.scale(0.8, 0.6, 2.8);
        const body = new THREE.Mesh(bodyGeo, emeraldMat);
        this.group.add(body);

        // Sweeping bio fins
        for (let i = -1; i <= 1; i += 2) {
          const finGeo = new THREE.ConeGeometry(1.5, 18, 5);
          finGeo.rotateZ((i * Math.PI) / 3);
          const fin = new THREE.Mesh(finGeo, tealSailMat);
          fin.position.set(i * 6, 0, 2);
          this.group.add(fin);
        }

        this.thrusterLight = new THREE.PointLight(0x10b981, 3.5, 60);
        this.thrusterLight.position.set(0, 0, 18);
        this.group.add(this.thrusterLight);
        break;
      }

      case 'MANTA_WING': {
        // Manta ray delta wing
        const wingShape = new THREE.Shape();
        wingShape.moveTo(0, -18);
        wingShape.lineTo(22, 10);
        wingShape.lineTo(4, 8);
        wingShape.lineTo(0, 14);
        wingShape.lineTo(-4, 8);
        wingShape.lineTo(-22, 10);
        wingShape.closePath();

        const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 1.5, bevelEnabled: false });
        wingGeo.rotateX(Math.PI / 2);
        const wing = new THREE.Mesh(wingGeo, hullMat);
        this.group.add(wing);

        this.thrusterLight = new THREE.PointLight(0x38bdf8, 3.5, 60);
        this.thrusterLight.position.set(0, 0, 14);
        this.group.add(this.thrusterLight);
        break;
      }

      case 'CATHEDRAL_CAPITAL': {
        // Massive monolithic capital superstructure
        const hullGeo = new THREE.BoxGeometry(16, 22, 70);
        const hull = new THREE.Mesh(hullGeo, hullMat);
        this.group.add(hull);

        const towerGeo = new THREE.BoxGeometry(8, 18, 24);
        const tower = new THREE.Mesh(towerGeo, industrialMat);
        tower.position.set(0, 16, -10);
        this.group.add(tower);

        // Internal hollow docking bay for player ships
        const bayGeo = new THREE.CylinderGeometry(8, 9, 18, 8, 1, true);
        const bay = new THREE.Mesh(bayGeo, amberGlowMat);
        bay.rotation.x = Math.PI / 2;
        bay.position.copy(this.dockingPortOffset);
        this.group.add(bay);

        this.thrusterLight = new THREE.PointLight(0x38bdf8, 4.5, 80);
        this.thrusterLight.position.set(0, 0, 38);
        this.group.add(this.thrusterLight);
        break;
      }

      case 'SOLAR_SAIL':
      default: {
        // Avian solar sail with sweeping sails
        const fuseGeo = new THREE.ConeGeometry(5, 24, 6);
        const fuselage = new THREE.Mesh(fuseGeo, hullMat);
        fuselage.rotation.x = Math.PI / 2;
        this.group.add(fuselage);

        const ringGeo = new THREE.TorusGeometry(8, 0.4, 6, 20);
        const coreRing = new THREE.Mesh(ringGeo, tealSailMat);
        coreRing.rotation.y = Math.PI / 2;
        this.group.add(coreRing);
        this.rotatingParts.push(coreRing);

        const sailGroup = new THREE.Group();
        const sailGeo = new THREE.CylinderGeometry(0.1, 18, 38, 5, 1, true, 0, Math.PI);
        const sailMesh = new THREE.Mesh(sailGeo, tealSailMat);
        sailMesh.rotation.z = Math.PI / 3;
        sailMesh.position.set(6, 12, -4);
        sailGroup.add(sailMesh);

        // Left Wing Stabilizer
        const wingGeo = new THREE.BufferGeometry();
        const wingVertices = new Float32Array([
          0, 0, 0,
          -18, 4, -12,
          -4, -2, -18,
        ]);
        wingGeo.setAttribute('position', new THREE.BufferAttribute(wingVertices, 3));
        wingGeo.computeVertexNormals();
        const wingMesh = new THREE.Mesh(wingGeo, tealSailMat);
        sailGroup.add(wingMesh);

        this.group.add(sailGroup);
        this.rotatingParts.push(sailGroup);

        this.thrusterLight = new THREE.PointLight(0x2dd4bf, 3.5, 60);
        this.thrusterLight.position.set(0, 0, -14);
        this.group.add(this.thrusterLight);
        break;
      }
    }
  }

  public update(dt: number): void {
    this.patrolClock += dt;

    for (const part of this.rotatingParts) {
      part.rotation.x += dt * 0.4;
      part.rotation.y = Math.sin(this.patrolClock * 0.4) * 0.12;
    }

    // Slow organic patrol drifting
    this.position.x = this.basePosition.x + Math.sin(this.patrolClock * 0.18) * this.patrolRadius;
    this.position.y = this.basePosition.y + Math.cos(this.patrolClock * 0.25) * (this.patrolRadius * 0.35);
    this.position.z = this.basePosition.z + Math.cos(this.patrolClock * 0.14) * (this.patrolRadius * 0.5);
    this.group.position.copy(this.position);

    if (this.thrusterLight) {
      this.thrusterLight.intensity = 2.5 + Math.sin(this.patrolClock * 3.0) * 1.0;
    }
  }

  public canHail(shipPosition: THREE.Vector3): boolean {
    return this.position.distanceTo(shipPosition) <= this.hailRadius;
  }

  // DockableEntity interface methods (if isDockable)
  public canDock(shipPosition: THREE.Vector3): { allowed: boolean; reason?: string } {
    if (!this.isDockable) {
      return { allowed: false, reason: `${this.name} does not have an external docking bay.` };
    }
    const worldDockPort = this.position.clone().add(this.dockingPortOffset);
    const dist = shipPosition.distanceTo(worldDockPort);
    if (dist > this.captureRadius) {
      return {
        allowed: false,
        reason: `Too far from docking clamp (${Math.round(dist)}u). Approach within ${this.captureRadius}u.`,
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
    this.basePosition.add(offset);
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
