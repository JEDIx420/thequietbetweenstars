import type { SectorCoord } from '../game/universe/WorldPosition';
import type { StarSystemDescriptor } from '../game/systems/PlanetDescriptor';

export type DiscoveryCategory =
  | 'WORLDS'
  | 'LIFE'
  | 'PEOPLES'
  | 'LORE'
  | 'SYSTEMS'
  | 'ANOMALIES'
  | 'RESOURCES';

export interface DiscoveryRecord {
  id: string;
  type: 'system' | 'planet' | 'anomaly' | 'flora' | 'fauna' | 'sentient' | 'culture' | 'landmark' | 'lore' | 'resource';
  name: string;
  systemName: string;
  sector: SectorCoord;
  timestamp: number;
  details: string;
  biosignature?: string;
  category: DiscoveryCategory;
}

export interface JournalEntry {
  id: string;
  timestamp: number;
  title: string;
  content: string;
  sector: SectorCoord;
  tags: string[];
}

export interface NPCMemory {
  npcId: string;
  speciesId: string;
  name: string;
  timesMet: number;
  lastMet: number;
  topicsDiscussed: string[];
  factsRevealed: string[];
  familiarity: number; // 0.0 to 1.0
}

export interface ShipModule {
  id: string;
  name: string;
  category: 'PROPULSION' | 'SURFACE_CONTROL' | 'SCANNER' | 'WARP' | 'ENVIRONMENT' | 'CARGO' | 'UTILITY';
  tier: number;
  costCredits: number;
  sampleRequirements: Array<{ category: string; count: number }>;
  statModifiers: {
    maxSurfaceAltitude?: number;
    accelerationBonus?: number;
    scanRadiusBonus?: number;
    warpStability?: number;
    sampleBonus?: number;
  };
  visualPart: 'thruster_ring' | 'wing_extension' | 'sensor_crown' | 'hull_reinforcement';
  description: string;
}

export interface ModuleOrder {
  orderId: string;
  moduleId: string;
  orderedAt: number;
  deliveryEtaSec: number;
  destinationSystemName: string;
  status: 'ORDERED' | 'IN_TRANSIT' | 'ARRIVED' | 'INSTALLED';
}

export interface PlayerSaveSlot {
  slotId: string;
  saveVersion: number;
  updatedAt: number;
  universeSeed: string;
  playerSector: SectorCoord;
  playerLocalPos: { x: number; y: number; z: number };
  currentSystem: StarSystemDescriptor | null;
  targetSystem?: StarSystemDescriptor | null;
  flightPhase: string;
  credits: number;
  sampleInventory: Record<string, number>;
  installedModules: string[];
  pendingOrders: ModuleOrder[];
  npcMemories: Record<string, NPCMemory>;
  collectedCreditIds?: string[];
  stats: {
    systemsVisited: number;
    planetsScanned: number;
    surfacesVisited: number;
    speciesDiscovered: number;
    sentientDiscovered: number;
    loreLearned: number;
    samplesCollected: number;
    modulesInstalled: number;
    anomaliesDiscovered: number;
    flightTimeSeconds: number;
  };
  tutorial: {
    started: boolean;
    completed: boolean;
    step: string;
    skipped: boolean;
  };
  narrative: {
    triggeredEventIds: string[];
    resonanceFlags: string[];
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

export const DEFAULT_SAVE_SLOT: PlayerSaveSlot = {
  slotId: 'current_journey',
  saveVersion: 4,
  updatedAt: 0,
  universeSeed: 'QUIET-DEFAULT-001',
  playerSector: { x: 0, y: 0, z: 0 },
  playerLocalPos: { x: 0, y: 0, z: 100 },
  currentSystem: null,
  targetSystem: null,
  flightPhase: 'SYSTEM_CRUISE',
  credits: 250,
  sampleInventory: {},
  installedModules: [],
  pendingOrders: [],
  npcMemories: {},
  collectedCreditIds: [],
  stats: {
    systemsVisited: 1,
    planetsScanned: 0,
    surfacesVisited: 0,
    speciesDiscovered: 0,
    sentientDiscovered: 0,
    loreLearned: 0,
    samplesCollected: 0,
    modulesInstalled: 0,
    anomaliesDiscovered: 0,
    flightTimeSeconds: 0,
  },
  tutorial: {
    started: false,
    completed: false,
    step: 'WAKE_INTRO',
    skipped: false,
  },
  narrative: {
    triggeredEventIds: [],
    resonanceFlags: [],
  },
};

const DB_NAME = 'thequietbetweenstars_db';
const DB_VERSION = 3;

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
  // Settings
  // ==========================================
  public async getSettings(): Promise<AppSettings> {
    if (!this.db) return { ...this.memorySettings };

    try {
      const result = await new Promise<AppSettings | null>((resolve) => {
        const tx = this.db!.transaction(STORE_SETTINGS, 'readonly');
        const store = tx.objectStore(STORE_SETTINGS);
        const req = store.get('app_settings');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
      return result ? { ...DEFAULT_SETTINGS, ...result } : { ...this.memorySettings };
    } catch {
      return { ...this.memorySettings };
    }
  }

  public async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    const updated = {
      ...current,
      ...patch,
      lastSessionTime: patch.lastSessionTime ?? Date.now(),
    };
    this.memorySettings = updated;

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
    let raw: any = null;

    if (!this.db) {
      raw = this.memorySaveSlot.updatedAt > 0 ? { ...this.memorySaveSlot } : null;
    } else {
      try {
        raw = await new Promise<any>((resolve) => {
          const tx = this.db!.transaction(STORE_SAVE_SLOTS, 'readonly');
          const store = tx.objectStore(STORE_SAVE_SLOTS);
          const req = store.get(slotId);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        });
      } catch {
        raw = null;
      }
    }

    if (!raw) return null;

    // Migrate v2 / v3 -> v4
    if (!raw.saveVersion || raw.saveVersion < 4) {
      raw.saveVersion = 4;
      if (raw.credits === undefined) raw.credits = 250;
      if (!raw.sampleInventory) raw.sampleInventory = {};
      if (!raw.installedModules) raw.installedModules = [];
      if (!raw.pendingOrders) raw.pendingOrders = [];
      if (!raw.npcMemories) raw.npcMemories = {};
      if (!raw.collectedCreditIds) raw.collectedCreditIds = [];

      if (!raw.stats) {
        raw.stats = { ...DEFAULT_SAVE_SLOT.stats };
      } else {
        raw.stats.surfacesVisited = raw.stats.surfacesVisited || 0;
        raw.stats.speciesDiscovered = raw.stats.speciesDiscovered || 0;
        raw.stats.sentientDiscovered = raw.stats.sentientDiscovered || 0;
        raw.stats.loreLearned = raw.stats.loreLearned || 0;
        raw.stats.samplesCollected = raw.stats.samplesCollected || 0;
        raw.stats.modulesInstalled = raw.stats.modulesInstalled || 0;
        raw.stats.anomaliesDiscovered = raw.stats.anomaliesDiscovered || raw.stats.anomaliesFound || 0;
      }
      if (!raw.tutorial) {
        raw.tutorial = { ...DEFAULT_SAVE_SLOT.tutorial };
      }
      if (!raw.narrative) {
        raw.narrative = { ...DEFAULT_SAVE_SLOT.narrative };
      }
    }

    return raw as PlayerSaveSlot;
  }

  public async clearJourney(slotId = 'current_journey'): Promise<void> {
    this.memorySaveSlot = { ...DEFAULT_SAVE_SLOT, updatedAt: 0 };
    this.memoryDiscoveries.clear();
    this.memoryJournal = [];

    if (!this.db) {
      this.saveLocalStorageFallback();
      return;
    }

    try {
      await new Promise<void>((resolve) => {
        const tx = this.db!.transaction([STORE_SAVE_SLOTS, STORE_DISCOVERIES, STORE_JOURNAL], 'readwrite');
        tx.objectStore(STORE_SAVE_SLOTS).delete(slotId);
        tx.objectStore(STORE_DISCOVERIES).clear();
        tx.objectStore(STORE_JOURNAL).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      this.saveLocalStorageFallback();
    }
  }

  public async saveJourney(slot: PlayerSaveSlot): Promise<void> {
    slot.updatedAt = Date.now();
    slot.saveVersion = 4;
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
      console.warn('[SaveManager] Failed to record discovery to IndexedDB', e);
      this.saveLocalStorageFallback();
    }
  }

  public async getDiscoveriesByCategory(category: DiscoveryCategory): Promise<DiscoveryRecord[]> {
    if (!this.db) {
      return Array.from(this.memoryDiscoveries.values()).filter((d) => d.category === category);
    }

    try {
      return await new Promise<DiscoveryRecord[]>((resolve) => {
        const tx = this.db!.transaction(STORE_DISCOVERIES, 'readonly');
        const store = tx.objectStore(STORE_DISCOVERIES);
        const index = store.index('category');
        const req = index.getAll(category);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch {
      return Array.from(this.memoryDiscoveries.values()).filter((d) => d.category === category);
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
        req.onerror = () => resolve([]);
      });
    } catch {
      return Array.from(this.memoryDiscoveries.values());
    }
  }

  // ==========================================
  // Journal
  // ==========================================
  public async addJournalEntry(entry: JournalEntry): Promise<void> {
    this.memoryJournal.unshift(entry);

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
      console.warn('[SaveManager] Failed to record journal entry to IndexedDB', e);
      this.saveLocalStorageFallback();
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
        req.onsuccess = () => {
          const entries: JournalEntry[] = req.result || [];
          entries.sort((a, b) => b.timestamp - a.timestamp);
          resolve(entries);
        };
        req.onerror = () => resolve([...this.memoryJournal]);
      });
    } catch {
      return [...this.memoryJournal];
    }
  }

  // ==========================================
  // LocalStorage Fallback (Private)
  // ==========================================
  private loadLocalStorageFallback(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const rawSettings = localStorage.getItem('tqbs_settings');
      if (rawSettings) this.memorySettings = { ...DEFAULT_SETTINGS, ...JSON.parse(rawSettings) };

      const rawSlot = localStorage.getItem('tqbs_current_journey');
      if (rawSlot) this.memorySaveSlot = { ...DEFAULT_SAVE_SLOT, ...JSON.parse(rawSlot) };

      const rawDiscoveries = localStorage.getItem('tqbs_discoveries');
      if (rawDiscoveries) {
        const parsed: DiscoveryRecord[] = JSON.parse(rawDiscoveries);
        this.memoryDiscoveries = new Map(parsed.map((d) => [d.id, d]));
      }

      const rawJournal = localStorage.getItem('tqbs_journal');
      if (rawJournal) this.memoryJournal = JSON.parse(rawJournal);
    } catch (e) {
      console.warn('[SaveManager] Failed to load localStorage fallback', e);
    }
  }

  private saveLocalStorageFallback(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem('tqbs_settings', JSON.stringify(this.memorySettings));
      localStorage.setItem('tqbs_current_journey', JSON.stringify(this.memorySaveSlot));
      localStorage.setItem(
        'tqbs_discoveries',
        JSON.stringify(Array.from(this.memoryDiscoveries.values()))
      );
      localStorage.setItem('tqbs_journal', JSON.stringify(this.memoryJournal));
    } catch (e) {
      console.warn('[SaveManager] Failed to persist localStorage fallback', e);
    }
  }
}

export const saveManager = new SaveManager();
