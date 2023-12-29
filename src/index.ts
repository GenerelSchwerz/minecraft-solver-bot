import { LogicGraph, LogicNode, LogicPath, LogicPathGraph, findPathsToBeginning, findPathsToEnd, linkNodes } from "./decisions";

interface Context {
  wood: number;
  woodenAxe: number;
}
/**
 * Class for entry into logic (imagine base/static state.)
 */
class EntryNode extends LogicNode<Context> {
  name = "entry";

  public cost = 0;
  calculateCost(ctx: Context): void {}
  onEnter?(): void {}
  onExit?(): void {}
}

class InterruptNode extends LogicNode {


  name = "interrupt";
  public readonly cost = 0;

  calculateCost(ctx: unknown): void {
    throw new Error("Method not implemented.");
  }
  onEnter?(): void {
    throw new Error("Method not implemented.");
  }
  onExit?(): void {
    throw new Error("Method not implemented.");
  }

}

class TestNode extends LogicNode {
  constructor(public readonly cost: number, public name: string) {
    super();
    this.cost = cost;
  }

  calculateCost(): number {
    return this.cost;
  }

  onEnter(): void {
    console.log("entering node: " + this.name);
  }

  onExit(): void {
    console.log("exiting node: " + this.name);
  }

  isFailed(): boolean {
    return Math.random() > 0.8;
  }
}

const entryNode = new EntryNode();
const interruptNode = new InterruptNode();

const collectWoodNode = new TestNode(2, "mineWood");
const craftWoodenAxeNode = new TestNode(1, "woodenAxe");

// const entryNode = new EntryNode();
// const interruptNode = new InterruptNode();

function addRandomChildren(nodes: LogicNode[] | LogicNode, max_depth: number, children_num: number = 1, depth = 0) {
  if (max_depth <= depth) return;
  if (nodes instanceof LogicNode) {
    nodes = [nodes];
  }

  for (const node of nodes) {
    for (let i = 0; i < children_num; i++) {
      const cost = Math.floor(Math.random() * 10);
      node.addChildren(new TestNode(cost, `test node ${cost} ${depth+1}`));
    }
    addRandomChildren(node.children, max_depth, children_num, depth + 1);
  }
}

addRandomChildren(entryNode, 3, 3);
linkNodes(entryNode);

const test = entryNode.children[0].children[0].children[0];

let paths = findPathsToBeginning(test);
console.log(paths.map(p=>p.length), paths.length)
console.log('wanted', test.name);

const test1: Context = {
  wood: 0,
  woodenAxe: 0,
}

const graph = LogicGraph.fromTo<Context>(test1, entryNode, test, interruptNode);

while (!graph.isComplete) {
  graph.update();
}

console.log('got', graph.runningNode.name);

// console.log(paths)
paths = paths.map(p=>p.reverse());
const newPaths = paths.map(p=>LogicPath.fromList(test1, p))

const graph1 = new LogicPathGraph(newPaths, interruptNode);

while (!graph1.completed) {
  graph1.update();
}

console.log('got', graph1.runningNode.name);
