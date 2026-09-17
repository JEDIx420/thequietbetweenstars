import * as THREE from 'three';
import { SeededRandom } from '../universe/SeededRandom';
import type { LandingRegionProfile } from '../planets/LandingRegionProfile';

export interface CreditPickup {
  id: string;
  amount: number;
  basePosition: THREE.Vector3;
  currentPosition: THREE.Vector3;
  isCollected: boolean;
  collectingAnimation: number; // 0 (idle) to 1 (fully absorbed)
  group: THREE.Group;
  phase: number;
  tier: 'common' | 'uncommon' | 'rare';
}

export class SurveyCreditPickupManager {
  public pickupGroup = new THREE.Group();
  private region: LandingRegionProfile;
  private planetId: string;
  private planetSeed: number;

  private cellSize = 120;
  private activationRadius = 2; // Active cells radius
  private activeCells: Map<string, CreditPickup[]> = new Map();
  private collectedIds: Set<string>;

  // Reusable geometries & materials for peak performance
  private sharedRingGeo = new THREE.TorusGeometry(0.8, 0.05, 6, 24);
  private sharedCoreCommonGeo = new THREE.OctahedronGeometry(0.45, 0);
  private sharedCoreRareGeo = new THREE.IcosahedronGeometry(0.55, 0);

  private commonRingMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.85,
    wireframe: true,
  });

  private commonCoreMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.8,
    roughness: 0.2,
    metalness: 0.8,
  });

  private rareRingMat = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
    transparent: true,
    opacity: 0.9,
    wireframe: true,
  });

  private rareCoreMat = new THREE.MeshStandardMaterial({
    color: 0xeab308,
    emissive: 0xfde047,
    emissiveIntensity: 0.95,
    roughness: 0.2,
    metalness: 0.9,
  });

  private clock = 0;
  public pickupRadius = 6.5; // Auto-collect fly-through radius
  public magnetismRadius = 16.0; // Gentle acceleration toward craft

  constructor(
    region: LandingRegionProfile,
    planetId: string,
    planetSeed: number,
    initialCollectedIds: string[] = []
  ) {
    this.region = region;
    this.planetId = planetId;
    this.planetSeed = planetSeed;
    this.collectedIds = new Set(initialCollectedIds);
  }

  public getCollectedIds(): string[] {
    return Array.from(this.collectedIds);
  }

  private lastCellX: number | null = null;
  private lastCellZ: number | null = null;

  public update(
    craftPos: THREE.Vector3,
    dt: number,
    getHeightAt: (x: number, z: number) => number
  ): Array<{ id: string; amount: number; tier: string }> {
    this.clock += dt;
    const collectedEvents: Array<{ id: string; amount: number; tier: string }> = [];

    const centerCellX = Math.floor(craftPos.x / this.cellSize);
    const centerCellZ = Math.floor(craftPos.z / this.cellSize);

    // 1. Only re-evaluate cell streaming when craft crosses a cell boundary
    if (centerCellX !== this.lastCellX || centerCellZ !== this.lastCellZ) {
      this.lastCellX = centerCellX;
      this.lastCellZ = centerCellZ;
      const neededKeys = new Set<string>();

      for (let dx = -this.activationRadius; dx <= this.activationRadius; dx++) {
        for (let dz = -this.activationRadius; dz <= this.activationRadius; dz++) {
          const cx = centerCellX + dx;
          const cz = centerCellZ + dz;
          const key = `${cx},${cz}`;
          neededKeys.add(key);

          if (!this.activeCells.has(key)) {
            const pickups = this.spawnCell(cx, cz, getHeightAt);
            this.activeCells.set(key, pickups);
            for (const p of pickups) {
              this.pickupGroup.add(p.group);
            }
          }
        }
      }

      // Unload distant cells
      for (const [key, pickups] of this.activeCells.entries()) {
        if (!neededKeys.has(key)) {
          for (const p of pickups) {
            this.pickupGroup.remove(p.group);
          }
          this.activeCells.delete(key);
        }
      }
    }

    // 2. Update active pickups (magnetism, auto-collection, animations)
    const pickupRadius = this.pickupRadius;
    const magnetismRadius = this.magnetismRadius;

    for (const pickups of this.activeCells.values()) {
      for (let i = pickups.length - 1; i >= 0; i--) {
        const p = pickups[i];

        if (p.isCollected) {
          // Implosion / absorption animation toward craft
          p.collectingAnimation += dt * 4.0;
          p.group.position.lerp(craftPos, dt * 8.0);
          const scale = Math.max(0.01, 1.0 - p.collectingAnimation);
          p.group.scale.setScalar(scale);

          if (p.collectingAnimation >= 1.0) {
            this.pickupGroup.remove(p.group);
            pickups.splice(i, 1);
          }
          continue;
        }

        // Bobbing & Rotation
        const bobOffset = Math.sin(this.clock * 2.5 + p.phase) * 0.45;
        p.group.position.x = p.currentPosition.x;
        p.group.position.y = p.currentPosition.y + bobOffset;
        p.group.position.z = p.currentPosition.z;

        p.group.rotation.y += dt * 1.8;
        p.group.rotation.z = Math.sin(this.clock + p.phase) * 0.25;

        // Proximity check to ship
        const dist = p.group.position.distanceTo(craftPos);

        // Magnetism: gently glide toward craft
        if (dist < magnetismRadius) {
          const pullSpeed = Math.min(30.0, (magnetismRadius - dist) * 2.8);
          p.currentPosition.lerp(craftPos, (pullSpeed * dt) / Math.max(1.0, dist));
        }

        // Fly-Through Auto-Collect
        if (dist <= pickupRadius) {
          p.isCollected = true;
          this.collectedIds.add(p.id);
          collectedEvents.push({
            id: p.id,
            amount: p.amount,
            tier: p.tier,
          });
        }
      }
    }

    return collectedEvents;
  }

  public getNearestPickups(craftPos: THREE.Vector3, maxCount = 4): Array<{ position: THREE.Vector3; amount: number }> {
    const list: Array<{ position: THREE.Vector3; amount: number; dist: number }> = [];

    for (const pickups of this.activeCells.values()) {
      for (const p of pickups) {
        if (p.isCollected) continue;
        const dist = craftPos.distanceTo(p.group.position);
        if (dist <= 180) {
          list.push({ position: p.group.position, amount: p.amount, dist });
        }
      }
    }

    list.sort((a, b) => a.dist - b.dist);
    return list.slice(0, maxCount).map(item => ({ position: item.position, amount: item.amount }));
  }

  private spawnCell(
    cx: number,
    cz: number,
    getHeightAt: (x: number, z: number) => number
  ): CreditPickup[] {
    const cellHash = SeededRandom.hashCoords(this.planetSeed + this.region.regionSeed, cx, 0, cz);
    const rng = new SeededRandom(cellHash);

    // Probability of credit cluster in this cell (approx 55% of cells have credits)
    const hasCluster = rng.next() < 0.55;
    if (!hasCluster) return [];

    const count = rng.rangeInt(2, 5);
    const pickups: CreditPickup[] = [];
    const cellOriginX = cx * this.cellSize;
    const cellOriginZ = cz * this.cellSize;

    for (let i = 0; i < count; i++) {
      const id = `credit:${this.planetId}:${this.region.id}:${cx}:${cz}:${i}`;
      if (this.collectedIds.has(id)) continue;

      // Position in cell
      const angle = (i / count) * Math.PI * 2 + rng.range(-0.4, 0.4);
      const radius = rng.range(15, this.cellSize * 0.42);
      const px = cellOriginX + (this.cellSize * 0.5) + Math.cos(angle) * radius;
      const pz = cellOriginZ + (this.cellSize * 0.5) + Math.sin(angle) * radius;
      const groundY = getHeightAt(px, pz);

      if (groundY < 2.0) continue; // Skip underwater

      // Altitude: 2.5m to 7.0m above ground
      const hoverAlt = rng.range(2.8, 6.5);
      const py = groundY + hoverAlt;

      // Tier roll
      const roll = rng.next();
      let tier: 'common' | 'uncommon' | 'rare' = 'common';
      let amount = rng.rangeInt(15, 25);

      if (roll > 0.88) {
        tier = 'rare';
        amount = rng.rangeInt(75, 125);
      } else if (roll > 0.65) {
        tier = 'uncommon';
        amount = rng.rangeInt(35, 50);
      }

      const group = new THREE.Group();
      const isRare = tier === 'rare';

      const ringMesh = new THREE.Mesh(this.sharedRingGeo, isRare ? this.rareRingMat : this.commonRingMat);
      ringMesh.rotation.x = Math.PI / 4;
      group.add(ringMesh);

      const coreMesh = new THREE.Mesh(
        isRare ? this.sharedCoreRareGeo : this.sharedCoreCommonGeo,
        isRare ? this.rareCoreMat : this.commonCoreMat
      );
      group.add(coreMesh);

      const pos = new THREE.Vector3(px, py, pz);
      group.position.copy(pos);

      pickups.push({
        id,
        amount,
        basePosition: pos.clone(),
        currentPosition: pos.clone(),
        isCollected: false,
        collectingAnimation: 0,
        group,
        phase: rng.range(0, Math.PI * 2),
        tier,
      });
    }

    return pickups;
  }

  public dispose(): void {
    for (const pickups of this.activeCells.values()) {
      for (const p of pickups) {
        this.pickupGroup.remove(p.group);
      }
    }
    this.activeCells.clear();
    this.pickupGroup.clear();

    this.sharedRingGeo.dispose();
    this.sharedCoreCommonGeo.dispose();
    this.sharedCoreRareGeo.dispose();
    this.commonRingMat.dispose();
    this.commonCoreMat.dispose();
    this.rareRingMat.dispose();
    this.rareCoreMat.dispose();
  }
}
