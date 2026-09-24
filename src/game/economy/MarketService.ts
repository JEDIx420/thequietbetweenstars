import type { PlayerSaveSlot } from '../../persistence/SaveManager';
import { COMMODITY_CATALOG, RAW_SAMPLE_PRICES } from './CommodityCatalog';
import type { StationArchetype } from '../population/PopulationTypes';
import { SeededRandom } from '../universe/SeededRandom';

export interface MarketPriceQuote {
  id: string;
  name: string;
  category: string;
  buyPrice: number;   // Price player pays to BUY from station
  sellPrice: number;  // Price player receives to SELL to station
  stationStock: number;
}

export class MarketService {
  /**
   * Deterministically calculates prices and stock for a station based on archetype and system seed.
   */
  public static getMarketQuotes(
    archetype: StationArchetype,
    systemSeed: number,
    stationId: string
  ): { commodities: MarketPriceQuote[]; samples: MarketPriceQuote[] } {
    const seed = systemSeed + SeededRandom.hashString(stationId);
    const rng = new SeededRandom(seed);

    const commodities: MarketPriceQuote[] = COMMODITY_CATALOG.map((item) => {
      let multiplier = 1.0;

      // Archetype supply/demand curves
      switch (archetype) {
        case 'MINING_REFINERY':
          if (item.id === 'titanium_alloy' || item.id === 'hydrocarbon_fuel') {
            multiplier *= 0.75; // Abundant supply
          } else if (item.id === 'bio_substrate' || item.id === 'cryogenic_coolant') {
            multiplier *= 1.35; // High demand
          }
          break;

        case 'RESEARCH_ARRAY':
          if (item.id === 'optotronic_circuits' || item.id === 'plasma_crystals') {
            multiplier *= 0.85; // Laboratory surplus
          } else if (item.id === 'harmonic_resonator' || item.id === 'xenobiotic_sample') {
            multiplier *= 1.45; // Scientific demand
          }
          break;

        case 'SHIPYARD':
          if (item.id === 'titanium_alloy' || item.id === 'cryogenic_coolant') {
            multiplier *= 1.3; // Heavy consumption
          } else if (item.id === 'optotronic_circuits') {
            multiplier *= 0.9;
          }
          break;

        case 'ALIEN_BIOSTATION':
          if (item.id === 'bio_substrate' || item.id === 'xenobiotic_sample') {
            multiplier *= 0.7; // Abundant exobiology
          } else if (item.id === 'plasma_crystals' || item.id === 'titanium_alloy') {
            multiplier *= 1.4; // Foreign imports
          }
          break;

        case 'ORBITAL_HABITAT':
          if (item.id === 'hydrocarbon_fuel' || item.id === 'bio_substrate') {
            multiplier *= 1.15;
          }
          break;

        case 'TRADE_HUB':
        default:
          multiplier *= 0.95 + rng.next() * 0.1; // Moderate, liquid
          break;
      }

      // Small deterministic variance (+/- 12%)
      const variance = 0.88 + rng.next() * 0.24;
      const baseAdjusted = Math.round(item.basePrice * multiplier * variance);

      const buyPrice = Math.max(10, Math.round(baseAdjusted * 1.15));
      const sellPrice = Math.max(5, Math.round(baseAdjusted * 0.85));
      const stationStock = rng.rangeInt(10, 85);

      return {
        id: item.id,
        name: item.name,
        category: item.category,
        buyPrice,
        sellPrice,
        stationStock,
      };
    });

    // Sample sell quotes (stations buying raw samples from explorers)
    const samples: MarketPriceQuote[] = Object.entries(RAW_SAMPLE_PRICES).map(([cat, baseVal]) => {
      let mult = 1.0;
      if (archetype === 'MINING_REFINERY' && cat === 'MINERAL') mult = 0.7;
      if (archetype === 'RESEARCH_ARRAY' && (cat === 'RESONANCE' || cat === 'BIOLOGICAL')) mult = 1.5;
      if (archetype === 'ALIEN_BIOSTATION' && cat === 'BIOLOGICAL') mult = 0.8;
      if (archetype === 'ALIEN_BIOSTATION' && cat === 'CRYSTALLINE') mult = 1.4;
      if (archetype === 'SHIPYARD' && cat === 'MINERAL') mult = 1.25;

      const variance = 0.9 + rng.next() * 0.2;
      const sellPrice = Math.round(baseVal * mult * variance);

      return {
        id: cat,
        name: `${cat} SAMPLES`,
        category: 'RAW_SAMPLE',
        buyPrice: Math.round(sellPrice * 1.4), // If station were to sell
        sellPrice,
        stationStock: 0,
      };
    });

    return { commodities, samples };
  }

  /**
   * Executes an atomic purchase of commodities from a station.
   */
  public static buyCommodity(
    saveSlot: PlayerSaveSlot,
    commodityId: string,
    quantity: number,
    archetype: StationArchetype,
    systemSeed: number,
    stationId: string
  ): { success: boolean; message: string; cost?: number } {
    if (quantity <= 0) return { success: false, message: 'Invalid quantity' };

    const quotes = this.getMarketQuotes(archetype, systemSeed, stationId);
    const quote = quotes.commodities.find((c) => c.id === commodityId);
    if (!quote) return { success: false, message: 'Commodity not traded at this station' };

    const totalCost = quote.buyPrice * quantity;
    const currentCredits = saveSlot.credits ?? 0;
    if (currentCredits < totalCost) {
      return {
        success: false,
        message: `Insufficient credits. Need ${totalCost} CR (Balance: ${currentCredits} CR)`,
      };
    }

    // Deduct credits
    saveSlot.credits = currentCredits - totalCost;

    // Add to commodity inventory
    if (!saveSlot.commodityInventory) {
      saveSlot.commodityInventory = {};
    }
    saveSlot.commodityInventory[commodityId] = (saveSlot.commodityInventory[commodityId] || 0) + quantity;

    return {
      success: true,
      message: `Purchased ${quantity}x ${quote.name} for ${totalCost} CR`,
      cost: totalCost,
    };
  }

  /**
   * Executes an atomic sale of commodities to a station.
   */
  public static sellCommodity(
    saveSlot: PlayerSaveSlot,
    commodityId: string,
    quantity: number,
    archetype: StationArchetype,
    systemSeed: number,
    stationId: string
  ): { success: boolean; message: string; revenue?: number } {
    if (quantity <= 0) return { success: false, message: 'Invalid quantity' };

    const owned = saveSlot.commodityInventory?.[commodityId] || 0;
    if (owned < quantity) {
      return { success: false, message: `Insufficient stock in cargo (${owned} available)` };
    }

    const quotes = this.getMarketQuotes(archetype, systemSeed, stationId);
    const quote = quotes.commodities.find((c) => c.id === commodityId);
    if (!quote) return { success: false, message: 'Commodity not recognized' };

    const revenue = quote.sellPrice * quantity;
    saveSlot.credits = (saveSlot.credits ?? 0) + revenue;
    saveSlot.commodityInventory![commodityId] -= quantity;
    if (saveSlot.commodityInventory![commodityId] <= 0) {
      delete saveSlot.commodityInventory![commodityId];
    }

    return {
      success: true,
      message: `Sold ${quantity}x ${quote.name} for +${revenue} CR`,
      revenue,
    };
  }

  /**
   * Executes an atomic sale of raw collected samples to a station.
   */
  public static sellSample(
    saveSlot: PlayerSaveSlot,
    sampleCategory: string,
    quantity: number,
    archetype: StationArchetype,
    systemSeed: number,
    stationId: string
  ): { success: boolean; message: string; revenue?: number } {
    if (quantity <= 0) return { success: false, message: 'Invalid quantity' };

    const sampleCounts = saveSlot.sampleInventory || {};
    const owned = sampleCounts[sampleCategory] || 0;
    if (owned < quantity) {
      return { success: false, message: `Insufficient ${sampleCategory} samples (${owned} available)` };
    }

    const quotes = this.getMarketQuotes(archetype, systemSeed, stationId);
    const quote = quotes.samples.find((s) => s.id === sampleCategory);
    const unitPrice = quote ? quote.sellPrice : RAW_SAMPLE_PRICES[sampleCategory] || 25;
    const revenue = unitPrice * quantity;

    saveSlot.credits = (saveSlot.credits ?? 0) + revenue;
    saveSlot.sampleInventory[sampleCategory] -= quantity;
    if (saveSlot.sampleInventory[sampleCategory] <= 0) {
      delete saveSlot.sampleInventory[sampleCategory];
    }

    return {
      success: true,
      message: `Sold ${quantity}x ${sampleCategory} samples for +${revenue} CR`,
      revenue,
    };
  }
}
