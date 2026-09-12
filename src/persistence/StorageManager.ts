/**
 * IndexedDB Persistence Layer with graceful fallback
 */

export interface AppSettings {
  version: number;
  audioMuted: boolean;
  masterVolume: number;
  preferredInputMode: 'companion' | 'keyboard';
  introSeen: boolean;
  lastSessionTime: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  audioMuted: false,
  masterVolume: 0.7,
  preferredInputMode: 'keyboard',
  introSeen: false,
  lastSessionTime: 0,
};

const DB_NAME = 'thequietbetweenstars_db';
const DB_VERSION = 1;
const STORE_SETTINGS = 'settings';

export class StorageManager {
  private db: IDBDatabase | null = null;
  private memoryFallback: AppSettings = { ...DEFAULT_SETTINGS };

  public async init(): Promise<void> {
    if (typeof indexedDB === 'undefined') {
      this.loadFromLocalStorageFallback();
      return;
    }

    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
            db.createObjectStore(STORE_SETTINGS);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[Storage] IndexedDB unavailable, using localStorage fallback', err);
      this.loadFromLocalStorageFallback();
    }
  }

  public async getSettings(): Promise<AppSettings> {
    if (!this.db) {
      return { ...this.memoryFallback };
    }

    try {
      return await new Promise<AppSettings>((resolve) => {
        const tx = this.db!.transaction(STORE_SETTINGS, 'readonly');
        const store = tx.objectStore(STORE_SETTINGS);
        const req = store.get('app_settings');

        req.onsuccess = () => {
          if (req.result) {
            resolve({ ...DEFAULT_SETTINGS, ...req.result });
          } else {
            resolve({ ...DEFAULT_SETTINGS });
          }
        };
        req.onerror = () => {
          resolve({ ...this.memoryFallback });
        };
      });
    } catch {
      return { ...this.memoryFallback };
    }
  }

  public async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    const updated: AppSettings = {
      ...current,
      ...patch,
      lastSessionTime: Date.now(),
    };

    this.memoryFallback = { ...updated };
    this.saveToLocalStorageFallback(updated);

    if (this.db) {
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = this.db!.transaction(STORE_SETTINGS, 'readwrite');
          const store = tx.objectStore(STORE_SETTINGS);
          const req = store.put(updated, 'app_settings');
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      } catch (e) {
        console.warn('[Storage] Failed to write to IndexedDB', e);
      }
    }

    return updated;
  }

  private loadFromLocalStorageFallback(): void {
    try {
      const raw = localStorage.getItem('tqbs_settings');
      if (raw) {
        this.memoryFallback = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      }
    } catch {
      // In-memory fallback
    }
  }

  private saveToLocalStorageFallback(settings: AppSettings): void {
    try {
      localStorage.setItem('tqbs_settings', JSON.stringify(settings));
    } catch {
      // Ignore storage quota or disabled localStorage
    }
  }
}

export const storage = new StorageManager();
