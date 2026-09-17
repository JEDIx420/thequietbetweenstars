import { SeededRandom } from './SeededRandom';
import { WorldPosition, type SectorCoord } from './WorldPosition';
import { StarSystemGenerator } from '../systems/StarSystemGenerator';
import type { StarSystemDescriptor } from '../systems/PlanetDescriptor';
import type { StarSystemSummary } from '../systems/StarSystemSummary';

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
  private summaryCache: Map<string, StarSystemSummary | null> = new Map();
  private fullSystemCache: Map<string, StarSystemDescriptor> = new Map();
  private readonly maxCachedFullSystems = 32;

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
      system = this.getFullSystem(sx, sy, sz);
    }

    return {
      coord: { x: sx, y: sy, z: sz },
      key,
      hasSystem,
      system,
    };
  }

  public getFullSystem(sx: number, sy: number, sz: number): StarSystemDescriptor {
    const key = SectorManager.getSectorKey(sx, sy, sz);

    // Check active sectors first
    const active = this.activeSectors.get(key);
    if (active?.system) {
      return active.system;
    }

    // Check LRU full system cache
    const cached = this.fullSystemCache.get(key);
    if (cached) {
      // Refresh LRU order
      this.fullSystemCache.delete(key);
      this.fullSystemCache.set(key, cached);
      return cached;
    }

    // Generate full system descriptor
    const fullSystem = StarSystemGenerator.generateSystem(this.universeSeed, sx, sy, sz);

    if (this.fullSystemCache.size >= this.maxCachedFullSystems) {
      const oldestKey = this.fullSystemCache.keys().next().value;
      if (oldestKey) this.fullSystemCache.delete(oldestKey);
    }
    this.fullSystemCache.set(key, fullSystem);
    return fullSystem;
  }

  public getActiveSectors(): ActiveSector[] {
    return Array.from(this.activeSectors.values());
  }

  public getSector(key: string): ActiveSector | undefined {
    return this.activeSectors.get(key);
  }

  /**
   * Query lightweight summaries within a sector radius for lightning-fast star map rendering.
   * Computes star properties and planet counts without generating full planetary profiles or textures.
   */
  public getSystemSummariesInRadius(
    centerSector: SectorCoord,
    radius: number = 5
  ): Array<{ coord: SectorCoord; summary: StarSystemSummary; distanceSectors: number }> {
    const results: Array<{ coord: SectorCoord; summary: StarSystemSummary; distanceSectors: number }> = [];

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist > radius) continue;

          const sx = centerSector.x + dx;
          const sy = centerSector.y + dy;
          const sz = centerSector.z + dz;
          const key = SectorManager.getSectorKey(sx, sy, sz);

          if (this.summaryCache.has(key)) {
            const cached = this.summaryCache.get(key);
            if (cached) {
              results.push({ coord: { x: sx, y: sy, z: sz }, summary: cached, distanceSectors: dist });
            }
            continue;
          }

          const sectorHash = SeededRandom.hashCoords(this.universeSeed, sx, sy, sz);
          const rng = new SeededRandom(sectorHash);
          const hasSystem = (sx === 0 && sy === 0 && sz === 0) || rng.chance(0.35);

          if (hasSystem) {
            const summary = StarSystemGenerator.generateSystemSummary(this.universeSeed, sx, sy, sz);
            this.summaryCache.set(key, summary);
            results.push({ coord: { x: sx, y: sy, z: sz }, summary, distanceSectors: dist });
          } else {
            this.summaryCache.set(key, null);
          }
        }
      }
    }

    return results.sort((a, b) => a.distanceSectors - b.distanceSectors);
  }

  /**
   * Deterministically queries full star systems within a sector radius on demand.
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

          const sectorHash = SeededRandom.hashCoords(this.universeSeed, sx, sy, sz);
          const rng = new SeededRandom(sectorHash);
          const hasSystem = (sx === 0 && sy === 0 && sz === 0) || rng.chance(0.35);

          if (hasSystem) {
            const system = this.getFullSystem(sx, sy, sz);
            results.push({
              coord: { x: sx, y: sy, z: sz },
              system,
              distanceSectors: dist,
            });
          }
        }
      }
    }

    return results.sort((a, b) => a.distanceSectors - b.distanceSectors);
  }
}
