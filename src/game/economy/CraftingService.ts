import type { PlayerSaveSlot } from '../../persistence/SaveManager';
import { CRAFTING_RECIPES, type CraftingRecipe } from './CraftingCatalog';

export interface CraftingValidation {
  canCraft: boolean;
  missingCredits: number;
  missingIngredients: Array<{ id: string; countNeeded: number; countAvailable: number }>;
  cargoFull?: boolean;
}

export class CraftingService {
  public static validateRecipe(saveSlot: PlayerSaveSlot, recipe: CraftingRecipe): CraftingValidation {
    const credits = saveSlot.credits ?? 0;
    const samples = saveSlot.sampleInventory || {};
    const commodities = saveSlot.commodityInventory || {};

    let canCraft = true;
    let missingCredits = 0;
    if (credits < recipe.creditsCost) {
      canCraft = false;
      missingCredits = recipe.creditsCost - credits;
    }

    const missingIngredients: Array<{ id: string; countNeeded: number; countAvailable: number }> = [];

    for (const ing of recipe.ingredients) {
      const avail = ing.type === 'SAMPLE' ? samples[ing.id] || 0 : commodities[ing.id] || 0;
      if (avail < ing.count) {
        canCraft = false;
        missingIngredients.push({
          id: ing.id,
          countNeeded: ing.count,
          countAvailable: avail,
        });
      }
    }

    let cargoFull = false;
    if (recipe.result.type === 'COMMODITY') {
      let consumed = 0;
      for (const ing of recipe.ingredients) consumed += ing.count;
      const netCargoChange = recipe.result.count - consumed;
      if (netCargoChange > 0) {
        const samplesCount = Object.values(samples).reduce((a, b) => a + b, 0);
        const commoditiesCount = Object.values(commodities).reduce((a, b) => a + b, 0);
        const capacity = saveSlot.cargoCapacity ?? 60;
        if (samplesCount + commoditiesCount + netCargoChange > capacity) {
          canCraft = false;
          cargoFull = true;
        }
      }
    }

    return {
      canCraft,
      missingCredits,
      missingIngredients,
      cargoFull,
    };
  }

  public static craftRecipe(
    saveSlot: PlayerSaveSlot,
    recipeId: string
  ): { success: boolean; message: string; recipe?: CraftingRecipe } {
    const recipe = CRAFTING_RECIPES.find((r) => r.id === recipeId);
    if (!recipe) {
      return { success: false, message: 'Recipe not found in fabrication databank' };
    }

    const validation = this.validateRecipe(saveSlot, recipe);
    if (!validation.canCraft) {
      if (validation.cargoFull) {
        return { success: false, message: 'Cargo capacity exceeded' };
      }
      if (validation.missingCredits > 0) {
        return { success: false, message: `Insufficient credits (need ${recipe.creditsCost} CR)` };
      }
      const missingName = validation.missingIngredients[0]?.id;
      return { success: false, message: `Missing required materials: ${missingName}` };
    }

    // Deduct credits
    saveSlot.credits = (saveSlot.credits ?? 0) - recipe.creditsCost;

    // Deduct ingredients
    for (const ing of recipe.ingredients) {
      if (ing.type === 'SAMPLE') {
        saveSlot.sampleInventory[ing.id] = (saveSlot.sampleInventory[ing.id] || 0) - ing.count;
        if (saveSlot.sampleInventory[ing.id] <= 0) {
          delete saveSlot.sampleInventory[ing.id];
        }
      } else {
        if (!saveSlot.commodityInventory) saveSlot.commodityInventory = {};
        saveSlot.commodityInventory[ing.id] = (saveSlot.commodityInventory[ing.id] || 0) - ing.count;
        if (saveSlot.commodityInventory[ing.id] <= 0) {
          delete saveSlot.commodityInventory[ing.id];
        }
      }
    }

    // Add result
    if (recipe.result.type === 'COMMODITY') {
      if (!saveSlot.commodityInventory) saveSlot.commodityInventory = {};
      saveSlot.commodityInventory[recipe.result.id] =
        (saveSlot.commodityInventory[recipe.result.id] || 0) + recipe.result.count;
    } else if (recipe.result.type === 'MODULE') {
      if (!saveSlot.installedModules) saveSlot.installedModules = [];
      if (!saveSlot.installedModules.includes(recipe.result.id)) {
        saveSlot.installedModules.push(recipe.result.id);
      }
    }

    return {
      success: true,
      message: `Fabrication complete: ${recipe.name}`,
      recipe,
    };
  }
}
