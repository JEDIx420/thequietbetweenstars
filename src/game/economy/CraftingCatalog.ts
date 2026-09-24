export interface CraftingIngredient {
  type: 'SAMPLE' | 'COMMODITY';
  id: string; // e.g. 'MINERAL', 'titanium_alloy'
  count: number;
}

export interface CraftingRecipe {
  id: string;
  name: string;
  category: 'REFINING' | 'SYNTHESIS' | 'COMPONENTS' | 'ADVANCED';
  creditsCost: number;
  ingredients: CraftingIngredient[];
  result: {
    type: 'COMMODITY' | 'MODULE';
    id: string;
    count: number;
  };
  description: string;
}

export const CRAFTING_RECIPES: CraftingRecipe[] = [
  {
    id: 'craft_titanium_ingot',
    name: 'Smelt Titanium-Cobalt Ingot',
    category: 'REFINING',
    creditsCost: 20,
    ingredients: [
      { type: 'SAMPLE', id: 'MINERAL', count: 2 },
    ],
    result: { type: 'COMMODITY', id: 'titanium_alloy', count: 1 },
    description: 'Compress and smelt raw planetary mineral ores into high-density industrial alloy.',
  },
  {
    id: 'craft_deuterium_fuel',
    name: 'Synthesize Deuterium Fuel',
    category: 'SYNTHESIS',
    creditsCost: 15,
    ingredients: [
      { type: 'SAMPLE', id: 'ATMOSPHERIC', count: 2 },
    ],
    result: { type: 'COMMODITY', id: 'hydrocarbon_fuel', count: 1 },
    description: 'Fractionate atmospheric samples into stabilized reaction propellant.',
  },
  {
    id: 'craft_bio_polymer',
    name: 'Culture Bio-Polymer Substrate',
    category: 'SYNTHESIS',
    creditsCost: 25,
    ingredients: [
      { type: 'SAMPLE', id: 'BIOLOGICAL', count: 2 },
    ],
    result: { type: 'COMMODITY', id: 'bio_substrate', count: 1 },
    description: 'Nurture biological spores into living self-repairing polymers.',
  },
  {
    id: 'craft_cryogenic_coolant',
    name: 'Compound Cryogenic Coolant',
    category: 'REFINING',
    creditsCost: 25,
    ingredients: [
      { type: 'SAMPLE', id: 'ATMOSPHERIC', count: 1 },
      { type: 'SAMPLE', id: 'MINERAL', count: 1 },
    ],
    result: { type: 'COMMODITY', id: 'cryogenic_coolant', count: 1 },
    description: 'Liquefy rare gases with mineral salts to create high-capacity heat sink fluid.',
  },
  {
    id: 'craft_plasma_crystal',
    name: 'Anneal Refined Plasma Crystal',
    category: 'COMPONENTS',
    creditsCost: 50,
    ingredients: [
      { type: 'SAMPLE', id: 'CRYSTALLINE', count: 2 },
      { type: 'SAMPLE', id: 'ATMOSPHERIC', count: 1 },
    ],
    result: { type: 'COMMODITY', id: 'plasma_crystals', count: 1 },
    description: 'Thermally fuse raw crystalline prisms under pressurized atmospheric gas.',
  },
  {
    id: 'craft_optotronic_circuits',
    name: 'Assemble Optotronic Array',
    category: 'COMPONENTS',
    creditsCost: 60,
    ingredients: [
      { type: 'COMMODITY', id: 'titanium_alloy', count: 1 },
      { type: 'SAMPLE', id: 'CRYSTALLINE', count: 1 },
    ],
    result: { type: 'COMMODITY', id: 'optotronic_circuits', count: 1 },
    description: 'Etch photonic waveguides across a titanium baseplate using crystal optics.',
  },
  {
    id: 'craft_harmonic_resonator',
    name: 'Harmonize Flux Core',
    category: 'ADVANCED',
    creditsCost: 120,
    ingredients: [
      { type: 'SAMPLE', id: 'RESONANCE', count: 1 },
      { type: 'COMMODITY', id: 'plasma_crystals', count: 1 },
      { type: 'COMMODITY', id: 'titanium_alloy', count: 1 },
    ],
    result: { type: 'COMMODITY', id: 'harmonic_resonator', count: 1 },
    description: 'Tether a tachyon resonance shard into a stabilized crystalline magnetic chassis.',
  },
  {
    id: 'craft_xenobiotic_helix',
    name: 'Sequence Xenobiotic Helix',
    category: 'ADVANCED',
    creditsCost: 90,
    ingredients: [
      { type: 'SAMPLE', id: 'BIOLOGICAL', count: 3 },
      { type: 'COMMODITY', id: 'bio_substrate', count: 1 },
    ],
    result: { type: 'COMMODITY', id: 'xenobiotic_sample', count: 1 },
    description: 'Synthesize complex exobiological genome markers from frontier organic matter.',
  },
  {
    id: 'craft_harmonic_warp_field',
    name: 'Assemble Harmonic Field Coil',
    category: 'ADVANCED',
    creditsCost: 350,
    ingredients: [
      { type: 'COMMODITY', id: 'harmonic_resonator', count: 1 },
      { type: 'COMMODITY', id: 'optotronic_circuits', count: 1 },
    ],
    result: { type: 'MODULE', id: 'mod_warp_harmonic_field', count: 1 },
    description: 'Fabricate an advanced harmonic field coil module ready for immediate chassis installation.',
  },
];
