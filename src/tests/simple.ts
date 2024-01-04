import { EntryNode, InterruptNode, TestNode } from ".";
import { LogicGraph, LogicNode, LogicPath, LogicPathGraph, findPathsToBeginning, linkNodes } from "../decisions";

function addRandomChildren(nodes: LogicNode[] | LogicNode, max_depth: number, children_num: number = 1, depth = 0) {
  if (max_depth <= depth) return;
  if (nodes instanceof LogicNode) {
    nodes = [nodes];
  }

  for (const node of nodes) {
    for (let i = 0; i < children_num; i++) {
      const cost = Math.floor(Math.random() * 10);
      node.addChildren(new TestNode(cost, `test node ${cost} ${depth + 1}`));
    }
    addRandomChildren(node.children, max_depth, children_num, depth + 1);
  }
}

function main() {
  const entryNode = new EntryNode();
  const interruptNode = new InterruptNode();

  interface Context {}

  interface SimContext {
    wood: number;
    woodenAxe: number;
  }



  const test0: Context = {};

  const test1: SimContext = {
    wood: 0,
    woodenAxe: 0,
  };

  addRandomChildren(entryNode, 5, 3);
  linkNodes(entryNode);

  const test = entryNode.children[0].children[0].children[0];

  let paths = findPathsToBeginning(test);
  console.log(
    paths.map((p) => p.length),
    paths.length
  );
  console.log("wanted", test.name);

  const graph = LogicGraph.fromTo<Context, SimContext>(test0, test1, entryNode, test, interruptNode);

  while (!graph.isComplete) {
    graph.update();
  }

  console.log("got", graph.runningNode.name);

  console.log(paths);
}

main();
