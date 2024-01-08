import { InterruptNode } from ".";
import { LogicNode } from "../decisions";
import { SimulationContext, WeightedNFAPlanner, debugPath } from "../decisions/nfa";
import { NewWeightedNFAPlanner } from "../decisions/nfa2";

interface Context {}

interface SimContext extends SimulationContext {
  diamondAxe: number;
  ironAxe: number;
  stoneAxe: number;
  woodenAxe: number;

  diamondPickaxe: number;
  ironPickaxe: number;
  stonePickaxe: number;
  woodenPickaxe: number;

  diamonds: number;
  iron: number;
  ironOre: number;
  stone: number;
  wood: number;
  dirt: number;

  sticks: number;
  furnace: number;
}

const test0: Context = {};

abstract class Node extends LogicNode<SimContext, Context> {}

class EntryNode<SC, C> extends Node {
  name = "entry";

  shouldEnter(ctx: SimContext): boolean {
    // if (ctx.woodenAxe) {
    //     console.log('wood axe check', ctx.wantedWood <= ctx.wood, ctx.wantedStone <= ctx.stone , ctx.wantedIronOre <= ctx.ironOre , ctx.wantedIron <= ctx.iron , ctx.wantedDirt <= ctx.dirt)
    //     console.log(ctx)
    // }
    return ctx.wood >= 0 && ctx.stone >= 0 && ctx.sticks >= 0 && ctx.iron >= 0 && ctx.ironOre >= 0;
  }
}

class CollectWoodNode extends Node {
  name = "collectWood";

  constructor(public readonly amt: number) {
    super();
  }

  shouldEnter(ctx: SimContext): boolean {
    // console.log(ctx)
    return ctx.wood < 0;
  }

  simExit(ctx: SimContext): void {
    ctx.wood += this.amt;
  }

  calculateCost(ctx: SimContext): number {
    // if (ctx.woodenAxe || ctx.wantedWoodenAxe)
    // console.log(ctx.wantedDiamondAxe, ctx.wantedIronAxe, ctx.wantedStoneAxe, ctx.woodenAxe)
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
    return ctx.stone < 0;
  }

  simEnter(ctx: SimContext): void {
    if (ctx.woodenPickaxe >= 0)
    ctx.woodenPickaxe -= 1;
  }

  simExit(ctx: SimContext): void {
    ctx.stone += this.amt;
  }

  calculateCost(ctx: SimContext): number {
    if (ctx.diamondPickaxe) return this.amt * 0.25;
    if (ctx.ironPickaxe) return this.amt * 1;
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
    return ctx.ironOre < 0;
  }

  simEnter(ctx: SimContext): void {
    if (ctx.stonePickaxe >= 0)
    ctx.stonePickaxe -= 1;
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
    // console.log(ctx.wantedDiamonds, ctx.diamonds)
    return ctx.diamonds < 0;
  }

  simEnter(ctx: SimContext): void {
    if (ctx.ironPickaxe >= 0)
    ctx.ironPickaxe-= 1;
  }

  simExit(ctx: SimContext): void {
    ctx.diamonds += this.amt;
  }

  calculateCost(ctx: SimContext): number {
    if (ctx.diamondAxe) return this.amt * 0.25;
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
    return ctx.dirt < 0;
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
        return ctx.sticks < 0;
    //   return ctx.wantedWood - ctx.wood >= Math.ceil(this.woodAmt) && ctx.sticks < ctx.wantedSticks;
    }

  simExit(ctx: SimContext): void {
    ctx.wood -= this.woodAmt;
    ctx.sticks += this.woodAmt * 8;
  }
}

class CraftWoodenAxeNode extends Node {
  name = "craftWoodenAxe";

  isAlreadyCompleted(ctx: SimContext): boolean {
    // if (ctx.stoneAxe || ctx.wantedStoneAxe) return true;
    return ctx.woodenAxe > 0;
  }

  shouldEnter(ctx: SimContext): boolean {
    // if (ctx.stoneAxe || ctx.wantedStoneAxe) return false;
    return ctx.woodenAxe === -1;
  }

  simEnter(ctx: SimContext): void {
    ctx.wood -= 3;
    ctx.sticks -= 2;
  }

  simExit(ctx: SimContext): void {
    ctx.woodenAxe++;
  }
}

class CraftWoodenPickaxeNode extends Node {
  name = "craftWoodenPickaxe";

  isAlreadyCompleted(ctx: SimContext): boolean {
    return ctx.woodenPickaxe > 0;
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.woodenPickaxe === -1;
  }

  simEnter(ctx: SimContext): void {
    ctx.wood -= 3;
    ctx.sticks -= 2;
  }

  simExit(ctx: SimContext): void {
    ctx.woodenPickaxe++;
  }
}

class CraftStoneAxeNode extends Node {
  name = "craftStoneAxe";

  isAlreadyCompleted(ctx: SimContext): boolean {
    return ctx.stoneAxe > 0;
  }

  // shouldConsider(ctx: Context): boolean {
  //     return false;
  // }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.stoneAxe === -1;
  }

  simEnter(ctx: SimContext): void {
    ctx.stone -= 3;
    ctx.sticks -= 2;
  }

  simExit(ctx: SimContext): void {
    ctx.stoneAxe++;
  }
}

class CraftStonePickaxeNode extends Node {
  name = "craftStonePickaxe";

  isAlreadyCompleted(ctx: SimContext): boolean {
    return ctx.stonePickaxe > 0;
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.stonePickaxe === -1;
    // return ctx.sticks >= 2 && ctx.stone >= 3;
  }

  simEnter(ctx: SimContext): void {
    ctx.sticks -= 2;
    ctx.stone -= 3;
  }

  simExit(ctx: SimContext): void {
    ctx.stonePickaxe++;
  }
}

class CraftIronAxeNode extends Node {
  name = "craftIronAxe";

  isAlreadyCompleted(ctx: SimContext): boolean {
    return ctx.ironAxe > 0;
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.ironAxe < 1;
  }

  simEnter(ctx: SimContext): void {
    ctx.sticks -= 2;
    ctx.iron -= 3;
  }

  simExit(ctx: SimContext): void {
    ctx.ironAxe++;
  }
}

class CraftIronPickaxeNode extends Node {
  name = "craftIronPickaxe";

  isAlreadyCompleted(ctx: SimContext): boolean {
    return ctx.ironPickaxe > 0;
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.ironPickaxe === -1;
  }

  simExit(ctx: SimContext): void {
    ctx.ironPickaxe++;
    ctx.sticks -=2;
    ctx.iron -= 3;
  }
}

class CraftDiamondPickaxeNode extends Node {
  name = "craftDiamondPickaxe";

  isAlreadyCompleted(ctx: SimContext): boolean {
    return ctx.diamondPickaxe > 0;
  }

  // shouldConsider(ctx: Context): boolean {
  //     return false;
  // }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.diamondPickaxe  === -1;
  }

  simEnter(ctx: SimContext): void {
    ctx.sticks -= 2;
    ctx.diamonds -= 3;
  }

  simExit(ctx: SimContext): void {
    ctx.diamondPickaxe++;
  }
}

class CraftDiamondAxeNode extends Node {
  name = "craftDiamondAxe";

  isAlreadyCompleted(ctx: SimContext): boolean {
    return ctx.diamondAxe > 0;
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.diamondAxe === -1;
  }

  simEnter(ctx: SimContext): void {
    ctx.sticks -= 2;
    ctx.diamonds -= 3;
  }

  simExit(ctx: SimContext): void {
    ctx.diamondAxe++;
  }
}

class CraftFurnaceNode extends Node {
  name = "craftFurnace";

  isAlreadyCompleted(ctx: SimContext): boolean {
    return ctx.furnace > 0;
  }

  // shouldConsider(ctx: Context): boolean {
  //     return false;
  // }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.furnace < 1;
  }

  simEnter(ctx: SimContext): void {
    ctx.stone -= 8;
  }

  simExit(ctx: SimContext): void {
    ctx.furnace++;
  }
}

class SmeltIronNode extends Node {
  name = "smeltIron";

  woodAmt: number;

  constructor(public amt: number) {
    super();
    this.woodAmt = Math.ceil(amt / 4);
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.iron < 0;
  }

  simEnter(ctx: SimContext): void {
    ctx.furnace -=1;
    ctx.ironOre -= this.amt;

  }

  simExit(ctx: SimContext): void {
    ctx.wood -= this.woodAmt;
    ctx.ironOre -= this.amt;
    ctx.iron += this.amt;
  }
}

const entryNode = new EntryNode<SimContext, Context>();
const interruptNode = new InterruptNode<SimContext, Context>();

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

const smeltIronNode = new SmeltIronNode(1);

entryNode.addChildren(collectDirtNode, collectWoodNode);

collectDirtNode.addChildren(collectDirtNode);
collectStoneNode.addChildren(collectStoneNode, craftFurnaceNode, craftStoneAxeNode, craftStonePickaxeNode);
collectIronNode.addChildren(collectIronNode, craftFurnaceNode);
collectDiamondNode.addChildren(collectDiamondNode, craftDiamondPickaxeNode);
craftWoodenAxeNode.addChildren(collectWoodNode);
craftWoodenPickaxeNode.addChildren(collectStoneNode);
craftStoneAxeNode.addChildren(collectWoodNode);
craftStonePickaxeNode.addChildren(collectIronNode, craftFurnaceNode);
craftIronPickaxeNode.addChildren(collectDiamondNode);
craftIronAxeNode.addChildren(collectWoodNode);
craftDiamondPickaxeNode.addChildren(collectDiamondNode);
craftDiamondAxeNode.addChildren(collectWoodNode);

collectWoodNode.addChildren(
  collectWoodNode,
  craftSticksNode,
  craftWoodenAxeNode,
  craftWoodenPickaxeNode,
  craftStoneAxeNode,
  craftStonePickaxeNode,
  craftIronPickaxeNode,
  craftIronAxeNode,
  craftDiamondPickaxeNode,
  craftDiamondAxeNode
);
craftSticksNode.addChildren(
  craftWoodenAxeNode,
  craftWoodenPickaxeNode,
  craftStoneAxeNode,
  craftStonePickaxeNode,
  craftIronPickaxeNode,
  craftIronAxeNode,
  craftDiamondPickaxeNode,
  craftDiamondAxeNode
);
craftFurnaceNode.addChildren(collectIronNode, smeltIronNode);
smeltIronNode.addChildren(smeltIronNode, craftIronPickaxeNode, craftIronAxeNode);

let test1: SimContext = {
  diamondAxe: 0,
  ironAxe: 0,
  sticks: 0,
  diamonds: 0,
  diamondPickaxe: 0,
  ironOre: 0,
  ironPickaxe: 0,
  furnace: 0,
  iron: 0,
  stonePickaxe: 0,
  dirt: 0,
  woodenPickaxe: 0,
  stone: 0,
  wood: 0,
  woodenAxe: 0,
  stoneAxe: 0,
  clone() {
    return { ...this };
  },
};

const planner = new NewWeightedNFAPlanner(entryNode, craftFurnaceNode, 21);

function goalfirstplan() {
  const start0 = performance.now();
  const amt = Infinity;
  const partialAmt = Infinity;
  const costOffset = 0;
  const nodeOffset = Infinity;
  const opts = {
    maxSuccessPaths: amt,
    maxPartialPaths: partialAmt,
    costOffset,
    nodeOffset,
    timeout: Infinity,
  };
  const getSC = () => {
    return { ...test1 };
  };
  const paths = planner.goalfirstplan(test0, test1, opts);
  const end0 = performance.now();

  console.log(
    "bestplanpartial took",
    end0 - start0,
    "ms",
    paths.map((c) => c.cost)
  );
  console.log(paths.length, "possible paths");

  if (paths.length === 0) return console.log("No paths discovered, not post processing.");

  const bestPath0 = planner.bestPlan(paths); // paths.sort((a,b)=> b.cost - a.cost)[0]// planner.bestPlan(paths);

  debugPath([...bestPath0.nodes].reverse(), getSC());
  console.log(bestPath0.toBetterString());
  console.log(bestPath0.success, bestPath0.cost, bestPath0.simContext, bestPath0.nodes.length, bestPath0.keyNodes);
}

// bestplanpartial();
console.time("1secInterval");
const interval = setInterval(() => console.log("1secInterval", "hey"), 1000);
console.log(interval);
// normalPlan();
console.log("dummy run");
console.log("---------------------");
// fastPlan();
// console.log('---------------------')
// fastPlan2();
// console.log('---------------------')
goalfirstplan();

clearInterval(interval);
console.timeEnd("1secInterval");
// fastPlan2();
