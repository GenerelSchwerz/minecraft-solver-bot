import { EntryNode, InterruptNode } from ".";
import { LogicNode } from "../decisions";
import { WeightedNFAPlanner } from "../decisions/nfa";

interface Context {}

interface SimContext {
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
    dirt: 0
};

class CollectWoodNode extends LogicNode<Context, SimContext> {
  name = "collectWood";
  simCtx!: SimContext;

  constructor(public readonly amt: number) {
    super()
  }

  simExit(ctx: SimContext): void {
    ctx.wood += this.amt;
  }

  calculateCost(ctx: SimContext): number {
    if (ctx.woodenAxe) return this.amt * 1;
    return this.amt * 2;
  }
}

class CollectStoneNode extends LogicNode<Context, SimContext> {
  name = "collectStone";

  constructor(public readonly amt: number) {
    super()
  }

  simExit(ctx: SimContext): void {
    ctx.stone += this.amt;
  }

  calculateCost(ctx: SimContext): number {
    if (ctx.woodenPickaxe) return this.amt * 1;
    return this.amt * 5;
  }
}

class CollectDirtNode extends LogicNode<Context, SimContext> {
    name = "collectDirt";

    constructor(public readonly amt: number) {
        super()
      }


  shouldEnter(ctx: SimContext): boolean {
    return ctx.dirt < 4
  }

    calculateCost(ctx: SimContext): number {
        return this.amt * 0.5;
    }

    simExit(ctx: SimContext): void {
        ctx.dirt+=this.amt
    }

}

class CraftWoodenAxeNode extends LogicNode<Context, SimContext> {
  name = "craftWoodenAxe";

  isAlreadyCompleted(ctx: SimContext): boolean {
    return ctx.woodenAxe > 0;
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.wood >= 4;
  }

  simExit(context: SimContext): void {
    context.woodenAxe++;
    context.wood -= 4;
  }
}

class CraftWoodenPickaxeNode extends LogicNode<Context, SimContext> {
  name = "craftWoodenPickaxe";

  isAlreadyCompleted(ctx: SimContext): boolean {
    return ctx.woodenPickaxe > 0;
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.wood >= 4;
  }

  simExit(context: SimContext): void {
    context.woodenPickaxe++;
    context.wood -= 4;
  }
}

class CraftStoneAxeNode extends LogicNode<Context, SimContext> {
  name = "craftStoneAxe";

  isAlreadyCompleted(ctx: SimContext): boolean {
    return ctx.stoneAxe > 0;
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.wood >= 1 && ctx.stone >= 3;
  }

  simExit(context: SimContext): void {
    context.stoneAxe++;
    context.wood -= 1;
    context.stone -= 3;
  }
}

class ChopTreeNode extends LogicNode<Context, SimContext> {
  name = "chopTree";

  calculateCost(ctx: SimContext): number {
    if (ctx.stoneAxe) return 5;
    if (ctx.woodenAxe) return 10;
    return 100;
  }
}


const entryNode = new EntryNode<Context, SimContext>();
const interruptNode = new InterruptNode<Context, SimContext>();

const collectWoodNode = new CollectWoodNode(1);
const collectStoneNode = new CollectStoneNode(1);
const collectDirtNode = new CollectDirtNode(1);
const collectDirtNode1 = new CollectDirtNode(1);


const craftWoodenAxeNode = new CraftWoodenAxeNode();
const craftStoneAxeNode = new CraftStoneAxeNode();
const craftWoodenPickaxeNode = new CraftWoodenPickaxeNode();

const treeNode = new ChopTreeNode();

entryNode.addChildren(collectWoodNode, collectStoneNode, collectDirtNode, craftWoodenAxeNode, craftWoodenPickaxeNode, craftStoneAxeNode, treeNode);
collectWoodNode.addChildren(entryNode);
collectStoneNode.addChildren(entryNode);
collectDirtNode.addChildren(entryNode);
// collectDirtNode1.addChildren(entryNode);
craftStoneAxeNode.addChildren(treeNode);
craftWoodenAxeNode.addChildren(treeNode);
craftWoodenPickaxeNode.addChildren(entryNode)

const planner = new WeightedNFAPlanner(entryNode, treeNode, test1, 25);

const start = performance.now();
let plans = planner.plan();

const end = performance.now();

// plans = plans.filter(n=>n.simContext.stoneAxe>0)

// sort plan by lowest cost
const costs = plans.map((n) => n.cost);
const lowest = costs.reduce((a, b) => (a > b ? b : a));
const index = costs.indexOf(lowest);

// console.log(plans.map((n) => [n.toBetterString(), JSON.stringify(n.simContext), `${n.nodes.length} ${n.cost}`]).join("\n\n"));


console.log("took", end - start, "ms");
console.log(plans[index].toBetterString(), plans[index].cost, plans[index].simContext);