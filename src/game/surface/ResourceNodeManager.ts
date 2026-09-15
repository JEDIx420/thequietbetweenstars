import * as THREE from 'three';
import { SeededRandom } from '../universe/SeededRandom';
import type { LandingRegionProfile } from '../planets/LandingRegionProfile';

export type SampleCategory =
  | 'MINERAL'
  | 'BIOLOGICAL'
  | 'ATMOSPHERIC'
  | 'CRYSTALLINE'
  | 'RESONANCE';

export interface SampleNode {
  id: string;
  category: SampleCategory;
  name: string;
  position: THREE.Vector3;
  mesh: THREE.Object3D;
  collected: boolean;
  creditValue: number;
  description: string;
}

export class ResourceNodeManager {
  public nodes: SampleNode[] = [];
  public resourceGroup = new THREE.Group();
  private region: LandingRegionProfile;

  constructor(region: LandingRegionProfile, centerPos: THREE.Vector3, getHeightAt: (x: number, z: number) => number) {
    this.region = region;
    this.spawnNodes(centerPos, getHeightAt);
  }

  private spawnNodes(centerPos: THREE.Vector3, getHeightAt: (x: number, z: number) => number): void {
    const rng = new SeededRandom(this.region.regionSeed + 8888);
    const count = rng.rangeInt(4, 8);

    const categories: SampleCategory[] = ['MINERAL', 'BIOLOGICAL', 'CRYSTALLINE', 'ATMOSPHERIC'];
    if (this.region.id.includes('resonant') || rng.next() < 0.2) {
      categories.push('RESONANCE');
    }

    for (let i = 0; i < count; i++) {
      const cat = rng.pick(categories);
      const angle = (i / count) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const dist = rng.range(35, 140);
      const x = centerPos.x + Math.cos(angle) * dist;
      const z = centerPos.z + Math.sin(angle) * dist;
      const y = getHeightAt(x, z);

      if (y < 2.0) continue; // Skip in water

      const node = this.createNode(cat, new THREE.Vector3(x, y, z), i);
      this.nodes.push(node);
      this.resourceGroup.add(node.mesh);
    }
  }

  private createNode(
    category: SampleCategory,
    pos: THREE.Vector3,
    idx: number
  ): SampleNode {
    let name = 'Survey Sample';
    let creditValue = 100;
    let color = 0x38bdf8;
    let geom: THREE.BufferGeometry;

    switch (category) {
      case 'CRYSTALLINE':
        name = `${this.region.name} Cryo-Crystal`;
        creditValue = 150;
        color = 0x67e8f9;
        geom = new THREE.OctahedronGeometry(1.2, 0);
        break;
      case 'BIOLOGICAL':
        name = `${this.region.name} Spore Pod`;
        creditValue = 120;
        color = 0x4ade80;
        geom = new THREE.DodecahedronGeometry(1.0, 0);
        break;
      case 'RESONANCE':
        name = 'Resonant Harmonic Mineral';
        creditValue = 350;
        color = 0xc084fc;
        geom = new THREE.IcosahedronGeometry(1.4, 0);
        break;
      case 'ATMOSPHERIC':
        name = 'Condensed Vapor Shard';
        creditValue = 110;
        color = 0xfef08a;
        geom = new THREE.ConeGeometry(0.8, 2.0, 5);
        break;
      case 'MINERAL':
      default:
        name = `${this.region.name} Silicate Nodule`;
        creditValue = 90;
        color = 0xf97316;
        geom = new THREE.BoxGeometry(1.4, 1.2, 1.4);
        break;
    }

    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.4,
      roughness: 0.4,
      metalness: 0.6,
      flatShading: true,
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(pos);
    mesh.position.y += 0.8;

    return {
      id: `sample_${this.region.id}_${idx}`,
      category,
      name,
      position: pos,
      mesh,
      collected: false,
      creditValue,
      description: `Pristine scientific survey material collected from ${this.region.name}.`,
    };
  }

  public collectNode(id: string): SampleNode | null {
    const node = this.nodes.find((n) => n.id === id && !n.collected);
    if (!node) return null;

    node.collected = true;
    this.resourceGroup.remove(node.mesh);
    return node;
  }
}
