import {
  type SurfaceGenerationTaskRequest,
  type SurfaceGenerationTaskResponse,
  generateChunkHeights,
} from '../workers/surfaceGeneration.worker';

export class SurfaceGeneratorService {
  private static instance: SurfaceGeneratorService | null = null;
  private worker: Worker | null = null;
  private pendingCallbacks: Map<
    string,
    { resolve: (res: SurfaceGenerationTaskResponse) => void; reject: (err: any) => void }
  > = new Map();
  private isWorkerSupported = false;

  public static getInstance(): SurfaceGeneratorService {
    if (!SurfaceGeneratorService.instance) {
      SurfaceGeneratorService.instance = new SurfaceGeneratorService();
    }
    return SurfaceGeneratorService.instance;
  }

  constructor() {
    this.initWorker();
  }

  private initWorker(): void {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      this.isWorkerSupported = false;
      return;
    }

    try {
      this.worker = new Worker(
        new URL('../workers/surfaceGeneration.worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (e: MessageEvent<SurfaceGenerationTaskResponse>) => {
        const { id } = e.data;
        const cb = this.pendingCallbacks.get(id);
        if (cb) {
          this.pendingCallbacks.delete(id);
          cb.resolve(e.data);
        }
      };

      this.worker.onerror = (err) => {
        console.warn('[SurfaceGeneratorService] Worker error, falling back to main-thread generation', err);
        this.isWorkerSupported = false;
        if (this.worker) {
          this.worker.terminate();
          this.worker = null;
        }
      };

      this.isWorkerSupported = true;
    } catch {
      // In headless environments or browsers with restricted worker origin
      this.isWorkerSupported = false;
      this.worker = null;
    }
  }

  public getWorkerActive(): boolean {
    return this.isWorkerSupported && this.worker !== null;
  }

  public requestChunkHeights(
    request: SurfaceGenerationTaskRequest
  ): Promise<SurfaceGenerationTaskResponse> {
    if (this.isWorkerSupported && this.worker) {
      return new Promise<SurfaceGenerationTaskResponse>((resolve, reject) => {
        this.pendingCallbacks.set(request.id, { resolve, reject });
        this.worker!.postMessage(request);
      });
    }

    // Progressive main-thread fallback
    return new Promise<SurfaceGenerationTaskResponse>((resolve) => {
      const { heights, minY, maxY } = generateChunkHeights(request);
      resolve({
        id: request.id,
        cx: request.cx,
        cz: request.cz,
        chunkSize: request.chunkSize,
        segments: request.segments,
        minY,
        maxY,
        heights,
      });
    });
  }

  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingCallbacks.clear();
    this.isWorkerSupported = false;
  }
}
