import type { StoryState } from '../story/StoryTypes';
import { LoreContextBuilder } from './LoreContextBuilder';
import { CanonFirewall } from './CanonFirewall';

export interface ModelManifest {
  id: string;
  name: string;
  url: string;
  sizeBytes: number;
  contextSize: number;
}

export const PINNED_MODEL_MANIFEST: ModelManifest = {
  id: 'qwen2.5-0.5b-instruct-q4_k_m',
  name: 'Qwen 2.5 0.5B Instruct (Q4_K_M)',
  url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
  sizeBytes: 398_000_000,
  contextSize: 2048,
};

export type ModelStatus = 'NOT_DOWNLOADED' | 'DOWNLOADING' | 'READY' | 'ERROR' | 'BUSY';

export class LocalIntelligenceService {
  private static instance: LocalIntelligenceService | null = null;
  private wllamaInstance: any = null;
  private status: ModelStatus = 'NOT_DOWNLOADED';
  private downloadProgress = 0;
  private isEnabled = false;

  public static getInstance(): LocalIntelligenceService {
    if (!LocalIntelligenceService.instance) {
      LocalIntelligenceService.instance = new LocalIntelligenceService();
    }
    return LocalIntelligenceService.instance;
  }

  public getStatus(): ModelStatus {
    return this.status;
  }

  public getProgress(): number {
    return this.downloadProgress;
  }

  public isAiEnabled(): boolean {
    return this.isEnabled;
  }

  public setAiEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * Checks whether the model is cached in browser storage (IndexedDB/CacheStorage)
   */
  public async isModelCached(): Promise<boolean> {
    if (typeof caches === 'undefined') return false;
    try {
      const cache = await caches.open('wllama_models');
      const match = await cache.match(PINNED_MODEL_MANIFEST.url);
      return !!match;
    } catch {
      return false;
    }
  }

  /**
   * Opt-in on-demand download and initialization of local Wllama runtime
   */
  public async downloadAndInit(onProgress?: (percent: number) => void): Promise<boolean> {
    if (this.status === 'READY') return true;
    if (this.status === 'DOWNLOADING') return false;

    this.status = 'DOWNLOADING';
    this.downloadProgress = 0;

    try {
      // Dynamic import to keep initial bundle light and avoid loading in testing
      const { Wllama } = await import('@wllama/wllama');

      const CONFIG_PATHS = {
        'single-thread/wllama.wasm': '/wllama/single-thread/wllama.wasm',
        'multi-thread/wllama.wasm': '/wllama/multi-thread/wllama.wasm',
      };

      const wllama = new (Wllama as any)(CONFIG_PATHS);

      // Download / load from cache with progress
      await wllama.loadModelFromUrl(PINNED_MODEL_MANIFEST.url, {
        n_ctx: PINNED_MODEL_MANIFEST.contextSize,
        progressCallback: ({ loaded, total }: { loaded: number; total: number }) => {
          if (total > 0) {
            this.downloadProgress = Math.round((loaded / total) * 100);
            if (onProgress) onProgress(this.downloadProgress);
          }
        },
      });

      this.wllamaInstance = wllama;
      this.status = 'READY';
      this.isEnabled = true;
      return true;
    } catch (err) {
      console.warn('[LocalIntelligenceService] Failed to load local model:', err);
      this.status = 'ERROR';
      return false;
    }
  }

  /**
   * Generates a conversational reply using the local LLM if ready,
   * otherwise immediately returns the canonical fallback text.
   */
  public async generateReply(
    speaker: string,
    userTopic: string,
    storyState: StoryState,
    currentSystemName: string,
    fallbackReply: string
  ): Promise<string> {
    if (!this.isEnabled || this.status !== 'READY' || !this.wllamaInstance) {
      return fallbackReply;
    }

    const systemPrompt = LoreContextBuilder.buildSystemPrompt(speaker, storyState, currentSystemName);
    const userPrompt = `Inquire about: ${userTopic}`;

    const formattedPrompt = `<|im_start|>system\n${systemPrompt}<|im_end|>\n<|im_start|>user\n${userPrompt}<|im_end|>\n<|im_start|>assistant\n`;

    try {
      this.status = 'BUSY';

      // 3.5-second strict timeout promise race
      const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('LLM Generation Timeout')), 3500);
      });

      const generationPromise = this.wllamaInstance.createCompletion(formattedPrompt, {
        n_predict: 80,
        sampling: {
          temp: 0.7,
          top_p: 0.8,
        },
      });

      const rawResult = await Promise.race([generationPromise, timeoutPromise]);
      this.status = 'READY';

      return CanonFirewall.validateAndSanitize(rawResult, fallbackReply);
    } catch (err) {
      console.warn('[LocalIntelligenceService] Generation failed or timed out, using fallback:', err);
      this.status = 'READY';
      return fallbackReply;
    }
  }
}

export const localAI = LocalIntelligenceService.getInstance();
