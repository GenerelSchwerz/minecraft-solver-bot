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

  private readonly _truncatedNodes: Set<LogicNode<C,SC>> = new Set();
  private readonly _childMap: Map<string, Set<LogicNode<C,SC>>> = new Map();

  constructor(root: LogicNode<C, SC>, end: LogicNode<C, SC>, simContext: SC, maxDepth = 20) {
    this._root = root;
    this._simContext = simContext;
    this._end = end;
    this.maxDepth = maxDepth;

    this.trunc3();
    this.loadChildren()

    // console.log(this._childMap.entries())
  }


  loadChildren() {
    for (const node of this._truncatedNodes) {
      const children = node.children;
      const childSet = this._childMap.get(node.uuid) ?? new Set();
      for (const child of node.children) {
        
        if (this._truncatedNodes.has(child)) {
          childSet.add(child);
        }
      }
      this._childMap.set(node.uuid, childSet);
    }
  }

 

  

  trunc3(endNode: LogicNode = this._end, ret=this._truncatedNodes,  depth=0): Set<LogicNode> {

    // const ret = new Set();


    if (depth >= this.maxDepth) return ret;

    // if (endNode.parents.length === 0) {
    //   if (endNode !== this._root) return ret;
    //   ret.add(endNode);
    //   return ret;
    // }

    if (ret.has(endNode)) return ret;

    ret.add(endNode);
    for (const parent of endNode.parents) {
      this.trunc3(parent, ret, depth+1);
    
    }

    return ret;
  }


  plan() {
    const paths = this._plan(this._root, this._simContext, this._end);
    return paths;
  }

  _plan(root: LogicNode<C, SC>, simContext: SC, end: LogicNode<C, SC>, depth = 0, cost = 0): NewLogicPath<C, SC>[] {
    if (depth >= this.maxDepth) return [];

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
    if (!this._truncatedNodes.has(root)) {
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

    const got = this._childMap.get(root.uuid);
    if (!got) throw new Error("no children");
    for (const child of got.keys()) {
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
