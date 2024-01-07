import { StateBehavior, getNestedMachine, getTransition } from "@nxg-org/mineflayer-static-statemachine";
import { BehaviorWildcard as Wildcard } from "@nxg-org/mineflayer-static-statemachine/lib/behaviors";

import { FailState, IdleState, SuccessState } from ".";
import { Bot } from "mineflayer";


import { CollectBlock, PlaceBlockNear } from "./movement";

import { Block as mdBlock } from "minecraft-data";
import { onceWithCleanup } from "../utils";

export class CraftItem extends StateBehavior {
  /**
   * I'll handle this later.
   * @param wantedItemId
   * @param amt
   * @param seen
   * @returns
   */
  async recursiveCraft(wantedItemId: number, amt = 1, seen = new Set()): Promise<boolean> {
    const recipies = this.bot.recipesFor(wantedItemId, null, 1, true);

    if (recipies.length === 0) {
      const ret = this.bot.recipesFor(wantedItemId, null, 0, true).length === 0;
      if (!ret) console.log("failed to craft", this.bot.registry.items[wantedItemId].displayName, wantedItemId);
      return ret;
    }

    const ezRecipe = recipies.filter((recipe) => recipe.requiresTable === false);

    if (ezRecipe.length > 0) {
      const toCraft = ezRecipe[0];
      await this.bot.craft(toCraft, amt);
      return true;
    }

    const craftingTableBlock = this.bot.findBlock({
      matching: this.bot.registry.blocksByName.crafting_table.id,
      maxDistance: 5,
    });

    if (!craftingTableBlock) throw new Error("No crafting table found (it is required)");
    const toCraft = recipies[0];
    await this.bot.craft(toCraft, amt, craftingTableBlock);
    return true;
  }
  async onStateEntered(opts: { all?: boolean; amt?: number }, ...wantedItemId: number[]): Promise<void> {
    const all = opts.all ?? false;
    const amt = opts.amt ?? 1;
    for (let i = 0; i < wantedItemId.length; i++) {
      const id = wantedItemId[i];
      const ret = await this.recursiveCraft(id, amt);
      if (!all && ret) return;
    }

    await onceWithCleanup(this.bot.inventory, "updateSlot", { timeout: 10000 });
  }
}

function buildHandleCraftingTable(bot: Bot, maxDistance = 16) {
  const craftingTableId = bot.registry.itemsByName.crafting_table.id;

  const hasCTItem = (state: { bot: Bot }) => {
    return !!state.bot.inventory.items().find((item) => item.name === "crafting_table");
  };

  const hasPlanks = (state: { bot: Bot }) => {
    return state.bot.inventory
      .items()
      .filter((item) => item.name.includes("_planks"))
      .some((item) => item.count >= 4);
  };

  const hasLogs = (state: { bot: Bot }) => {
    return !!state.bot.inventory.items().find((item) => item.name.includes("_log"));
  };

  const logBlockIds = (Object.values(bot.registry.blocksByName) as mdBlock[])
    .filter((block) => block.name.endsWith("_log"))
    .map((block) => block.id);

  const plankItemIds = (Object.values(bot.registry.itemsByName) as mdBlock[])
    .filter((block) => block.name.endsWith("_planks"))
    .map((block) => block.id);

  const woodNearby = (state: { bot: Bot }) => {
    const woodBlock = state.bot.findBlock({
      matching: logBlockIds,
      maxDistance,
    });

    return woodBlock !== null;
  };

  const CTnearby = (state: { bot: Bot }) => {
    const CTBlock = state.bot.findBlock({
      matching: craftingTableId,
      maxDistance,
    });

    return CTBlock !== null;
  };

  const CraftPlanks = CraftItem.clone("CraftPlanks");
  const CraftTable = CraftItem.clone("CraftTable");

  const transitions = [
    getTransition("ensureItems", [IdleState, CollectBlock, CraftPlanks], CraftTable)
      .setShouldTransition((state) => !hasCTItem(state) && hasPlanks(state))
      .setEntryArgs({ amt: 1 }, craftingTableId)
      .build(),

    getTransition("ensureItems", [IdleState, CollectBlock], CraftPlanks)
      .setShouldTransition((state) => !hasCTItem(state) && !hasPlanks(state) && hasLogs(state))
      .setEntryArgs({ amt: 1, all: false }, ...plankItemIds)
      .build(),

    getTransition("acquireCTItems", IdleState, CollectBlock)
      .setShouldTransition((state) => !hasCTItem(state) && woodNearby(state))
      .setEntryArgs(...logBlockIds)
      .build(),

    getTransition("immediatePlace", [IdleState, CraftTable], PlaceBlockNear)
      .setShouldTransition((state) => hasCTItem(state) && !CTnearby(state))
      .setOnTransition(() => console.log("immediatePlace"))
      .setEntryArgs(craftingTableId)
      .build(),

    getTransition("success", PlaceBlockNear, SuccessState)
      .setShouldTransition((state) => true)
      .build(),
  ];

  return getNestedMachine("handleCraftingTable", transitions, IdleState, [SuccessState, FailState]).build();
}

export function buildCraftingMachine(bot: Bot, targetItemId: number, metadata: number | null = null, maxDistance = 16) {
  const craftingTableId = bot.registry.blocksByName.crafting_table.id;

  const findTargetCount = () =>
    bot.inventory
      .items()
      .filter((item) => item.type === targetItemId)
      .reduce((acc, item) => acc + item.count, 0);
  const startCount = findTargetCount();


  const canCraft = (state: StateBehavior) => {
    return state.bot.recipesFor(targetItemId, metadata, 1, true).length > 0;
  };

  const recipeRequiresCraftingTable = (state: StateBehavior) => {
    const withTable = state.bot.recipesFor(targetItemId, metadata, 1, true);
    const withoutTable = state.bot.recipesFor(targetItemId, metadata, 1, false);
    return withTable.length > 0 && withoutTable.length === 0;
  };

  const identCraftingTable = (state: StateBehavior) => {
    return state.bot.findBlock({ matching: craftingTableId, maxDistance }) !== null;
  };

  const HandleCraftingTable = buildHandleCraftingTable(bot, maxDistance);


  const transitions = [
    getTransition("failOut", IdleState, FailState)
      .setShouldTransition((state) => {
        return state.bot.health === 0 || !state.bot.entity.isValid || (canCraft(state) === false && findTargetCount() === startCount);
      })
      .build(),

    getTransition("getCraftingTable", IdleState, HandleCraftingTable)
      .setShouldTransition((state) => recipeRequiresCraftingTable(state) && !identCraftingTable(state))
      .build(),

    getTransition("craftItem", [IdleState, HandleCraftingTable], CraftItem)
      .setEntryArgs({ amt: 1 }, targetItemId)
      .setShouldTransition((state) => !recipeRequiresCraftingTable(state) || identCraftingTable(state))
      .build(),

    getTransition("success", CraftItem, SuccessState)
      .setShouldTransition((state) => findTargetCount() > startCount)
      .build(),
  ];

  return getNestedMachine("craftingMachine", transitions, IdleState, [SuccessState, FailState]).build();
}
