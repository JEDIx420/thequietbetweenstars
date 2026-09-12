import * as THREE from 'three';

export interface SectorCoord {
  x: number;
  y: number;
  z: number;
}

/**
 * WorldPosition
 * Maintains high-precision global coordinates:
 * - sector: integer grid coordinates (e.g. sectorSize = 4000 units)
 * - localOffset: continuous position inside that sector [-sectorSize/2, sectorSize/2]
 */
export class WorldPosition {
  public static readonly SECTOR_SIZE = 4000;

  public sector: SectorCoord;
  public localOffset: THREE.Vector3;

  constructor(sector: SectorCoord = { x: 0, y: 0, z: 0 }, localOffset: THREE.Vector3 = new THREE.Vector3(0, 0, 0)) {
    this.sector = { ...sector };
    this.localOffset = localOffset.clone();
    this.normalize();
  }

  /**
   * Normalizes the local offset so that it stays within [-SECTOR_SIZE/2, SECTOR_SIZE/2].
   * Any overflow adjusts the sector coordinate.
   */
  public normalize(): void {
    const half = WorldPosition.SECTOR_SIZE / 2;

    while (this.localOffset.x > half) {
      this.localOffset.x -= WorldPosition.SECTOR_SIZE;
      this.sector.x += 1;
    }
    while (this.localOffset.x < -half) {
      this.localOffset.x += WorldPosition.SECTOR_SIZE;
      this.sector.x -= 1;
    }

    while (this.localOffset.y > half) {
      this.localOffset.y -= WorldPosition.SECTOR_SIZE;
      this.sector.y += 1;
    }
    while (this.localOffset.y < -half) {
      this.localOffset.y += WorldPosition.SECTOR_SIZE;
      this.sector.y -= 1;
    }

    while (this.localOffset.z > half) {
      this.localOffset.z -= WorldPosition.SECTOR_SIZE;
      this.sector.z += 1;
    }
    while (this.localOffset.z < -half) {
      this.localOffset.z += WorldPosition.SECTOR_SIZE;
      this.sector.z -= 1;
    }
  }

  public add(delta: THREE.Vector3): void {
    this.localOffset.add(delta);
    this.normalize();
  }

  public clone(): WorldPosition {
    return new WorldPosition(this.sector, this.localOffset);
  }

  /**
   * Calculates the exact vector from this world position to another world position
   */
  public vectorTo(other: WorldPosition): THREE.Vector3 {
    const dx = (other.sector.x - this.sector.x) * WorldPosition.SECTOR_SIZE + (other.localOffset.x - this.localOffset.x);
    const dy = (other.sector.y - this.sector.y) * WorldPosition.SECTOR_SIZE + (other.localOffset.y - this.localOffset.y);
    const dz = (other.sector.z - this.sector.z) * WorldPosition.SECTOR_SIZE + (other.localOffset.z - this.localOffset.z);
    return new THREE.Vector3(dx, dy, dz);
  }

  /**
   * Distance in universe units
   */
  public distanceTo(other: WorldPosition): number {
    return this.vectorTo(other).length();
  }
}
