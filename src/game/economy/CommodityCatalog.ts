export type ResourceCategory =
  | 'RAW_SAMPLE'
  | 'INDUSTRIAL'
  | 'BIO_TECH'
  | 'HIGH_TECH'
  | 'EXOTIC';

export interface CommodityDefinition {
  id: string;
  name: string;
  category: ResourceCategory;
  basePrice: number;
  description: string;
  unit: string;
  rarity: 'COMMON' | 'UNCOMMON' | 'RARE' | 'EXOTIC';
}

export const COMMODITY_CATALOG: CommodityDefinition[] = [
  {
    id: 'titanium_alloy',
    name: 'Titanium-Cobalt Ingot',
    category: 'INDUSTRIAL',
    basePrice: 65,
    description: 'High-tensile structural alloy refined from planetary ores for ship hulls and docking bays.',
    unit: 'ingots',
    rarity: 'COMMON',
  },
  {
    id: 'hydrocarbon_fuel',
    name: 'Liquid Deuterium Fuel',
    category: 'INDUSTRIAL',
    basePrice: 40,
    description: 'Stabilized sub-light reaction propellant used across orbital concourses and transit haulers.',
    unit: 'canisters',
    rarity: 'COMMON',
  },
  {
    id: 'bio_substrate',
    name: 'Bio-Polymer Substrate',
    category: 'BIO_TECH',
    basePrice: 90,
    description: 'Cultured organic polymers harvested from planetary ecosystems, used in biophilic hulls.',
    unit: 'phials',
    rarity: 'UNCOMMON',
  },
  {
    id: 'cryogenic_coolant',
    name: 'Cryogenic Coolant Cell',
    category: 'INDUSTRIAL',
    basePrice: 75,
    description: 'Ultra-cold heat exchange compound essential for reactor shielding and warp coils.',
    unit: 'cells',
    rarity: 'COMMON',
  },
  {
    id: 'plasma_crystals',
    name: 'Refined Plasma Crystal',
    category: 'HIGH_TECH',
    basePrice: 160,
    description: 'Resonantly tuned crystalline matrix that amplifies energy flow through sensor and drive grids.',
    unit: 'crystals',
    rarity: 'RARE',
  },
  {
    id: 'optotronic_circuits',
    name: 'Optotronic Logic Array',
    category: 'HIGH_TECH',
    basePrice: 195,
    description: 'Sub-nanometer photonic computing boards capable of real-time multi-band signal synthesis.',
    unit: 'arrays',
    rarity: 'RARE',
  },
  {
    id: 'harmonic_resonator',
    name: 'Harmonic Flux Core',
    category: 'EXOTIC',
    basePrice: 380,
    description: 'Acoustically tuned dimensional anchor that resonates in phase with ancient tachyon channels.',
    unit: 'cores',
    rarity: 'EXOTIC',
  },
  {
    id: 'xenobiotic_sample',
    name: 'Xenobiotic Genetic Helix',
    category: 'BIO_TECH',
    basePrice: 280,
    description: 'Encrypted genetic sequence from deep xenobiological ecosystems, highly sought by research stations.',
    unit: 'vials',
    rarity: 'RARE',
  },
];

export const RAW_SAMPLE_PRICES: Record<string, number> = {
  MINERAL: 25,
  BIOLOGICAL: 35,
  ATMOSPHERIC: 30,
  CRYSTALLINE: 60,
  RESONANCE: 140,
};
