import type { PlayerSaveSlot, ModuleOrder, NPCMemory } from '../../persistence/SaveManager';
import { SHIP_MODULE_CATALOG } from './ShipProgression';
import type { CraftingRecipe } from '../economy/CraftingCatalog';

export interface PlayerStateStoreData {
  credits: number;
  sampleInventory: Record<string, number>;
  commodityInventory: Record<string, number>;
  installedModules: Set<string>;
  pendingOrders: ModuleOrder[];
  npcMemories: Record<string, NPCMemory>;
  knownStations: Set<string>;
  knownVessels: Set<string>;
  collectedCreditIds: Set<string>;
  marketStockDeltas: Record<string, Record<string, number>>; // stationId -> { commodityId: purchasedCount }
  baseCargoCapacity: number;
}

export type PlayerStateChangeListener = (store: PlayerStateStore) => void;

export class PlayerStateStore {
  private credits: number = 250;
  private sampleInventory: Record<string, number> = {};
  private commodityInventory: Record<string, number> = {};
  private installedModules: Set<string> = new Set();
  private pendingOrders: ModuleOrder[] = [];
  private npcMemories: Record<string, NPCMemory> = {};
  private knownStations: Set<string> = new Set();
  private knownVessels: Set<string> = new Set();
  private collectedCreditIds: Set<string> = new Set();
  private marketStockDeltas: Record<string, Record<string, number>> = {};
  private baseCargoCapacity: number = 60;

  private listeners: Set<PlayerStateChangeListener> = new Set();

  constructor(initialSlot?: Partial<PlayerSaveSlot>) {
    if (initialSlot) {
      this.loadFromSaveSlot(initialSlot as PlayerSaveSlot);
    }
  }

  public subscribe(listener: PlayerStateChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this);
      } catch (err) {
        console.error('[PlayerStateStore] Listener error:', err);
      }
    }
  }

  // ==========================================
  // Credits
  // ==========================================
  public getCredits(): number {
    return this.credits;
  }

  public setCredits(amount: number): void {
    this.credits = Math.max(0, Math.round(amount));
    this.notify();
  }

  public addCredits(amount: number): void {
    this.credits = Math.max(0, Math.round(this.credits + amount));
    this.notify();
  }

  public deductCredits(amount: number): boolean {
    const cost = Math.max(0, Math.round(amount));
    if (this.credits < cost) return false;
    this.credits -= cost;
    this.notify();
    return true;
  }

  // ==========================================
  // Cargo Capacity & Tracking
  // ==========================================
  public getBaseCargoCapacity(): number {
    return this.baseCargoCapacity;
  }

  public getCargoCapacity(): number {
    let bonus = 0;
    for (const modId of this.installedModules) {
      const def = SHIP_MODULE_CATALOG.find((m) => m.id === modId);
      if (def?.statModifiers?.cargoBonus) {
        bonus += def.statModifiers.cargoBonus;
      }
    }
    return this.baseCargoCapacity + bonus;
  }

  public getCargoUsed(): number {
    let used = 0;
    for (const count of Object.values(this.sampleInventory)) {
      used += count || 0;
    }
    for (const count of Object.values(this.commodityInventory)) {
      used += count || 0;
    }
    return used;
  }

  public getAvailableCargoSpace(): number {
    return Math.max(0, this.getCargoCapacity() - this.getCargoUsed());
  }

  public hasCargoSpace(requiredUnits: number): boolean {
    return this.getCargoUsed() + requiredUnits <= this.getCargoCapacity();
  }

  // ==========================================
  // Sample Inventory
  // ==========================================
  public getSampleInventory(): Record<string, number> {
    return { ...this.sampleInventory };
  }

  public getSampleCount(category: string): number {
    return this.sampleInventory[category] || 0;
  }

  public addSample(category: string, count: number): boolean {
    if (count <= 0) return true;
    if (!this.hasCargoSpace(count)) return false;
    this.sampleInventory[category] = (this.sampleInventory[category] || 0) + count;
    this.notify();
    return true;
  }

  public removeSample(category: string, count: number): boolean {
    if (count <= 0) return true;
    const current = this.sampleInventory[category] || 0;
    if (current < count) return false;
    const next = current - count;
    if (next <= 0) {
      delete this.sampleInventory[category];
    } else {
      this.sampleInventory[category] = next;
    }
    this.notify();
    return true;
  }

  // ==========================================
  // Commodity Inventory
  // ==========================================
  public getCommodityInventory(): Record<string, number> {
    return { ...this.commodityInventory };
  }

  public getCommodityCount(commodityId: string): number {
    return this.commodityInventory[commodityId] || 0;
  }

  public addCommodity(commodityId: string, count: number): boolean {
    if (count <= 0) return true;
    if (!this.hasCargoSpace(count)) return false;
    this.commodityInventory[commodityId] = (this.commodityInventory[commodityId] || 0) + count;
    this.notify();
    return true;
  }

  public removeCommodity(commodityId: string, count: number): boolean {
    if (count <= 0) return true;
    const current = this.commodityInventory[commodityId] || 0;
    if (current < count) return false;
    const next = current - count;
    if (next <= 0) {
      delete this.commodityInventory[commodityId];
    } else {
      this.commodityInventory[commodityId] = next;
    }
    this.notify();
    return true;
  }

  // ==========================================
  // Station Market Stock Deltas
  // ==========================================
  public getMarketStockDeltas(): Record<string, Record<string, number>> {
    return JSON.parse(JSON.stringify(this.marketStockDeltas));
  }

  public getPurchasedStockDelta(stationId: string, commodityId: string): number {
    return this.marketStockDeltas[stationId]?.[commodityId] || 0;
  }

  public getRemainingStock(stationId: string, commodityId: string, baseStock: number): number {
    const purchased = this.getPurchasedStockDelta(stationId, commodityId);
    return Math.max(0, baseStock - purchased);
  }

  public recordStockPurchase(stationId: string, commodityId: string, quantity: number): void {
    if (!this.marketStockDeltas[stationId]) {
      this.marketStockDeltas[stationId] = {};
    }
    const current = this.marketStockDeltas[stationId][commodityId] || 0;
    this.marketStockDeltas[stationId][commodityId] = current + quantity;
  }

  // ==========================================
  // Atomic Market Transactions
  // ==========================================
  public buyCommodity(
    stationId: string,
    commodityId: string,
    quantity: number,
    unitPrice: number,
    baseStock: number
  ): { success: boolean; reason?: string; cost?: number } {
    if (quantity <= 0) return { success: false, reason: 'Invalid quantity' };
    const remainingStock = this.getRemainingStock(stationId, commodityId, baseStock);
    if (quantity > remainingStock) {
      return { success: false, reason: `Station only has ${remainingStock} in stock` };
    }
    const totalCost = quantity * unitPrice;
    if (this.credits < totalCost) {
      return { success: false, reason: `Insufficient credits. Need ${totalCost} CR (Balance: ${this.credits} CR)` };
    }
    if (!this.hasCargoSpace(quantity)) {
      return { success: false, reason: `Insufficient cargo capacity. Need ${quantity} units (Free: ${this.getAvailableCargoSpace()})` };
    }

    this.credits -= totalCost;
    this.commodityInventory[commodityId] = (this.commodityInventory[commodityId] || 0) + quantity;
    this.recordStockPurchase(stationId, commodityId, quantity);
    this.notify();
    return { success: true, cost: totalCost };
  }

  public sellCommodity(
    commodityId: string,
    quantity: number,
    unitPrice: number
  ): { success: boolean; reason?: string; revenue?: number } {
    if (quantity <= 0) return { success: false, reason: 'Invalid quantity' };
    const owned = this.commodityInventory[commodityId] || 0;
    if (owned < quantity) {
      return { success: false, reason: `Insufficient commodity in cargo (${owned} available)` };
    }

    const totalRevenue = quantity * unitPrice;
    this.commodityInventory[commodityId] -= quantity;
    if (this.commodityInventory[commodityId] <= 0) {
      delete this.commodityInventory[commodityId];
    }
    this.credits += totalRevenue;
    this.notify();
    return { success: true, revenue: totalRevenue };
  }

  public sellSample(
    category: string,
    quantity: number,
    unitPrice: number
  ): { success: boolean; reason?: string; revenue?: number } {
    if (quantity <= 0) return { success: false, reason: 'Invalid quantity' };
    const owned = this.sampleInventory[category] || 0;
    if (owned < quantity) {
      return { success: false, reason: `Insufficient ${category} samples (${owned} available)` };
    }

    const totalRevenue = quantity * unitPrice;
    this.sampleInventory[category] -= quantity;
    if (this.sampleInventory[category] <= 0) {
      delete this.sampleInventory[category];
    }
    this.credits += totalRevenue;
    this.notify();
    return { success: true, revenue: totalRevenue };
  }

  // ==========================================
  // Crafting
  // ==========================================
  public canCraftRecipe(recipe: CraftingRecipe): { canCraft: boolean; reason?: string } {
    if (this.credits < recipe.creditsCost) {
      return { canCraft: false, reason: `Insufficient credits (need ${recipe.creditsCost} CR)` };
    }

    for (const ing of recipe.ingredients) {
      const avail = ing.type === 'SAMPLE' ? (this.sampleInventory[ing.id] || 0) : (this.commodityInventory[ing.id] || 0);
      if (avail < ing.count) {
        return { canCraft: false, reason: `Missing required materials: ${ing.id} (${avail}/${ing.count})` };
      }
    }

    if (recipe.result.type === 'COMMODITY') {
      // Calculate net cargo change: result count minus sample/commodity ingredients consumed
      let consumedUnits = 0;
      for (const ing of recipe.ingredients) {
        consumedUnits += ing.count;
      }
      const netCargoChange = recipe.result.count - consumedUnits;
      if (netCargoChange > 0 && !this.hasCargoSpace(netCargoChange)) {
        return { canCraft: false, reason: `Insufficient cargo capacity for fabricated items` };
      }
    } else if (recipe.result.type === 'MODULE') {
      if (this.installedModules.has(recipe.result.id)) {
        return { canCraft: false, reason: `Module ${recipe.name} is already installed on this vessel` };
      }
    }

    return { canCraft: true };
  }

  public craftRecipe(recipe: CraftingRecipe): { success: boolean; reason?: string; installedModule?: string } {
    const check = this.canCraftRecipe(recipe);
    if (!check.canCraft) {
      return { success: false, reason: check.reason };
    }

    // Deduct credits
    this.credits -= recipe.creditsCost;

    // Deduct ingredients
    for (const ing of recipe.ingredients) {
      if (ing.type === 'SAMPLE') {
        this.sampleInventory[ing.id] = (this.sampleInventory[ing.id] || 0) - ing.count;
        if (this.sampleInventory[ing.id] <= 0) delete this.sampleInventory[ing.id];
      } else {
        this.commodityInventory[ing.id] = (this.commodityInventory[ing.id] || 0) - ing.count;
        if (this.commodityInventory[ing.id] <= 0) delete this.commodityInventory[ing.id];
      }
    }

    // Add result
    let installedModule: string | undefined;
    if (recipe.result.type === 'COMMODITY') {
      this.commodityInventory[recipe.result.id] = (this.commodityInventory[recipe.result.id] || 0) + recipe.result.count;
    } else if (recipe.result.type === 'MODULE') {
      this.installedModules.add(recipe.result.id);
      installedModule = recipe.result.id;
    }

    this.notify();
    return { success: true, installedModule };
  }

  // ==========================================
  // Installed Modules
  // ==========================================
  public getInstalledModules(): Set<string> {
    return new Set(this.installedModules);
  }

  public hasModule(moduleId: string): boolean {
    return this.installedModules.has(moduleId);
  }

  public installModule(moduleId: string): boolean {
    if (this.installedModules.has(moduleId)) return false;
    this.installedModules.add(moduleId);
    this.notify();
    return true;
  }

  // ==========================================
  // Pending Orders
  // ==========================================
  public getPendingOrders(): ModuleOrder[] {
    return [...this.pendingOrders];
  }

  public setPendingOrders(orders: ModuleOrder[]): void {
    this.pendingOrders = [...orders];
    this.notify();
  }

  // ==========================================
  // NPC Memories
  // ==========================================
  public getNpcMemories(): Record<string, NPCMemory> {
    return { ...this.npcMemories };
  }

  public getNpcMemory(npcId: string): NPCMemory | undefined {
    return this.npcMemories[npcId] ? { ...this.npcMemories[npcId] } : undefined;
  }

  public recordNpcInteraction(
    npcId: string,
    captainName: string,
    speciesId: string,
    topic?: string,
    factRevealed?: string
  ): NPCMemory {
    const existing = this.npcMemories[npcId] || {
      npcId,
      name: captainName,
      speciesId,
      timesMet: 0,
      lastMet: 0,
      topicsDiscussed: [],
      factsRevealed: [],
      familiarity: 0.1,
    };

    existing.timesMet = (existing.timesMet || 0) + 1;
    existing.lastMet = Date.now();
    existing.familiarity = Math.min(1.0, (existing.familiarity || 0.1) + 0.15);

    if (topic && !existing.topicsDiscussed.includes(topic)) {
      existing.topicsDiscussed.push(topic);
    }
    if (factRevealed && !existing.factsRevealed.includes(factRevealed)) {
      existing.factsRevealed.push(factRevealed);
    }

    this.npcMemories[npcId] = existing;
    this.notify();
    return { ...existing };
  }

  // ==========================================
  // Discovery Tracking
  // ==========================================
  public getKnownStations(): Set<string> {
    return new Set(this.knownStations);
  }

  public isStationKnown(stationId: string): boolean {
    return this.knownStations.has(stationId);
  }

  public discoverStation(stationId: string): void {
    if (!this.knownStations.has(stationId)) {
      this.knownStations.add(stationId);
      this.notify();
    }
  }

  public getKnownVessels(): Set<string> {
    return new Set(this.knownVessels);
  }

  public isVesselKnown(vesselId: string): boolean {
    return this.knownVessels.has(vesselId);
  }

  public discoverVessel(vesselId: string): void {
    if (!this.knownVessels.has(vesselId)) {
      this.knownVessels.add(vesselId);
      this.notify();
    }
  }

  // ==========================================
  // Collected Credit Pickups
  // ==========================================
  public getCollectedCreditIds(): Set<string> {
    return new Set(this.collectedCreditIds);
  }

  public hasCreditBeenCollected(id: string): boolean {
    return this.collectedCreditIds.has(id);
  }

  public collectCreditPickup(id: string, amount: number): boolean {
    if (this.collectedCreditIds.has(id)) return false;
    this.collectedCreditIds.add(id);
    this.addCredits(amount);
    return true;
  }

  // ==========================================
  // Serialization & Hydration
  // ==========================================
  public loadFromSaveSlot(slot: PlayerSaveSlot): void {
    this.credits = typeof slot.credits === 'number' ? slot.credits : 250;
    this.sampleInventory = slot.sampleInventory ? { ...slot.sampleInventory } : {};
    this.commodityInventory = slot.commodityInventory ? { ...slot.commodityInventory } : {};
    this.installedModules = new Set(slot.installedModules || []);
    this.pendingOrders = slot.pendingOrders ? [...slot.pendingOrders] : [];
    this.npcMemories = slot.npcMemories ? { ...slot.npcMemories } : {};
    this.knownStations = new Set(slot.knownStations || []);
    this.knownVessels = new Set(slot.knownVessels || []);
    this.collectedCreditIds = new Set(slot.collectedCreditIds || []);
    this.marketStockDeltas = slot.marketStockDeltas ? JSON.parse(JSON.stringify(slot.marketStockDeltas)) : {};
    this.baseCargoCapacity = slot.cargoCapacity || 60;
    this.notify();
  }

  public toSaveSlot(baseSlot?: Partial<PlayerSaveSlot>): PlayerSaveSlot {
    return {
      slotId: baseSlot?.slotId || 'current_journey',
      saveVersion: 6, // Strictly version 6
      updatedAt: Date.now(),
      universeSeed: baseSlot?.universeSeed || 'QUIET-DEFAULT-001',
      playerSector: baseSlot?.playerSector || { x: 0, y: 0, z: 0 },
      playerLocalPos: baseSlot?.playerLocalPos || { x: 0, y: 0, z: 100 },
      currentSystem: baseSlot?.currentSystem || null,
      targetSystem: baseSlot?.targetSystem || null,
      flightPhase: baseSlot?.flightPhase || 'SYSTEM_CRUISE',
      credits: this.credits,
      sampleInventory: { ...this.sampleInventory },
      commodityInventory: { ...this.commodityInventory },
      installedModules: Array.from(this.installedModules),
      pendingOrders: [...this.pendingOrders],
      npcMemories: { ...this.npcMemories },
      knownStations: Array.from(this.knownStations),
      knownVessels: Array.from(this.knownVessels),
      collectedCreditIds: Array.from(this.collectedCreditIds),
      marketStockDeltas: JSON.parse(JSON.stringify(this.marketStockDeltas)),
      cargoCapacity: this.baseCargoCapacity,
      stats: baseSlot?.stats || {
        systemsVisited: 1,
        planetsScanned: 0,
        surfacesVisited: 0,
        speciesDiscovered: 0,
        sentientDiscovered: 0,
        loreLearned: 0,
        samplesCollected: 0,
        modulesInstalled: this.installedModules.size,
        anomaliesDiscovered: 0,
        flightTimeSeconds: 0,
      },
      tutorial: baseSlot?.tutorial || {
        started: true,
        completed: false,
        step: 'COMPLETED',
        skipped: true,
      },
      narrative: baseSlot?.narrative || {
        triggeredEventIds: [],
        resonanceFlags: [],
      },
      story: baseSlot?.story,
    };
  }
}
