/**
 * THE QUIET BETWEEN STARS - Save Game & Journal System (IndexedDB v2)
 */

import type { SectorCoord } from '../game/universe/WorldPosition';
import type { StarSystemDescriptor } from '../game/systems/PlanetDescriptor';

export interface DiscoveryRecord {
  id: string; // e.g. "planet-aurelia" or "anomaly-probe-1"
  type: 'system' | 'planet' | 'anomaly' | 'flora' | 'landmark';
  name: string;
  systemName: string;
  sector: SectorCoord;
  timestamp: number;
  details: string;
  biosignature?: string;
  category: 'WORLDS' | 'LIFE' | 'SYSTEMS' | 'ANOMALIES';
}

export interface JournalEntry {
  id: string;
  timestamp: number;
  title: string;
  content: string;
  sector: SectorCoord;
  tags: string[];
}

export interface PlayerSaveSlot {
  slotId: string; // 'current_journey' or 'slot_1'
  saveVersion: number;
  updatedAt: number;
  universeSeed: string;
  playerSector: SectorCoord;
  playerLocalPos: { x: number; y: number; z: number };
  currentSystem: StarSystemDescriptor | null;
  flightPhase: string;
  stats: {
    systemsVisited: number;
    planetsScanned: number;
    anomaliesFound: number;
    flightTimeSeconds: number;
  };
}

export interface AppSettings {
  version: number;
  audioMuted: boolean;
  masterVolume: number;
  preferredInputMode: 'companion' | 'keyboard';
  introSeen: boolean;
  lastSessionTime: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  version: 2,
  audioMuted: false,
  masterVolume: 0.7,
  preferredInputMode: 'keyboard',
  introSeen: false,
  lastSessionTime: 0,
};

const DEFAULT_SAVE_SLOT: PlayerSaveSlot = {
  slotId: 'current_journey',
  saveVersion: 2,
  updatedAt: Date.now(),
  universeSeed: 'QUIET-DEFAULT-001',
  playerSector: { x: 0, y: 0, z: 0 },
  playerLocalPos: { x: 0, y: 0, z: 100 },
  currentSystem: null,
  flightPhase: 'SYSTEM_CRUISE',
  stats: {
    systemsVisited: 1,
    planetsScanned: 0,
    anomaliesFound: 0,
    flightTimeSeconds: 0,
  },
};

const DB_NAME = 'thequietbetweenstars_db';
const DB_VERSION = 2;

const STORE_SETTINGS = 'settings';
const STORE_SAVE_SLOTS = 'save_slots';
const STORE_DISCOVERIES = 'discoveries';
const STORE_JOURNAL = 'journal';

export class SaveManager {
  private db: IDBDatabase | null = null;
  private memorySettings: AppSettings = { ...DEFAULT_SETTINGS };
  private memorySaveSlot: PlayerSaveSlot = { ...DEFAULT_SAVE_SLOT };
  private memoryDiscoveries: Map<string, DiscoveryRecord> = new Map();
  private memoryJournal: JournalEntry[] = [];

  public async init(): Promise<void> {
    if (typeof indexedDB === 'undefined') {
      this.loadLocalStorageFallback();
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
          if (!db.objectStoreNames.contains(STORE_SAVE_SLOTS)) {
            db.createObjectStore(STORE_SAVE_SLOTS, { keyPath: 'slotId' });
          }
          if (!db.objectStoreNames.contains(STORE_DISCOVERIES)) {
            const discStore = db.createObjectStore(STORE_DISCOVERIES, { keyPath: 'id' });
            discStore.createIndex('category', 'category', { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_JOURNAL)) {
            const jourStore = db.createObjectStore(STORE_JOURNAL, { keyPath: 'id' });
            jourStore.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[SaveManager] IndexedDB unavailable, using localStorage fallback', err);
      this.loadLocalStorageFallback();
    }
  }

  // ==========================================
  // App Settings
  // ==========================================
  public async getSettings(): Promise<AppSettings> {
    if (!this.db) return { ...this.memorySettings };

    try {
      return await new Promise<AppSettings>((resolve) => {
        const tx = this.db!.transaction(STORE_SETTINGS, 'readonly');
        const store = tx.objectStore(STORE_SETTINGS);
        const req = store.get('app_settings');
        req.onsuccess = () => resolve(req.result ? { ...DEFAULT_SETTINGS, ...req.result } : { ...DEFAULT_SETTINGS });
        req.onerror = () => resolve({ ...this.memorySettings });
      });
    } catch {
      return { ...this.memorySettings };
    }
  }

  public async updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    const updated: AppSettings = { ...current, ...partial, lastSessionTime: Date.now() };
    this.memorySettings = { ...updated };

    if (!this.db) {
      this.saveLocalStorageFallback();
      return updated;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const tx = this.db!.transaction(STORE_SETTINGS, 'readwrite');
        const store = tx.objectStore(STORE_SETTINGS);
        const req = store.put(updated, 'app_settings');
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      this.saveLocalStorageFallback();
    }
    return updated;
  }

  // ==========================================
  // Save Slots & Journey State
  // ==========================================
  public async getSaveSlot(slotId = 'current_journey'): Promise<PlayerSaveSlot | null> {
    if (!this.db) {
      return this.memorySaveSlot.updatedAt > 0 ? { ...this.memorySaveSlot } : null;
    }

    try {
      return await new Promise<PlayerSaveSlot | null>((resolve) => {
        const tx = this.db!.transaction(STORE_SAVE_SLOTS, 'readonly');
        const store = tx.objectStore(STORE_SAVE_SLOTS);
        const req = store.get(slotId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  public async saveJourney(slot: PlayerSaveSlot): Promise<void> {
    slot.updatedAt = Date.now();
    this.memorySaveSlot = { ...slot };

    if (!this.db) {
      this.saveLocalStorageFallback();
      return;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const tx = this.db!.transaction(STORE_SAVE_SLOTS, 'readwrite');
        const store = tx.objectStore(STORE_SAVE_SLOTS);
        const req = store.put(slot);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('[SaveManager] Failed to persist slot to IndexedDB', e);
      this.saveLocalStorageFallback();
    }
  }

  public async hasSavedJourney(): Promise<boolean> {
    const slot = await this.getSaveSlot();
    return slot !== null && slot.updatedAt > 0;
  }

  // ==========================================
  // Discoveries Log
  // ==========================================
  public async recordDiscovery(record: DiscoveryRecord): Promise<void> {
    this.memoryDiscoveries.set(record.id, record);

    if (!this.db) {
      this.saveLocalStorageFallback();
      return;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const tx = this.db!.transaction(STORE_DISCOVERIES, 'readwrite');
        const store = tx.objectStore(STORE_DISCOVERIES);
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('[SaveManager] Failed to save discovery', e);
    }
  }

  public async getAllDiscoveries(): Promise<DiscoveryRecord[]> {
    if (!this.db) {
      return Array.from(this.memoryDiscoveries.values());
    }

    try {
      return await new Promise<DiscoveryRecord[]>((resolve) => {
        const tx = this.db!.transaction(STORE_DISCOVERIES, 'readonly');
        const store = tx.objectStore(STORE_DISCOVERIES);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve(Array.from(this.memoryDiscoveries.values()));
      });
    } catch {
      return Array.from(this.memoryDiscoveries.values());
    }
  }

  // ==========================================
  // Journal Log
  // ==========================================
  public async addJournalEntry(entry: JournalEntry): Promise<void> {
    this.memoryJournal.push(entry);

    if (!this.db) {
      this.saveLocalStorageFallback();
      return;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const tx = this.db!.transaction(STORE_JOURNAL, 'readwrite');
        const store = tx.objectStore(STORE_JOURNAL);
        const req = store.put(entry);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('[SaveManager] Failed to save journal entry', e);
    }
  }

  public async getJournalEntries(): Promise<JournalEntry[]> {
    if (!this.db) {
      return [...this.memoryJournal];
    }

    try {
      return await new Promise<JournalEntry[]>((resolve) => {
        const tx = this.db!.transaction(STORE_JOURNAL, 'readonly');
        const store = tx.objectStore(STORE_JOURNAL);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([...this.memoryJournal]);
      });
    } catch {
      return [...this.memoryJournal];
    }
  }

  // Fallback serialization
  private loadLocalStorageFallback(): void {
    try {
      const s = localStorage.getItem('tqbs_settings_v2');
      if (s) this.memorySettings = { ...DEFAULT_SETTINGS, ...JSON.parse(s) };

      const slot = localStorage.getItem('tqbs_save_slot_v2');
      if (slot) this.memorySaveSlot = JSON.parse(slot);

      const d = localStorage.getItem('tqbs_discoveries_v2');
      if (d) {
        const list: DiscoveryRecord[] = JSON.parse(d);
        for (const item of list) this.memoryDiscoveries.set(item.id, item);
      }
    } catch {
      // Ignore
    }
  }

  private saveLocalStorageFallback(): void {
    try {
      localStorage.setItem('tqbs_settings_v2', JSON.stringify(this.memorySettings));
      localStorage.setItem('tqbs_save_slot_v2', JSON.stringify(this.memorySaveSlot));
      localStorage.setItem('tqbs_discoveries_v2', JSON.stringify(Array.from(this.memoryDiscoveries.values())));
    } catch {
      // Ignore
    }
  }
}

export const saveManager = new SaveManager();
// Retain backward-compatible alias
export const storage = saveManager;
