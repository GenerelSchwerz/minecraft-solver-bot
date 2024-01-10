import { StateBehavior, getNestedMachine, getTransition } from "@nxg-org/mineflayer-static-statemachine";
import { BehaviorWildcard as Wildcard } from "@nxg-org/mineflayer-static-statemachine/lib/behaviors";

import { FailState, IdleState, SuccessState } from ".";
import { Bot } from "mineflayer";

import { CollectBlock, PlaceBlockNear } from "./movement";

import { Block as mdBlock } from "minecraft-data";
import { onceWithCleanup } from "../utils";

export class CraftItem extends StateBehavior {
  name = "craftItem"

  failed = false;

  getInv() {
    return this.bot.inventory.slots
      .filter((i) => !!i)
      .map((i) => {
        return { id: i!.type, count: i!.count };
      });
  }


  getCT() {
    return this.bot.findBlock({
      matching: this.bot.registry.blocksByName.crafting_table.id,
      maxDistance: 5
    })
  }

  async handleCraft(id: number, count: number): Promise<boolean> {
    const plan = await this.bot.planCraftInventory({id, count})
  

    console.log(plan)

    if (!plan.success) {
      this.bot.chat('fuck cant craft this')
      return false;
    };

    let craftingTable;
    if (plan.requiresCraftingTable) {
      craftingTable = this.getCT() ?? undefined;
      if (!craftingTable) {
        this.bot.chat('No crafting table')
        return false;
      }
    }

    for (const info of plan.recipesToDo) {
      this.bot.chat(`Crafting ${this.bot.registry.items[info.recipe.result.id].id} x ${info.recipe.result.count}`)
      await this.bot.craft(info.recipe, info.recipeApplications, craftingTable)
      await this.bot.waitForTicks(10);
    }
    return true;
  }

  async onStateEntered(opts: { all?: boolean; amt?: number }, ...wantedItemId: number[]): Promise<void> {
    const all = opts.all ?? false;
    const amt = opts.amt ?? 1;
    let ret1 = 0;
    for (let i = 0; i < wantedItemId.length; i++) {
      const id = wantedItemId[i];
      const ret = await this.handleCraft(id, amt);
      if (!all && ret) return;
      else if (ret) ret1++;
    }
    if (ret1 === 0) this.failed = true;

  }
}

function buildHandleCraftingTable(bot: Bot, maxDistance = 16) {
  const craftingTableId = bot.registry.itemsByName.crafting_table.id;

  const hasCTItem = (state: { bot: Bot }) => {
    return !!state.bot.inventory.items().find((item) => item.name === "crafting_table");
  };

  const hasCTMats = (state: { bot: Bot }) => {
    const pot = state.bot.planCraftInventory({id: bot.registry.itemsByName.crafting_table.id, count:1})
    return pot.success
  };


  const logBlockIds = (Object.values(bot.registry.blocksByName) as mdBlock[])
    .filter((block) => block.name.endsWith("_log"))
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

  const CraftTable = CraftItem.clone("CraftTable");

  const transitions = [
    getTransition("ensureItems", [IdleState, CollectBlock], CraftTable)
      .setShouldTransition((state) => !hasCTItem(state) && !!hasCTMats(state))
      .setEntryArgs({ amt: 1 }, craftingTableId)
      .build(),

    getTransition("acquireCTItems", IdleState, CollectBlock)
      .setShouldTransition((state) => !hasCTItem(state) && woodNearby(state))
      .setEntryArgs({maxDistance}, ...logBlockIds)
      .build(),

    getTransition("immediatePlace", [IdleState, CraftTable], PlaceBlockNear)
      .setShouldTransition((state) => hasCTItem(state) && !CTnearby(state))
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
    const plan = bot.planCraftInventory({id: targetItemId, count: 1})
    if (plan.requiresCraftingTable) return plan.success && identCraftingTable(state);
    return plan.success
  };

  const recipeRequiresCraftingTable = (state: StateBehavior) => {
    const withTable = state.bot.recipesFor(targetItemId, metadata, 1, true);
    const withoutTable = state.bot.recipesFor(targetItemId, metadata, 1, false);
    console.log(withTable.length , withoutTable.length)
    return true;
    // return withTable.length > 0 && withoutTable.length === 0;
  };

  const identCraftingTable = (state: StateBehavior) => {
    return state.bot.findBlock({ matching: craftingTableId, maxDistance }) !== null;
  };

  const HandleCraftingTable = buildHandleCraftingTable(bot, maxDistance);

  const transitions = [

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

    
    getTransition("success", CraftItem, FailState)
      .setShouldTransition((state) => state.failed)
      .build(),


      getTransition("failOut", IdleState, FailState)
      .setShouldTransition((state) => {
        return state.bot.health === 0 || !state.bot.entity.isValid || (canCraft(state) === false && findTargetCount() === startCount);
      })
      .build(),
  ];

  return getNestedMachine("craftingMachine", transitions, IdleState, [SuccessState, FailState]).build();
}
