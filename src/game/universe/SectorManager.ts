import { SeededRandom } from './SeededRandom';
import { WorldPosition, type SectorCoord } from './WorldPosition';
import { StarSystemGenerator } from '../systems/StarSystemGenerator';
import type { StarSystemDescriptor } from '../systems/PlanetDescriptor';

export interface ActiveSector {
  coord: SectorCoord;
  key: string;
  hasSystem: boolean;
  system?: StarSystemDescriptor;
}

export class SectorManager {
  public readonly universeSeed: string;
  public readonly sectorRadius = 1; // 3x3x3 sector neighbourhood around player
  private activeSectors: Map<string, ActiveSector> = new Map();

  constructor(universeSeed: string = 'QUIET-DEFAULT-001') {
    this.universeSeed = universeSeed;
  }

  public static getSectorKey(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  /**
   * Updates streaming sectors around the current player world position.
   * Loads newly adjacent sectors and unloads distant ones.
   */
  public update(playerWorldPos: WorldPosition): {
    loaded: ActiveSector[];
    unloaded: string[];
  } {
    const current = playerWorldPos.sector;
    const requiredKeys = new Set<string>();
    const loaded: ActiveSector[] = [];
    const unloaded: string[] = [];

    // Check 3x3x3 grid around current player sector
    for (let dx = -this.sectorRadius; dx <= this.sectorRadius; dx++) {
      for (let dy = -this.sectorRadius; dy <= this.sectorRadius; dy++) {
        for (let dz = -this.sectorRadius; dz <= this.sectorRadius; dz++) {
          const sx = current.x + dx;
          const sy = current.y + dy;
          const sz = current.z + dz;
          const key = SectorManager.getSectorKey(sx, sy, sz);
          requiredKeys.add(key);

          if (!this.activeSectors.has(key)) {
            const sectorData = this.generateSector(sx, sy, sz);
            this.activeSectors.set(key, sectorData);
            loaded.push(sectorData);
          }
        }
      }
    }

    // Unload sectors outside the required radius
    for (const [key] of this.activeSectors) {
      if (!requiredKeys.has(key)) {
        this.activeSectors.delete(key);
        unloaded.push(key);
      }
    }

    return { loaded, unloaded };
  }

  /**
   * Deterministically generates content for a sector.
   * Ensures origin sector (0,0,0) ALWAYS contains the primary system (Aurelia).
   */
  public generateSector(sx: number, sy: number, sz: number): ActiveSector {
    const key = SectorManager.getSectorKey(sx, sy, sz);
    const sectorHash = SeededRandom.hashCoords(this.universeSeed, sx, sy, sz);
    const rng = new SeededRandom(sectorHash);

    // Guarantee system at origin sector (0,0,0); elsewhere ~35% chance of star system
    const hasSystem = (sx === 0 && sy === 0 && sz === 0) || rng.chance(0.35);

    let system: StarSystemDescriptor | undefined;
    if (hasSystem) {
      system = StarSystemGenerator.generateSystem(this.universeSeed, sx, sy, sz);
    }

    return {
      coord: { x: sx, y: sy, z: sz },
      key,
      hasSystem,
      system,
    };
  }

  public getActiveSectors(): ActiveSector[] {
    return Array.from(this.activeSectors.values());
  }

  public getSector(key: string): ActiveSector | undefined {
    return this.activeSectors.get(key);
  }

  /**
   * Deterministically queries star systems within a sector radius on demand.
   * Does NOT instantiate Three.js meshes, keeping map rendering lightweight.
   */
  public getSystemsInRadius(
    centerSector: SectorCoord,
    radius: number = 5
  ): Array<{ coord: SectorCoord; system: StarSystemDescriptor; distanceSectors: number }> {
    const results: Array<{ coord: SectorCoord; system: StarSystemDescriptor; distanceSectors: number }> = [];

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist > radius) continue;

          const sx = centerSector.x + dx;
          const sy = centerSector.y + dy;
          const sz = centerSector.z + dz;

          // Check if sector already in active cache
          const key = SectorManager.getSectorKey(sx, sy, sz);
          const active = this.activeSectors.get(key);
          if (active) {
            if (active.hasSystem && active.system) {
              results.push({ coord: active.coord, system: active.system, distanceSectors: dist });
            }
            continue;
          }

          // Deterministic generation on demand without storing in active 3D render cache
          const sectorHash = SeededRandom.hashCoords(this.universeSeed, sx, sy, sz);
          const rng = new SeededRandom(sectorHash);
          const hasSystem = (sx === 0 && sy === 0 && sz === 0) || rng.chance(0.35);

          if (hasSystem) {
            const system = StarSystemGenerator.generateSystem(this.universeSeed, sx, sy, sz);
            results.push({
              coord: { x: sx, y: sy, z: sz },
              system,
              distanceSectors: dist,
            });
          }
        }
      }
    }

    // Sort by distance from center sector
    return results.sort((a, b) => a.distanceSectors - b.distanceSectors);
  }
}
