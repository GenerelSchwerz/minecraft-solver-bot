import { LogicGraph, LogicNode, findPathsToBeginning, findPathsToEnd, linkNodes } from "./decisions";

/**
 * Class for entry into logic (imagine base/static state.)
 */
class EntryNode extends LogicNode {
  name = "entry";

  public readonly cost = 0;

  calculateCost(): number {
    return this.cost;
  }

  onEnter(): void {}
  onExit(): void {}

  isFinished(): boolean {
    return true;
  }

  isFailed(): boolean {
    return false;
  }

  isInterrupted(): boolean {
    return false;
  }
}

class InterruptNode extends LogicNode {
  name = "interrupt";
  public readonly cost = 0;

  calculateCost(): number {
    return this.cost;
  }

  onEnter(): void {}

  onExit(): void {}

  isFinished(): boolean {
    return true;
  }

  isFailed(): boolean {
    return false;
  }

  isInterrupted(): boolean {
    return false;
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

  isFinished(): boolean {
    return true;
  }

  isFailed(): boolean {
    return Math.random() > 0.8;
  }

  isInterrupted(): boolean {
    return false;
  }
}

const startNode = new EntryNode();
const interruptNode = new InterruptNode();





// const entryNode = new EntryNode();
// const interruptNode = new InterruptNode();

// function addRandomChildren(nodes: LogicNode[] | LogicNode, max_depth: number, children_num: number = 1, depth = 0) {
//   if (max_depth <= depth) return;
//   if (nodes instanceof LogicNode) {
//     nodes = [nodes];
//   }

//   for (const node of nodes) {
//     for (let i = 0; i < children_num; i++) {
//       const cost = Math.floor(Math.random() * 10);
//       node.addChildren(new TestNode(cost, `test node ${cost} ${depth+1}`));
//     }
//     addRandomChildren(node.children, max_depth, children_num, depth + 1);
//   }
// }



// addRandomChildren(entryNode, 3, 3);
// linkNodes(entryNode);


// const test = entryNode.children[0].children[0].children[0];

// const paths = findPathsToEnd(entryNode)!; 
// console.log(paths.map(p=>p.length), paths.length)
// console.log('wanted', test.name);


// const graph = LogicGraph.fromTo(entryNode, test, interruptNode);


// while (!graph.isComplete) {
//   graph.update();
// }

// console.log('got', graph.runningNode.name);
