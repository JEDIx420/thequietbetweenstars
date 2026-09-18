import * as THREE from 'three';

export interface NamedVesselConfig {
  id: string;
  name: string;
  captainName: string;
  species: string;
  silhouetteType: 'avian_solar_sail' | 'organic_bio_hull' | 'counter_rotating_rings';
  position: THREE.Vector3;
}

export class NamedVessel {
  public id: string;
  public name: string;
  public captainName: string;
  public species: string;
  public silhouetteType: 'avian_solar_sail' | 'organic_bio_hull' | 'counter_rotating_rings';
  public position: THREE.Vector3;
  public group: THREE.Group;
  public hailRadius = 900;
  public isHailed = false;

  private sailGroup: THREE.Group;
  private coreRing: THREE.Mesh;
  private thrusterLight: THREE.PointLight;
  private patrolClock = 0;
  private basePosition: THREE.Vector3;

  constructor(config: NamedVesselConfig) {
    this.id = config.id;
    this.name = config.name;
    this.captainName = config.captainName;
    this.species = config.species;
    this.silhouetteType = config.silhouetteType;
    this.position = config.position.clone();
    this.basePosition = config.position.clone();

    this.group = new THREE.Group();
    this.group.position.copy(this.position);

    // Build unique non-human silhouette (Avian Solar Sail)
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.2,
      metalness: 0.9,
    });
    const sailMat = new THREE.MeshStandardMaterial({
      color: 0x2dd4bf,
      emissive: 0x0f766e,
      emissiveIntensity: 0.5,
      wireframe: false,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });

    // 1. Central Core Fuselage
    const fuseGeo = new THREE.ConeGeometry(5, 24, 6);
    const fuselage = new THREE.Mesh(fuseGeo, hullMat);
    fuselage.rotation.x = Math.PI / 2;
    this.group.add(fuselage);

    // 2. Gyroscopic Drive Ring
    const ringGeo = new THREE.TorusGeometry(8, 0.4, 6, 20);
    this.coreRing = new THREE.Mesh(ringGeo, sailMat);
    this.coreRing.rotation.y = Math.PI / 2;
    this.group.add(this.coreRing);

    // 3. Sweeping Asymmetric Solar Sail
    this.sailGroup = new THREE.Group();
    const sailGeo = new THREE.CylinderGeometry(0.1, 18, 38, 5, 1, true, 0, Math.PI);
    const sailMesh = new THREE.Mesh(sailGeo, sailMat);
    sailMesh.rotation.z = Math.PI / 3;
    sailMesh.position.set(6, 12, -4);
    this.sailGroup.add(sailMesh);

    // Left Wing Stabilizer
    const wingGeo = new THREE.BufferGeometry();
    const wingVertices = new Float32Array([
      0, 0, 0,
      -18, 4, -12,
      -4, -2, -18,
    ]);
    wingGeo.setAttribute('position', new THREE.BufferAttribute(wingVertices, 3));
    wingGeo.computeVertexNormals();
    const wingMesh = new THREE.Mesh(wingGeo, sailMat);
    this.sailGroup.add(wingMesh);

    this.group.add(this.sailGroup);

    // 4. Bioluminescent Thruster Plume
    this.thrusterLight = new THREE.PointLight(0x2dd4bf, 3.5, 60);
    this.thrusterLight.position.set(0, 0, -14);
    this.group.add(this.thrusterLight);
  }

  public update(dt: number): void {
    this.patrolClock += dt;

    // Gentle organic breathing / undulating hover
    this.coreRing.rotation.x += dt * 0.8;
    this.sailGroup.rotation.y = Math.sin(this.patrolClock * 0.5) * 0.15;

    // Slight slow patrol loop
    const patrolRadius = 35;
    this.position.x = this.basePosition.x + Math.sin(this.patrolClock * 0.2) * patrolRadius;
    this.position.y = this.basePosition.y + Math.cos(this.patrolClock * 0.3) * 10;
    this.group.position.copy(this.position);

    // Thruster pulse
    this.thrusterLight.intensity = 2.5 + Math.sin(this.patrolClock * 3.0) * 1.0;
  }

  public canHail(shipPosition: THREE.Vector3): boolean {
    return this.position.distanceTo(shipPosition) <= this.hailRadius;
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
