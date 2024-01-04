import { EntryNode, InterruptNode } from ".";
import { LogicNode } from "../decisions";
import { WeightedNFAPlanner } from "../decisions/nfa";

interface Context {}

interface SimContext {
  diamondAxe: number;
  ironAxe: number;
  sticks: number;
  diamonds: number;
  diamondPickaxe: number;
  ironOre: number;
  ironPickaxe: number;
  furnace: number;
  iron: number;
  stonePickaxe: number;
  dirt: number;
  woodenPickaxe: number;
  stone: number;
  wood: number;
  woodenAxe: number;
  stoneAxe: number;
}

const test0: Context = {};

const test1: SimContext = {
  wood: 0,
  woodenAxe: 0,
  stoneAxe: 0,
  stone: 0,
  woodenPickaxe: 0,
  dirt: 0,
  ironOre: 0,
  ironPickaxe: 0,
  furnace: 0,
  iron: 0,
  stonePickaxe: 0,
  sticks: 0,
  diamonds: 0,
  diamondPickaxe: 0,
  diamondAxe: 0,
  ironAxe: 0
};

abstract class Node extends LogicNode<Context, SimContext> {}

class CollectWoodNode extends Node {
  name = "collectWood";
  simCtx!: SimContext;

  constructor(public readonly amt: number) {
    super();
  }

  simExit(ctx: SimContext): void {
    ctx.wood += this.amt;
  }

  calculateCost(ctx: SimContext): number {
    if (ctx.diamondAxe) return this.amt * 0.25;
    if (ctx.ironAxe) return this.amt * 1;
    if (ctx.stoneAxe) return this.amt * 4;
    if (ctx.woodenAxe) return this.amt * 16;
    return this.amt * 20;
  }
}

class CollectStoneNode extends Node {
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
    if (ctx.diamondPickaxe) return this.amt * 0.25;
    if (ctx.ironPickaxe) return this.amt * 0.5;
    if (ctx.stonePickaxe) return this.amt * 4;
    if (ctx.woodenPickaxe) return this.amt * 16;
    return Infinity;
  }
}

class CollectIronNode extends Node {
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
    if (ctx.stonePickaxe) return this.amt * 1.25;
    return Infinity;
  }
}

class CollectDiamondNode extends Node {
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
    if (ctx.ironPickaxe) return this.amt * 1.25;
    return Infinity;
  }
}

class CollectDirtNode extends Node {
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

class CraftSticksNode extends Node {
  name = "craftSticks";

  constructor(public woodAmt: number) {
    super();
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.wood >= Math.ceil(this.woodAmt);
  }

  simExit(ctx: SimContext): void {
    ctx.wood -= this.woodAmt;
    ctx.sticks += this.woodAmt * 8;
  }
}

class CraftWoodenAxeNode extends Node {
  name = "craftWoodenAxe";

  isAlreadyCompleted(ctx: SimContext): boolean {
    return ctx.woodenAxe > 0;
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.wood >= 3 && ctx.sticks >= 2;
  }

  simExit(ctx: SimContext): void {
    ctx.woodenAxe++;
    ctx.wood -= 3;
    ctx.sticks -= 2;
  }
}

class CraftWoodenPickaxeNode extends Node {
  name = "craftWoodenPickaxe";

  isAlreadyCompleted(ctx: SimContext): boolean {
    return ctx.woodenPickaxe > 0;
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.wood >= 3 && ctx.sticks >= 2;
  }

  simExit(context: SimContext): void {
    context.woodenPickaxe++;
    context.wood -= 3;
    context.sticks -= 2;
  }
}

class CraftStoneAxeNode extends Node {
  name = "craftStoneAxe";

  isAlreadyCompleted(ctx: SimContext): boolean {
    return ctx.stoneAxe > 0;
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.sticks >= 2 && ctx.stone >= 3;
  }

  simExit(context: SimContext): void {
    context.stoneAxe++;
    context.sticks -= 2;
    context.stone -= 3;
  }
}

class CraftStonePickaxeNode extends Node {
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

class CraftIronAxeNode extends Node {
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

class CraftIronPickaxeNode extends Node {
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



class CraftDiamondPickaxeNode extends Node {
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

class CraftDiamondAxeNode extends Node {
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

class CraftFurnaceNode extends Node {
  name = "craftFurnace";

  isAlreadyCompleted(ctx: SimContext): boolean {
    return ctx.furnace > 0;
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.stone >= 8;
  }

  simExit(context: SimContext): void {
    context.furnace++;
    context.stone -= 8;
  }
}

class SmeltIronNode extends Node {
  name = "smeltIron";

  woodAmt: number

  constructor(public amt: number) {
    super();
    this.woodAmt = Math.ceil(amt / 4);
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.wood >= this.woodAmt && ctx.ironOre >= this.amt && ctx.furnace > 0;
  }

  simExit(context: SimContext): void {
    context.wood-= this.woodAmt;
    context.ironOre -= this.amt;
    context.iron += this.amt;
  }
}

const entryNode = new EntryNode<Context, SimContext>();
const interruptNode = new InterruptNode<Context, SimContext>();

const collectDirtNode = new CollectDirtNode(1);
const collectWoodNode = new CollectWoodNode(1);
const collectStoneNode = new CollectStoneNode(1);
const collectIronNode = new CollectIronNode(1);
const collectDiamondNode = new CollectDiamondNode(1);

const craftWoodenAxeNode = new CraftWoodenAxeNode();
const craftStoneAxeNode = new CraftStoneAxeNode();
const craftWoodenPickaxeNode = new CraftWoodenPickaxeNode();
const craftStonePickaxeNode = new CraftStonePickaxeNode();
const craftIronAxeNode = new CraftIronAxeNode();
const craftIronPickaxeNode = new CraftIronPickaxeNode();
const craftDiamondPickaxeNode = new CraftDiamondPickaxeNode();
const craftDiamondAxeNode = new CraftDiamondAxeNode();
const craftSticksNode = new CraftSticksNode(1);
const craftFurnaceNode = new CraftFurnaceNode();

const smeltIronNode = new SmeltIronNode(3);

entryNode.addChildren(
  collectDirtNode,
  collectWoodNode,
  collectStoneNode,
  collectIronNode,
  collectDiamondNode,
  craftWoodenAxeNode,
  craftWoodenPickaxeNode,
  craftStoneAxeNode,
  craftStonePickaxeNode,
  craftIronPickaxeNode,
  craftIronAxeNode,
  craftDiamondPickaxeNode,
  craftDiamondAxeNode,
  craftSticksNode,
  craftFurnaceNode
);

collectDirtNode.addChildren(collectDirtNode);
collectWoodNode.addChildren(collectWoodNode, craftSticksNode);
collectStoneNode.addChildren(collectStoneNode, craftFurnaceNode, craftStoneAxeNode, craftStonePickaxeNode);
collectIronNode.addChildren(collectIronNode, craftFurnaceNode);
collectDiamondNode.addChildren(collectDiamondNode, craftDiamondPickaxeNode);
craftWoodenAxeNode.addChildren(collectWoodNode);
craftWoodenPickaxeNode.addChildren(collectStoneNode);
craftStoneAxeNode.addChildren(collectWoodNode);
craftStonePickaxeNode.addChildren(collectIronNode);
craftIronPickaxeNode.addChildren(collectDiamondNode);
craftIronAxeNode.addChildren(collectWoodNode);
craftDiamondPickaxeNode.addChildren(collectDiamondNode);
craftDiamondAxeNode.addChildren(collectWoodNode);


craftSticksNode.addChildren(
  craftWoodenAxeNode,
  craftWoodenPickaxeNode,
  craftStoneAxeNode,
  craftStonePickaxeNode,
  craftIronPickaxeNode,
  craftIronAxeNode,
  craftDiamondPickaxeNode,
  craftDiamondAxeNode,
);
craftFurnaceNode.addChildren(smeltIronNode);
smeltIronNode.addChildren(collectWoodNode, craftIronPickaxeNode);


const planner = new WeightedNFAPlanner(entryNode, craftFurnaceNode, test1, 40);

const start = performance.now();
let plans = planner.plan2();

const end = performance.now();

// plans = plans.filter(n=>n.simContext.stoneAxe>0)

// sort plan by lowest cost
const costs = plans.map((n) => n.cost);
const lowest = costs.reduce((a, b) => (a > b ? b : a));
const index = costs.indexOf(lowest);

// console.log(plans.map((n) => [n.toBetterString(), JSON.stringify(n.simContext), `${n.nodes.length} ${n.cost}`]).join("\n\n"));

console.log("took", end - start, "ms");
console.log(plans[index].toBetterString(), plans[index].cost, plans[index].simContext, plans[index].nodes.length);
