//@ts-ignore

import { EntryNode, InterruptNode, TestNode } from "..";
import { LogicNode, findPathsToBeginning } from "../../decisions";
import { LogicPath, LogicPathGraph } from "../../decisions/old/old";

interface Context {
}

interface SimContext {
  wood: number;
  wantedWood: number;
  woodenAxe: number;
}

const test0: Context = {}

const test1: SimContext = {
  wood: 0,
  wantedWood: 0,
  woodenAxe: 0,
};

class CollectWoodNode extends LogicNode<Context, SimContext> {
  name = "collectWood";
  simCtx!: SimContext

  get woodDiff() {
    return this.simCtx.wantedWood - this.simCtx.wood
  }

  simEnter(ctx: SimContext): void {
    this.simCtx = ctx;
  }

  simExit(ctx: SimContext): void {
    ctx.wood+=this.woodDiff;
  }
  
  calculateCost(ctx: SimContext): number {
    return this.woodDiff * 2;
  
  }
}

class CraftWoodenAxeNode extends LogicNode<Context, SimContext> {
  name = "craftWoodenAxe";

  isAlreadyCompleted(ctx: SimContext): boolean {
    return ctx.woodenAxe > 0;
  }

  shouldEnter(ctx: SimContext): boolean {
    return ctx.wood >= 3;
  }

  simInit(ctx: SimContext): void {
      ctx.wantedWood+=3
  }

  simExit(context: SimContext): void {
    context.woodenAxe++;
    context.wood -= 3;
  }



}

class ChopTreeNode extends LogicNode<Context, SimContext> {
  name = "chopTree";

  calculateCost(ctx: SimContext): number {
    return (ctx.woodenAxe > 0) ? 1 : 10;
  }

}

const entryNode = new EntryNode();
const interruptNode = new InterruptNode();

const collectWoodNode = new CollectWoodNode();
const craftWoodenAxeNode = new CraftWoodenAxeNode();

const treeNode = new ChopTreeNode();

entryNode.addChildren(collectWoodNode, craftWoodenAxeNode, treeNode);
collectWoodNode.addChildren(craftWoodenAxeNode, treeNode);
craftWoodenAxeNode.addChildren(treeNode);



let paths: LogicNode<Context, SimContext>[][] = findPathsToBeginning(treeNode);



async function main() {
  paths = paths.map((p) => p.reverse());
  console.log(paths.map(p=>[p.length, p.map(n=>n.name)]), paths.length)
  const newPaths = paths.map((p) => LogicPath.fromList(test0, test1, p));

  const graph1 = new LogicPathGraph<Context, SimContext>(newPaths, interruptNode);

  // graph1.begin();
  while (!graph1.completed) {

    graph1.update();
    // console.log('updated: ', graph1.runningNode.name)
  }

  console.log("got", graph1.runningNode.name);
}

(async ()=>{main()})()