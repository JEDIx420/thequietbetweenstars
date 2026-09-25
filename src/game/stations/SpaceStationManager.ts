import * as THREE from 'three';
import type { DockableEntity, DockingStatus } from '../docking/DockableEntity';
import type { StationArchetype, StationServiceType } from '../population/PopulationTypes';

export type StationService =
  | StationServiceType
  | 'signal_lab'
  | 'concourse'
  | 'archive'
  | 'dockyard'
  | 'supply';

export interface StationConfig {
  id: string;
  name: string;
  faction: string;
  position: THREE.Vector3;
  archetype?: StationArchetype;
  services: StationService[];
  captureRadius?: number;
  approachDistance?: number;
  greeting?: string;
  lore?: string;
}

export class SpaceStation implements DockableEntity {
  public readonly entityKind: 'STATION' = 'STATION';
  public id: string;
  public name: string;
  public faction: string;
  public archetype: StationArchetype;
  public position: THREE.Vector3;
  public dockingPortOffset: THREE.Vector3;
  public captureRadius = 120;
  public approachDistance = 450;
  public group: THREE.Group;
  public services: StationService[];
  public greeting?: string;
  public lore?: string;

  private dockingStatus: DockingStatus = 'IDLE';
  private rotatingComponents: THREE.Object3D[] = [];
  private bayLights: THREE.PointLight[] = [];
  private lightClock = 0;

  constructor(config: StationConfig) {
    this.id = config.id;
    this.name = config.name;
    this.faction = config.faction;
    this.archetype = config.archetype || 'TRADE_HUB';
    this.position = config.position.clone();
    this.services = [...config.services];
    this.captureRadius = config.captureRadius || 120;
    this.approachDistance = config.approachDistance || 450;
    this.greeting = config.greeting;
    this.lore = config.lore;
    this.dockingPortOffset = new THREE.Vector3(0, 0, 75);

    this.group = new THREE.Group();
    this.group.position.copy(this.position);

    this.buildGeometryForArchetype(this.archetype);
  }

  private buildGeometryForArchetype(archetype: StationArchetype): void {
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.8,
      roughness: 0.3,
      flatShading: true,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.35,
    });
    const solarMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a8a,
      metalness: 0.9,
      roughness: 0.2,
    });
    const cyanGlowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const amberGlowMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const emeraldGlowMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });

    switch (archetype) {
      case 'MINING_REFINERY': {
        // Heavy industrial frame, ore silos, exhaust furnace
        const frameGeo = new THREE.BoxGeometry(45, 120, 45);
        const frame = new THREE.Mesh(frameGeo, darkMat);
        this.group.add(frame);

        // Cylindrical ore silos
        for (let i = 0; i < 4; i++) {
          const siloGeo = new THREE.CylinderGeometry(10, 10, 80, 12);
          const silo = new THREE.Mesh(siloGeo, hullMat);
          const ang = (i / 4) * Math.PI * 2;
          silo.position.set(Math.cos(ang) * 35, 0, Math.sin(ang) * 35);
          this.group.add(silo);
        }

        // Slag processor furnace ring
        const furnaceGeo = new THREE.TorusGeometry(38, 5, 8, 24);
        const furnace = new THREE.Mesh(furnaceGeo, amberGlowMat);
        furnace.rotation.x = Math.PI / 2;
        furnace.position.set(0, -35, 0);
        this.group.add(furnace);
        this.rotatingComponents.push(furnace);

        this.addDockingBay(hullMat, amberGlowMat, 0xf59e0b);
        break;
      }

      case 'RESEARCH_ARRAY': {
        // Central hub with asymmetric sensor needles & solar reflectors
        const hubGeo = new THREE.DodecahedronGeometry(22, 1);
        const hub = new THREE.Mesh(hubGeo, hullMat);
        this.group.add(hub);

        // Long sensor boom needle
        const boomGeo = new THREE.CylinderGeometry(1.5, 3, 140, 8);
        const boom = new THREE.Mesh(boomGeo, darkMat);
        boom.position.set(0, 70, 0);
        this.group.add(boom);

        // Rotating telescope array
        const arrayGroup = new THREE.Group();
        for (let i = 0; i < 3; i++) {
          const dishGeo = new THREE.CylinderGeometry(12, 1, 4, 16, 1, true);
          const dish = new THREE.Mesh(dishGeo, solarMat);
          dish.rotation.x = Math.PI / 2;
          const a = (i / 3) * Math.PI * 2;
          dish.position.set(Math.cos(a) * 45, Math.sin(a) * 45, -20);
          arrayGroup.add(dish);
        }
        this.group.add(arrayGroup);
        this.rotatingComponents.push(arrayGroup);

        this.addDockingBay(hullMat, cyanGlowMat, 0x38bdf8);
        break;
      }

      case 'SHIPYARD': {
        // Massive rectangular drydock gantry scaffolding
        const gantryGroup = new THREE.Group();
        const beamGeo = new THREE.BoxGeometry(110, 10, 14);
        const beamTop = new THREE.Mesh(beamGeo, darkMat);
        beamTop.position.set(0, 50, 0);
        const beamBottom = new THREE.Mesh(beamGeo, darkMat);
        beamBottom.position.set(0, -50, 0);
        gantryGroup.add(beamTop);
        gantryGroup.add(beamBottom);

        const uprightGeo = new THREE.BoxGeometry(10, 110, 14);
        const uprightLeft = new THREE.Mesh(uprightGeo, darkMat);
        uprightLeft.position.set(-50, 0, 0);
        const uprightRight = new THREE.Mesh(uprightGeo, darkMat);
        uprightRight.position.set(50, 0, 0);
        gantryGroup.add(uprightLeft);
        gantryGroup.add(uprightRight);

        // Drydock clamps
        for (let i = -1; i <= 1; i += 2) {
          const clampGeo = new THREE.BoxGeometry(12, 28, 60);
          const clamp = new THREE.Mesh(clampGeo, hullMat);
          clamp.position.set(i * 35, 0, 10);
          gantryGroup.add(clamp);
        }
        this.group.add(gantryGroup);

        this.addDockingBay(hullMat, amberGlowMat, 0xf59e0b);
        break;
      }

      case 'ORBITAL_HABITAT': {
        // Central hub with twin counter-rotating habitat cylinders and green bio-domes
        const coreGeo = new THREE.CylinderGeometry(12, 12, 100, 16);
        const core = new THREE.Mesh(coreGeo, darkMat);
        this.group.add(core);

        const cyl1 = new THREE.Mesh(new THREE.CylinderGeometry(36, 36, 32, 18, 1, true), hullMat);
        cyl1.position.set(0, 24, 0);
        const cyl2 = new THREE.Mesh(new THREE.CylinderGeometry(36, 36, 32, 18, 1, true), hullMat);
        cyl2.position.set(0, -24, 0);
        this.group.add(cyl1);
        this.group.add(cyl2);
        this.rotatingComponents.push(cyl1);

        // Green glass biosphere pods
        const domeMat = new THREE.MeshStandardMaterial({
          color: 0x10b981,
          transparent: true,
          opacity: 0.7,
          roughness: 0.2,
        });
        const domeGeo = new THREE.SphereGeometry(14, 12, 8);
        const dome = new THREE.Mesh(domeGeo, domeMat);
        dome.position.set(0, 52, 0);
        this.group.add(dome);

        this.addDockingBay(hullMat, emeraldGlowMat, 0x10b981);
        break;
      }

      case 'ALIEN_BIOSTATION': {
        // Organic crystalline spire with undulating bioluminescent vanes
        const spireGeo = new THREE.ConeGeometry(18, 110, 8);
        const spireMat = new THREE.MeshStandardMaterial({
          color: 0x064e3b,
          roughness: 0.4,
          metalness: 0.6,
        });
        const spire = new THREE.Mesh(spireGeo, spireMat);
        spire.rotation.x = Math.PI / 2;
        this.group.add(spire);

        // Organic bio petals
        const petalGroup = new THREE.Group();
        for (let i = 0; i < 5; i++) {
          const petalGeo = new THREE.TorusGeometry(35, 3.5, 6, 16, Math.PI);
          const petal = new THREE.Mesh(petalGeo, emeraldGlowMat);
          petal.rotation.z = (i / 5) * Math.PI * 2;
          petal.position.set(0, 0, -15);
          petalGroup.add(petal);
        }
        this.group.add(petalGroup);
        this.rotatingComponents.push(petalGroup);

        this.addDockingBay(hullMat, emeraldGlowMat, 0x10b981);
        break;
      }

      case 'TRADE_HUB':
      default: {
        // Default grand toroidal ring & central core
        const coreGeo = new THREE.CylinderGeometry(14, 18, 90, 16);
        const core = new THREE.Mesh(coreGeo, hullMat);
        this.group.add(core);

        const ringGeo = new THREE.TorusGeometry(85, 9, 8, 32);
        const ringMesh = new THREE.Mesh(ringGeo, hullMat);
        ringMesh.rotation.x = Math.PI / 2;
        this.group.add(ringMesh);
        this.rotatingComponents.push(ringMesh);

        // Spoke struts connecting core to ring
        for (let i = 0; i < 4; i++) {
          const spokeGeo = new THREE.CylinderGeometry(2, 2, 85, 6);
          const spoke = new THREE.Mesh(spokeGeo, hullMat);
          spoke.rotation.z = Math.PI / 2;
          spoke.rotation.y = (i * Math.PI) / 2;
          ringMesh.add(spoke);
        }

        // Solar Arrays
        const solarWingGeo = new THREE.BoxGeometry(110, 1.5, 20);
        const solarWing = new THREE.Mesh(solarWingGeo, solarMat);
        solarWing.position.set(0, 42, 0);
        this.group.add(solarWing);

        this.addDockingBay(hullMat, cyanGlowMat, 0x38bdf8);
        break;
      }
    }
  }

  private addDockingBay(hullMat: THREE.Material, glowMat: THREE.Material, lightColorHex: number): void {
    // Docking Bay Module Cylinder
    const bayGeo = new THREE.CylinderGeometry(22, 26, 35, 12, 1, true);
    const bayMesh = new THREE.Mesh(bayGeo, hullMat);
    bayMesh.rotation.x = Math.PI / 2;
    bayMesh.position.copy(this.dockingPortOffset);
    this.group.add(bayMesh);

    // Docking Guide Lights
    for (let l = 0; l < 4; l++) {
      const light = new THREE.PointLight(lightColorHex, 2.5, 45);
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
    for (let i = 0; i < this.rotatingComponents.length; i++) {
      const comp = this.rotatingComponents[i];
      comp.rotation.z += dt * (0.06 + i * 0.02);
    }
    this.group.rotation.y += dt * 0.015;

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
