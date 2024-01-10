export { EntryNode, InterruptNode } from "./tests/index";
import { Context, SimContext } from "./constants";
import { LogicNode } from "./decisions";
import { goals } from "mineflayer-pathfinder";
import { Vec3 } from "vec3";
import { GoalExtraCost } from "./goals/GoalExtraCost";

import type { Bot } from "mineflayer";
import { sleep } from "./utils";

import {Item as mdItem} from 'minecraft-data'

abstract class Node extends LogicNode<SimContext, Context> {}

function goalToBlocksOrItems(ctx: Context, blockIds: number[], itemIds: number[], blockCount = 1, itemCount = 1) {
  const blocks =
    blockCount === 0
      ? []
      : ctx.findBlocks({
          matching: blockIds,
          maxDistance: 64,
          count: 256,
        });

  const blockSlice = blocks.slice(0, blockCount);

  const items =
    itemCount === 0
      ? []
      : Object.values(ctx.entities).filter((entity) => {
          const id = entity.getDroppedItem()?.type;
          return id && itemIds.includes(id);
        });

  const itemsSlice = items.sort((a, b) => ctx.entity.position.distanceSquared(a.position) - ctx.entity.position.distanceSquared(b.position)).slice(0, itemCount);

  const blockGoals = blockSlice.map((block) => {
    return new goals.GoalLookAtBlock(new Vec3(block.x, block.y, block.z), ctx.world);
  });

  const itemGoals = itemsSlice.map((item) => {
    const pos = item.position.floored();
    return new goals.GoalGetToBlock(pos.x, pos.y, pos.z);
  });

  return {
    blockGoals,
    itemGoals,
  };
}

function onceWithCleanup<T>(
  emitter: NodeJS.EventEmitter,
  event: string,
  options: { timeout?: number; checkCondition?: (data?: T) => boolean } = {}
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout || 10000;
    const checkCondition = options.checkCondition || (() => true);
    const timeoutId = setTimeout(() => {
      emitter.removeListener(event, listener);
      reject(new Error(`Timeout waiting for ${event}`));
    }, timeout);
    const listener = (data: T) => {
      if (checkCondition(data)) {
        clearTimeout(timeoutId);
        emitter.removeListener(event, listener);
        resolve(data);
      }
    };
    emitter.on(event, listener);
  });
}

export class CollectWoodNode extends Node {
  name = "collectWood";
  woodBlocks: number[] = [];
  woodItems: number[] = [];
  collectedNum = 0;
  slotListener = () => {};

  constructor(public readonly amt: number) {
    super();
  }

  // utility functions

  loadBlocksAndItems(ctx: Bot) {
    this.woodBlocks = [
      ctx.registry.blocksByName.oak_log.id,
      ctx.registry.blocksByName.birch_log.id,
      ctx.registry.blocksByName.spruce_log.id,
      ctx.registry.blocksByName.jungle_log.id,
      ctx.registry.blocksByName.acacia_log.id,
      ctx.registry.blocksByName.dark_oak_log.id,
    ];
    this.woodItems = [
      ctx.registry.itemsByName.oak_log.id,
      ctx.registry.itemsByName.birch_log.id,
      ctx.registry.itemsByName.spruce_log.id,
      ctx.registry.itemsByName.jungle_log.id,
      ctx.registry.itemsByName.acacia_log.id,
      ctx.registry.itemsByName.dark_oak_log.id,
    ];
  }

  // simulation steps

  simExit(ctx: SimContext): void {
    ctx.logs += this.amt;
  }

  calculateCost(ctx: SimContext): number {
    if (ctx.diamondAxe) return ctx.digTimes.wood.diamondAxe * this.amt;
    if (ctx.ironAxe) return ctx.digTimes.wood.ironAxe * this.amt;
    if (ctx.stoneAxe) return ctx.digTimes.wood.stoneAxe * this.amt;
    if (ctx.woodenAxe) return ctx.digTimes.wood.woodenAxe * this.amt;
    return ctx.digTimes.wood.none * this.amt;
  }

  // real-time handling

  isFinished(ctx: Bot): boolean {
    return this.collectedNum >= this.amt;
  }

  async onEnter(ctx: Bot): Promise<void> {
    this.loadBlocksAndItems(ctx);

    const inInventory = () =>
      ctx.inventory
        .items()
        .filter((item) => this.woodItems.includes(item.type))
        .reduce((acc, item) => acc + item.count, 0);

   
    this.collectedNum = inInventory();
    this.slotListener = () => { this.collectedNum = inInventory() };
    ctx.inventory.on("updateSlot", this.slotListener);
    

  

    const { blockGoals, itemGoals } = goalToBlocksOrItems(ctx, this.woodBlocks, this.woodItems, 64, 64);

    const compGoal = new goals.GoalCompositeAny([...blockGoals.map((goal) => new GoalExtraCost(goal, 20)), ...itemGoals]);
    await ctx.pathfinder.goto(compGoal);

    // await ctx.pathfinder.goto(block);
    for (const block of blockGoals) {
      if (block.isEnd(ctx.entity.position.floored() as any)) {
        await ctx.dig(ctx.blockAt(new Vec3(block.pos.x, block.pos.y, block.pos.z))!, true);
        continue; // good to assume we're done here
      }
    }
  }

  onExit(ctx: Bot): void {
    this.collectedNum = 0;
    this.woodBlocks = [];
    this.woodItems = [];
    ctx.inventory.off("updateSlot", this.slotListener);
  }
}

export class CollectStoneNode extends Node {
  name = "collectStone";

  constructor(public readonly amt: number) {
    super();
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.woodenPickaxe > 0 || ctx.stonePickaxe > 0;
  }

  simExit(ctx: SimContext): void {
    ctx.stone += this.amt;
  }

  calculateCost(ctx: SimContext): number {
    if (ctx.diamondPickaxe) return ctx.digTimes.stone.diamondPickaxe * this.amt;
    if (ctx.ironPickaxe) return ctx.digTimes.stone.ironPickaxe * this.amt;
    if (ctx.stonePickaxe) return ctx.digTimes.stone.stonePickaxe * this.amt;
    if (ctx.woodenPickaxe) return ctx.digTimes.stone.woodenPickaxe * this.amt;
    return Infinity;
  }
}

export class CollectIronNode extends Node {
  name = "collectIron";

  constructor(public readonly amt: number) {
    super();
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.stonePickaxe > 0;
  }

  simExit(ctx: SimContext): void {
    ctx.ironOre += this.amt;
  }

  calculateCost(ctx: SimContext): number {
    if (ctx.diamondPickaxe) return ctx.digTimes.ironOre.diamondPickaxe * this.amt;
    if (ctx.ironPickaxe) return ctx.digTimes.ironOre.ironPickaxe * this.amt;
    if (ctx.stonePickaxe) return ctx.digTimes.ironOre.stonePickaxe * this.amt;
    return Infinity;
  }
}

export class CollectDiamondNode extends Node {
  name = "collectDiamond";

  constructor(public readonly amt: number) {
    super();
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.ironPickaxe > 0;
  }

  simExit(ctx: SimContext): void {
    ctx.diamonds += this.amt;
  }

  calculateCost(ctx: SimContext): number {
    if (ctx.diamondPickaxe) return ctx.digTimes.diamonds.diamondPickaxe * this.amt;
    if (ctx.ironPickaxe) return ctx.digTimes.diamonds.ironPickaxe * this.amt;
    return Infinity;
  }
}

export class CollectDirtNode extends Node {
  name = "collectDirt";

  constructor(public readonly amt: number) {
    super();
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.dirt < 4;
  }

  calculateCost(ctx: SimContext): number {
    return this.amt * 0.5;
  }

  simExit(ctx: SimContext): void {
    ctx.dirt += this.amt;
  }
}

export class CraftPlanksNode extends Node {
  name = "craftPlanks";

  constructor(public woodAmt: number) {
    super();
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.logs >= Math.ceil(this.woodAmt);
  }

  simExit(ctx: SimContext): void {
    ctx.logs -= this.woodAmt;
    ctx.planks += this.woodAmt * 4;
  }

  async onEnter(ctx: Bot): Promise<void> {
    const i = ctx.inventory.items().find(i=>i.name.endsWith("_log"))
    if (!i) {
      await ctx.chat('cannot craft logs')
      console.error('yay')
      throw new Error('cannot craft logs')
    }
    const newName = i.name.split('_')[0].concat('_planks')
    console.log(newName)

    const id = ctx.registry.itemsByName[newName].id

    const plan = ctx.planCraftInventory({id: id, count: 1})
    if (!plan.success) {
      await ctx.chat('Plan does not work')
      console.error(plan)
      throw new Error('shit')
    }

    for (const info of plan.recipesToDo) {
      await ctx.craft(info.recipe, info.recipeApplications)
    }

    await ctx.chat('done')
  }
}

export class CraftSticksNode extends Node {
  name = "craftSticks";

  constructor(public woodAmt: number) {
    super();

    if (woodAmt % 2 === 1) throw new Error('Wood amount must be divisible by two')
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.logs >= Math.ceil(this.woodAmt);
  }

  simExit(ctx: SimContext): void {
    ctx.planks -= this.woodAmt;
    ctx.sticks += this.woodAmt * 2;
  }

  async onEnter(ctx: Bot): Promise<void> {
    const plan = ctx.planCraftInventory({id: ctx.registry.itemsByName.stick.id, count: 1})
    if (!plan.success) {
      await ctx.chat('Plan does not work')
      console.error(plan)
      throw new Error('shit')
    }

    for (const info of plan.recipesToDo) {
      await ctx.craft(info.recipe, info.recipeApplications)
    }

    await ctx.chat('done')
  }
}

export class CraftWoodenAxeNode extends Node {
  name = "craftWoodenAxe";

  isAlreadyCompleted(ctx: SimContext): boolean {
    return ctx.woodenAxe > 0;
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.logs >= 3 && ctx.sticks >= 2;
  }

  simExit(ctx: SimContext): void {
    ctx.woodenAxe++;
    ctx.logs -= 3;
    ctx.sticks -= 2;
  }
}

export class CraftWoodenPickaxeNode extends Node {
  name = "craftWoodenPickaxe";

  isAlreadyCompleted(ctx: SimContext): boolean {
    return ctx.woodenPickaxe > 0;
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.logs >= 3 && ctx.sticks >= 2;
  }

  simExit(context: SimContext): void {
    context.woodenPickaxe++;
    context.logs -= 3;
    context.sticks -= 2;
  }
}

export class CraftStoneAxeNode extends Node {
  name = "craftStoneAxe";

  isAlreadyCompleted(ctx: SimContext): boolean {
    return ctx.stoneAxe > 0;
  }

  // shouldConsider(ctx: Context): boolean {
  //     return false;
  // }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.sticks >= 2 && ctx.stone >= 3;
  }

  simExit(context: SimContext): void {
    context.stoneAxe++;
    context.sticks -= 2;
    context.stone -= 3;
  }
}

export class CraftStonePickaxeNode extends Node {
  name = "craftStonePickaxe";

  isAlreadyCompleted(ctx: SimContext): boolean {
    return ctx.stonePickaxe > 0;
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.sticks >= 2 && ctx.stone >= 3;
  }

  simExit(context: SimContext): void {
    context.stonePickaxe++;
    context.sticks -= 2;
    context.stone -= 3;
  }
}

export class CraftIronAxeNode extends Node {
  name = "craftIronAxe";

  isAlreadyCompleted(ctx: SimContext): boolean {
    return ctx.ironAxe > 0;
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.sticks >= 2 && ctx.iron >= 3;
  }

  simExit(context: SimContext): void {
    context.ironAxe++;
    context.sticks -= 2;
    context.iron -= 3;
  }
}

export class CraftIronPickaxeNode extends Node {
  name = "craftIronPickaxe";

  isAlreadyCompleted(ctx: SimContext): boolean {
    return ctx.ironPickaxe > 0;
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.sticks >= 2 && ctx.iron >= 3;
  }

  simExit(context: SimContext): void {
    context.ironPickaxe++;
    context.sticks -= 2;
    context.iron -= 3;
  }
}

export class CraftDiamondPickaxeNode extends Node {
  name = "craftDiamondPickaxe";

  isAlreadyCompleted(ctx: SimContext): boolean {
    return ctx.diamondPickaxe > 0;
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.sticks >= 2 && ctx.diamonds >= 3;
  }

  simExit(context: SimContext): void {
    context.diamondPickaxe++;
    context.sticks -= 2;
    context.diamonds -= 3;
  }
}

export class CraftDiamondAxeNode extends Node {
  name = "craftDiamondAxe";

  isAlreadyCompleted(ctx: SimContext): boolean {
    return ctx.diamondAxe > 0;
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.sticks >= 2 && ctx.diamonds >= 3;
  }

  simExit(context: SimContext): void {
    context.diamondAxe++;
    context.sticks -= 2;
    context.diamonds -= 3;
  }
}

export class CraftFurnaceNode extends Node {
  name = "craftFurnace";

  isAlreadyCompleted(ctx: SimContext): boolean {
    return ctx.furnace > 0;
  }

  // shouldConsider(ctx: Context): boolean {
  //     return false;
  // }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.stone >= 8;
  }

  simExit(context: SimContext): void {
    context.furnace++;
    context.stone -= 8;
  }
}

export class SmeltIronNode extends Node {
  name = "smeltIron";

  woodAmt: number;

  constructor(public amt: number) {
    super();
    this.woodAmt = Math.ceil(amt / 4);
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.logs >= this.woodAmt && ctx.ironOre >= this.amt && ctx.furnace > 0;
  }

  simExit(context: SimContext): void {
    context.logs -= this.woodAmt;
    context.ironOre -= this.amt;
    context.iron += this.amt;
  }
}
