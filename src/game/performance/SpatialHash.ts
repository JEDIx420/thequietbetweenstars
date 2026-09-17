export interface SpatialEntry<T> {
  id: string;
  x: number;
  z: number;
  data: T;
  cellKey: string;
}

export class SpatialHash<T> {
  private cellSize: number;
  private cells: Map<string, Map<string, SpatialEntry<T>>> = new Map();
  private entries: Map<string, SpatialEntry<T>> = new Map();

  constructor(cellSize = 60) {
    this.cellSize = cellSize;
  }

  private getCellKey(cx: number, cz: number): string {
    return `${cx}:${cz}`;
  }

  public insert(id: string, x: number, z: number, data: T): void {
    if (this.entries.has(id)) {
      this.remove(id);
    }

    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    const cellKey = this.getCellKey(cx, cz);

    const entry: SpatialEntry<T> = { id, x, z, data, cellKey };
    this.entries.set(id, entry);

    let cell = this.cells.get(cellKey);
    if (!cell) {
      cell = new Map();
      this.cells.set(cellKey, cell);
    }
    cell.set(id, entry);
  }

  public remove(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;

    const cell = this.cells.get(entry.cellKey);
    if (cell) {
      cell.delete(id);
      if (cell.size === 0) {
        this.cells.delete(entry.cellKey);
      }
    }
    this.entries.delete(id);
    return true;
  }

  public update(id: string, x: number, z: number): void {
    const entry = this.entries.get(id);
    if (!entry) return;

    const newCx = Math.floor(x / this.cellSize);
    const newCz = Math.floor(z / this.cellSize);
    const newCellKey = this.getCellKey(newCx, newCz);

    entry.x = x;
    entry.z = z;

    if (entry.cellKey !== newCellKey) {
      const oldCell = this.cells.get(entry.cellKey);
      if (oldCell) {
        oldCell.delete(id);
        if (oldCell.size === 0) {
          this.cells.delete(entry.cellKey);
        }
      }

      entry.cellKey = newCellKey;
      let newCell = this.cells.get(newCellKey);
      if (!newCell) {
        newCell = new Map();
        this.cells.set(newCellKey, newCell);
      }
      newCell.set(id, entry);
    }
  }

  public queryRadius(
    x: number,
    z: number,
    radius: number
  ): Array<{ id: string; data: T; distSq: number }> {
    const results: Array<{ id: string; data: T; distSq: number }> = [];
    const radiusSq = radius * radius;

    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);
    const minCz = Math.floor((z - radius) / this.cellSize);
    const maxCz = Math.floor((z + radius) / this.cellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const cell = this.cells.get(this.getCellKey(cx, cz));
        if (!cell) continue;

        for (const entry of cell.values()) {
          const dx = entry.x - x;
          const dz = entry.z - z;
          const distSq = dx * dx + dz * dz;
          if (distSq <= radiusSq) {
            results.push({ id: entry.id, data: entry.data, distSq });
          }
        }
      }
    }

    return results;
  }

  public queryRadiusData(x: number, z: number, radius: number): T[] {
    return this.queryRadius(x, z, radius).map((r) => r.data);
  }

  public clear(): void {
    this.cells.clear();
    this.entries.clear();
  }

  public get size(): number {
    return this.entries.size;
  }
}
