import { SimplexNoise2D } from '../surface/noise';

export interface SurfaceGenerationTaskRequest {
  id: string;
  cx: number;
  cz: number;
  chunkSize: number;
  segments: number;
  regionSeed: number;
  morphology: string;
  heightScale: number;
  roughness: number;
  domainWarp: number;
  duneStrength: number;
  canyonStrength: number;
  ridgeStrength: number;
}

export interface SurfaceGenerationTaskResponse {
  id: string;
  cx: number;
  cz: number;
  chunkSize: number;
  segments: number;
  minY: number;
  maxY: number;
  heights: Float32Array;
}

/**
 * Pure procedural height generation for a single point.
 */
export function computePointElevation(
  worldX: number,
  worldZ: number,
  noise: SimplexNoise2D,
  morphology: string,
  hScale: number,
  roughness: number,
  domainWarp: number,
  duneStrength: number,
  canyonStrength: number,
  ridgeStrength: number
): number {
  // Coherent domain warping
  const warpAngle = noise.noise2D(worldX * 0.003, worldZ * 0.003) * Math.PI * 2;
  const warpDist = noise.noise2D(worldX * 0.004 + 100, worldZ * 0.004 + 100) * 35.0 * domainWarp;
  const wx = worldX + Math.cos(warpAngle) * warpDist;
  const wz = worldZ + Math.sin(warpAngle) * warpDist;

  let elevation = 0;

  switch (morphology) {
    case 'dunes': {
      const duneAngle = 0.4;
      const dCoord = wx * Math.cos(duneAngle) + wz * Math.sin(duneAngle);
      const crossCoord = -wx * Math.sin(duneAngle) + wz * Math.cos(duneAngle);
      const wave = Math.sin(dCoord * 0.025) * 0.7 + noise.noise2D(dCoord * 0.015, crossCoord * 0.005) * 0.3;
      const sharpCrest = Math.pow(Math.abs(wave), 1.6) * Math.sign(wave);
      const swell = noise.fbm2D(wx * 0.004, wz * 0.004, 3, 2.0, 0.5) * 16.0;
      elevation = sharpCrest * 14.0 * duneStrength + swell;
      break;
    }

    case 'canyons': {
      const baseNoise = noise.fbm2D(wx * 0.006, wz * 0.006, 4, 2.0, 0.5);
      const terraced = SimplexNoise2D.terrace(baseNoise * 0.5 + 0.5, 5, 0.85) * 2.0 - 1.0;
      const canyonCut = Math.abs(noise.noise2D(wx * 0.008, wz * 0.008));
      const rift = canyonCut < 0.22 ? -(0.22 - canyonCut) * 65.0 * canyonStrength : 0;
      elevation = terraced * 22.0 + rift;
      break;
    }

    case 'salt_flat': {
      elevation = noise.noise2D(wx * 0.03, wz * 0.03) * 0.8;
      break;
    }

    case 'mesa_terrace': {
      const base = noise.fbm2D(wx * 0.005, wz * 0.005, 4, 2.0, 0.5);
      const stepped = SimplexNoise2D.terrace(base * 0.5 + 0.5, 4, 0.9) * 2.0 - 1.0;
      elevation = stepped * 26.0;
      break;
    }

    case 'alpine': {
      const ridges = noise.ridged2D(wx * 0.007, wz * 0.007, 4, 2.1, 0.55);
      const peaks = Math.pow(ridges, 1.4) * 32.0 * ridgeStrength;
      const valley = noise.fbm2D(wx * 0.003, wz * 0.003, 3) * 10.0;
      elevation = peaks + valley;
      break;
    }

    case 'coastal': {
      elevation = noise.fbm2D(wx * 0.005, wz * 0.005, 3, 2.0, 0.5) * 20.0;
      break;
    }

    case 'volcanic_rift':
    case 'caldera_rim': {
      const plateau = noise.fbm2D(wx * 0.006, wz * 0.006, 4, 2.0, 0.5);
      const stepped = SimplexNoise2D.terrace(plateau * 0.5 + 0.5, 3, 0.8) * 2.0 - 1.0;
      const fissure = Math.abs(noise.noise2D(wx * 0.012, wz * 0.012));
      const drop = fissure < 0.18 ? -(0.18 - fissure) * 55.0 : 0;
      elevation = stepped * 24.0 + drop;
      break;
    }

    case 'glacier_rift': {
      const glacier = noise.fbm2D(wx * 0.005, wz * 0.005, 3, 2.0, 0.5) * 22.0;
      const crevasse = Math.abs(noise.noise2D(wx * 0.015, wz * 0.015));
      const drop = crevasse < 0.14 ? -(0.14 - crevasse) * 50.0 : 0;
      elevation = glacier + drop;
      break;
    }

    case 'polar_plateau': {
      elevation = noise.fbm2D(wx * 0.003, wz * 0.003, 2, 2.0, 0.5) * 6.0;
      break;
    }

    case 'bioluminescent_archipelago': {
      const seaFloor = noise.fbm2D(wx * 0.003, wz * 0.003, 3, 2.0, 0.5) * 8.0 - 6.0;
      const islandSpires = Math.pow(Math.max(0, noise.ridged2D(wx * 0.006, wz * 0.006, 3, 2.0, 0.55)), 1.8) * 36.0;
      const lagoon = noise.noise2D(wx * 0.012, wz * 0.012) * 4.0;
      elevation = seaFloor + islandSpires + lagoon;
      break;
    }

    case 'obsidian_caldera': {
      const calderaNoise = noise.fbm2D(wx * 0.004, wz * 0.004, 4, 2.0, 0.5);
      const rim = Math.sin(calderaNoise * Math.PI * 2) * 28.0;
      const craterDrop = Math.abs(noise.noise2D(wx * 0.007, wz * 0.007)) < 0.3 ? -35.0 : 0;
      const basaltPillars = Math.max(0, noise.noise2D(wx * 0.02, wz * 0.02)) * 12.0;
      elevation = rim + craterDrop + basaltPillars;
      break;
    }

    case 'glacial_chasm': {
      const glacier = noise.ridged2D(wx * 0.005, wz * 0.005, 4, 2.2, 0.5) * 34.0;
      const chasm = Math.abs(noise.noise2D(wx * 0.01, wz * 0.01));
      const chasmDrop = chasm < 0.16 ? -(0.16 - chasm) * 60.0 : 0;
      elevation = glacier + chasmDrop;
      break;
    }

    case 'floating_mesas': {
      const base = noise.fbm2D(wx * 0.004, wz * 0.004, 3, 2.0, 0.5);
      const stepped = SimplexNoise2D.terrace(base * 0.5 + 0.5, 3, 0.95) * 45.0 - 15.0;
      const sheer = noise.noise2D(wx * 0.018, wz * 0.018) * 4.0;
      elevation = stepped + sheer;
      break;
    }

    case 'spore_grotto': {
      const mounds = Math.sin(wx * 0.015) * Math.cos(wz * 0.015) * 14.0;
      const basin = noise.fbm2D(wx * 0.005, wz * 0.005, 3, 2.0, 0.5) * 18.0;
      elevation = mounds + basin;
      break;
    }

    default: {
      const f1 = noise.fbm2D(wx * 0.005, wz * 0.005, 4, 2.0, 0.5) * 20.0;
      const f2 = noise.noise2D(wx * 0.015, wz * 0.015) * 5.0;
      elevation = f1 + f2;
      break;
    }
  }

  const micro = noise.noise2D(worldX * 0.06, worldZ * 0.06) * 1.8 * roughness;
  return Math.max(0, (elevation * (hScale / 25.0)) + micro + 6.0);
}

/**
 * Pure procedural height generation for a chunk.
 * Can be executed on Worker or on Main Thread fallback synchronously.
 */
export function generateChunkHeights(task: SurfaceGenerationTaskRequest): {
  heights: Float32Array;
  minY: number;
  maxY: number;
} {
  const {
    cx,
    cz,
    chunkSize,
    segments,
    regionSeed,
    morphology,
    heightScale,
    roughness,
    domainWarp,
    duneStrength,
    canyonStrength,
    ridgeStrength,
  } = task;

  const gridSize = segments + 1;
  const cellStep = chunkSize / segments;
  const count = gridSize * gridSize;
  const heights = new Float32Array(count);

  const noise = new SimplexNoise2D(regionSeed);
  const originX = cx * chunkSize - chunkSize / 2;
  const originZ = cz * chunkSize - chunkSize / 2;
  const hScale = heightScale * 32.0;

  let minY = Infinity;
  let maxY = -Infinity;

  for (let gz = 0; gz < gridSize; gz++) {
    const worldZ = originZ + gz * cellStep;
    for (let gx = 0; gx < gridSize; gx++) {
      const worldX = originX + gx * cellStep;
      const h = computePointElevation(
        worldX,
        worldZ,
        noise,
        morphology,
        hScale,
        roughness,
        domainWarp,
        duneStrength,
        canyonStrength,
        ridgeStrength
      );
      heights[gz * gridSize + gx] = h;
      if (h < minY) minY = h;
      if (h > maxY) maxY = h;
    }
  }

  return { heights, minY, maxY };
}

/**
 * Progressive row-batched procedural height generation for main-thread fallback.
 * Yields between row batches to ensure the main thread cannot be monopolized.
 */
export function generateChunkHeightsProgressive(
  task: SurfaceGenerationTaskRequest,
  batchRows = 6
): Promise<{
  heights: Float32Array;
  minY: number;
  maxY: number;
}> {
  return new Promise((resolve) => {
    const {
      cx,
      cz,
      chunkSize,
      segments,
      regionSeed,
      morphology,
      heightScale,
      roughness,
      domainWarp,
      duneStrength,
      canyonStrength,
      ridgeStrength,
    } = task;

    const gridSize = segments + 1;
    const cellStep = chunkSize / segments;
    const count = gridSize * gridSize;
    const heights = new Float32Array(count);

    const noise = new SimplexNoise2D(regionSeed);
    const originX = cx * chunkSize - chunkSize / 2;
    const originZ = cz * chunkSize - chunkSize / 2;
    const hScale = heightScale * 32.0;

    let minY = Infinity;
    let maxY = -Infinity;
    let currentGz = 0;

    const scheduleYield = typeof requestAnimationFrame !== 'undefined'
      ? (cb: () => void) => requestAnimationFrame(cb)
      : (cb: () => void) => setTimeout(cb, 0);

    function step() {
      const endGz = Math.min(currentGz + batchRows, gridSize);
      for (let gz = currentGz; gz < endGz; gz++) {
        const worldZ = originZ + gz * cellStep;
        for (let gx = 0; gx < gridSize; gx++) {
          const worldX = originX + gx * cellStep;
          const h = computePointElevation(
            worldX,
            worldZ,
            noise,
            morphology,
            hScale,
            roughness,
            domainWarp,
            duneStrength,
            canyonStrength,
            ridgeStrength
          );
          heights[gz * gridSize + gx] = h;
          if (h < minY) minY = h;
          if (h > maxY) maxY = h;
        }
      }

      currentGz = endGz;
      if (currentGz < gridSize) {
        scheduleYield(step);
      } else {
        resolve({ heights, minY, maxY });
      }
    }

    scheduleYield(step);
  });
}

// Worker message handling
if (typeof self !== 'undefined' && typeof (self as any).addEventListener === 'function') {
  self.addEventListener('message', (e: any) => {
    const task = e.data;
    if (!task) return;

    const { heights, minY, maxY } = generateChunkHeights(task);
    const response: SurfaceGenerationTaskResponse = {
      id: task.id,
      cx: task.cx,
      cz: task.cz,
      chunkSize: task.chunkSize,
      segments: task.segments,
      minY,
      maxY,
      heights,
    };

    (self as unknown as { postMessage: (msg: unknown, transfer: Transferable[]) => void }).postMessage(
      response,
      [heights.buffer]
    );
  });
}
