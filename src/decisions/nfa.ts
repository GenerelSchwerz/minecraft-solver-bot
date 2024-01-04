import { v4 } from "uuid";
import { EventEmitter } from "events";
import { StrictEventEmitter } from "strict-event-emitter-types";
import { LogicNode, LogicPath } from ".";

/**
 * The plan is to create a weighted NFA.
 *
 * The NFA will be a graph of nodes with context.
 * Nodes will have defined entry and exit points.
 * Upon entry and exit, the node will be able to modify the context.
 * When traversing the graph, the context will be passed to each node.
 * The context will be copied for each entered child node.
 * Each node will be able to decide if it is allowed to be entered.
 * Each node will be able to decide if it is already completed.
 *
 *
 */

export class NewLogicPath<C, SC> {
  private readonly _nodes: LogicNode<C, SC>[];
  private readonly _simContext: SC;
  private readonly _cost: number;
  public maxDepth: number;

  constructor(simContext: SC, cost: number, ...nodes: LogicNode<C, SC>[]) {
    this._simContext = simContext;
    this._nodes = nodes;
    this._cost = cost;
    this.maxDepth = 20;
  }

  get nodes() {
    return this._nodes;
  }

  get simContext() {
    return this._simContext;
  }

  get cost() {
    return this._cost;
  }

  /**
   * Format node path into: "node1 -> node2 -> node3"
   * If node repeats, replace with "node1 -> node2 x(# of times repeated) -> node3"
   */
  toBetterString() {
    const nodeNames = this._nodes.map((n) => n.name);
    // const nodeNamesUnique = [...new Set(nodeNames)];
    // const nodeNamesCounted = nodeNamesUnique.map((n) => {
    //   const count = nodeNames.filter((nn) => nn === n).length;
    //   return count > 1 ? `${n} x${count}` : n;
    // });
    return nodeNames.join(" -> ");
  }
}

export class WeightedNFAPlanner<C, SC> {
  public maxDepth: number;

  private readonly _root: LogicNode<C, SC>;
  private readonly _simContext: SC;
  private readonly _end: LogicNode<C, SC>;

  private readonly _truncatedNodes: Set<string> = new Set();
  private readonly _childMap: Map<string, LogicNode<C, SC>[]> = new Map();

  constructor(root: LogicNode<C, SC>, end: LogicNode<C, SC>, simContext: SC, maxDepth = 20) {
    this._root = root;
    this._simContext = simContext;
    this._end = end;
    this.maxDepth = maxDepth;

    // this.truncOffChildren(this._root);

    // console.log("size", this._truncatedNodes.size)
    // console.log(this._truncatedNodes.keys())
  }

 

  trunc2(endNode: LogicNode, path: LogicNode[] = [], depth=0) {
    
    if (depth > this.maxDepth) return;
    
    path.push(endNode);
    if (endNode.children.length === 0) {
      if (endNode !== this._end) return;
      for (let i = path.length-1; i > 0; i--) {
        const parent = path[i];
        const child = path[i-1];
        const val = this._childMap.get(parent.uuid) ?? [];
        val.push(child);
        this._childMap.set(parent.uuid, val);
        this._truncatedNodes.add(parent.uuid)
      }
      path = []
      return;
    }

    for (const child of endNode.children) {
      this.trunc2(child, [...path], depth+1);
    }
  }

  truncOffChildren(endNode: LogicNode, path: LogicNode[] = [], depth=0) {
    if (depth > this.maxDepth) return;
    // console.log(path.length, endNode.children.length)
    path.push(endNode);
    if (endNode.children.length === 0) {
      if (endNode !== this._end) return;
    //   console.log(path.map(n=>n.name))
      for (let i = 0; i < path.length-1; i++) {
        const parent = path[i];
        const child = path[i+1];
        console.log(parent.name, '->', child.name)
        const index = parent.children.findIndex(n=>n===child)
        if (index >= 0) 
        parent.children = parent.children.splice(index, 1)


        // delete parent.children[index];
      }
      path = []
      return;
    }



    for (const child of endNode.children) {
      this.truncOffChildren(child, [...path], depth+1);
    }
  }


  plan() {
    const paths = this._plan(this._root, this._simContext, this._end);
    return paths;
  }

  _plan(root: LogicNode<C, SC>, simContext: SC, end: LogicNode<C, SC>, depth = 0, cost = 0): NewLogicPath<C, SC>[] {
    if (depth > this.maxDepth) return [];

    if (!root.shouldEnter(simContext)) return [];

    let addCost;

    if (!root.isAlreadyCompleted(simContext)) {
      root.simExit?.(simContext);
      addCost = root._calculateCost(simContext);
    } else {
      addCost = 0;
    }

    if (root === end) {
      return [new NewLogicPath(simContext, cost + addCost, root)];
    }

    const paths: NewLogicPath<C, SC>[] = [];
    for (const child of root.children) {
      if (!child.shouldEnter(simContext)) continue;
      if (child.isAlreadyCompleted(simContext)) continue;
      const copiedContext = { ...simContext };
      child.simEnter?.(copiedContext);
      const childPaths = this._plan(child, copiedContext, end, depth + 1, cost + addCost);
      for (const path of childPaths) {
        paths.push(new NewLogicPath(path.simContext, path.cost, root, ...path.nodes));
      }
    }
    return paths;
  }

  plan2() {
    const paths = this._plan2(this._root, this._simContext, this._end);
    return paths;
  }

  _plan2(root: LogicNode<C, SC>, simContext: SC, end: LogicNode<C, SC>, depth = 0, cost = 0): NewLogicPath<C, SC>[] {
    if (depth > this.maxDepth) return [];
    if (!this._truncatedNodes.has(root.uuid)) {
      console.log(root.name);
      return [];
    }

    if (!root.shouldEnter(simContext)) return [];

    let addCost;

    if (!root.isAlreadyCompleted(simContext)) {
      root.simExit?.(simContext);
      addCost = root._calculateCost(simContext);
    } else {
      addCost = 0;
    }

    if (root === end) {
      return [new NewLogicPath(simContext, cost + addCost, root)];
    }

    const paths: NewLogicPath<C, SC>[] = [];

    for (const child of this._childMap.get(root.uuid)!) {
      if (!child.shouldEnter(simContext)) continue;
      if (child.isAlreadyCompleted(simContext)) continue;
      const copiedContext = { ...simContext };
      child.simEnter?.(copiedContext);
      const childPaths = this._plan(child, copiedContext, end, depth + 1, cost + addCost);
      for (const path of childPaths) {
        paths.push(new NewLogicPath(path.simContext, path.cost, root, ...path.nodes));
      }
    }
    return paths;
  }
}
