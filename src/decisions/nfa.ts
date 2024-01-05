import { v4 } from "uuid";
import { EventEmitter } from "events";
import { StrictEventEmitter } from "strict-event-emitter-types";
import { LogicNode, LogicPath, findAllChildren } from ".";

/**
 * Given a simulation context, return whether or not a path is achievable.
 */

function isPathAchievable<C, SC>(path: LogicNode<C, SC>[], simContext: SC): [boolean, number, number, number[]] {
  if (path.length === 0) return [false, Infinity, 0, []];
  let cost = 0;
  let keyNodes = 0;
  let prev: LogicNode<C, SC> | null = null;
  const completedIndexes = [];
  for (let i = 0; i < path.length; i++) {
    const node = path[i];

    if (prev !== null) {
      if (prev.isAlreadyCompleted(simContext)) {
        completedIndexes.push(i - 1);
      } else {
        prev.simExit?.(simContext);
      }
    }
    if (!node._shouldEnter(simContext)) return [false, Infinity, keyNodes, completedIndexes];

    let addCost;
    if (node.isAlreadyCompleted(simContext)) {
      addCost = 0;
      completedIndexes.push(i);
    } else if (node.shouldEnter(simContext)) {
      node.simEnter?.(simContext);
      addCost = node._calculateCost(simContext);

      if (addCost > 0) keyNodes++; 
    } else {
      return [false, Infinity, keyNodes, completedIndexes];
    }
    // console.log('adding cost', addCost, 'for index', i, 'node', node.name)
    cost += addCost;

    prev = node;
  }

  if (prev !== null) {
    if (prev.isAlreadyCompleted(simContext)) {
      completedIndexes.push(path.length - 1);
    } else {
      prev.simExit?.(simContext);
    }
  }

  return [true, cost, keyNodes, completedIndexes];
}

/**
 *  Sort from bottom up to ensure that all children are sorted before parents.
 *  Sort children, if child leads to target, that child is leftmost.
 *  Otherwise, sort by its children length.
 *
 */
function sortNodeChildren<C, SC>(target: LogicNode<C, SC>, root: LogicNode<C, SC>, context: C, simContext: SC, maxDepth:number, depth=0, seen = new Set()) {
  if (depth >= maxDepth) return;
  for (const child of root.children) {
    if (child === target) continue;
    if (seen.has(child)) continue;  
    seen.add(child)
    sortNodeChildren(target, child, context, simContext, maxDepth, depth + 1, seen);
  }

  // console.log('hi', depth)
  const children = root.children;
  children.sort((a, b) => {
    if (a === target) return -1;
    if (a === root) return -1;
    if (a.isAlreadyCompleted(simContext)) return -1;
    if (!a.shouldConsider(context)) return 1;
    if (b === target) return 1;
    if (b === root) return 1;
    return b.children.length - a.children.length;
  });

}

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
  private readonly _keyNodes: number;
  public maxDepth: number;

  constructor(simContext: SC, cost: number, keyNodes: number, ...nodes: LogicNode<C, SC>[]) {
    this._simContext = simContext;
    this._nodes = nodes;
    this._cost = cost;
    this._keyNodes = keyNodes;
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

  get keyNodes() {
    return this._keyNodes;
  }

  get last() {
    return this._nodes[this._nodes.length - 1];
  }

  get first() {
    return this._nodes[0];
  }

  /**
   * Format node path into: "node1 -> node2 -> node3"
   * If node repeats, replace with "node1 -> node2 x(# of times repeated) -> node3"
   */
  toBetterString() {
    const nodeNames = this._nodes.map((n, idx) => `${n.name} (#${idx})\n${" ".repeat(idx)}`);
    // const nodeNamesUnique = [...new Set(nodeNames)];
    // const nodeNamesCounted = nodeNamesUnique.map((n) => {
    //   const count = nodeNames.filter((nn) => nn === n).length;
    //   return count > 1 ? `${n} x${count}` : n;
    // });
    return nodeNames.join("");
  }

  next(logicNode: LogicNode<C, SC>) {
    const index = this._nodes.indexOf(logicNode);
    if (index === -1) throw new Error("node not in path");
    if (index === this._nodes.length - 1) throw new Error("no next node");
    return this._nodes[index + 1];
  }

  previous(logicNode: LogicNode<C, SC>) {
    const index = this._nodes.indexOf(logicNode);
    if (index === -1) throw new Error("node not in path");
    if (index === 0) throw new Error("no previous node");
    return this._nodes[index - 1];
  }
}

export class WeightedNFAPlanner<C, SC> {
  public maxDepth: number;

  private readonly _root: LogicNode<C, SC>;
  private readonly _end: LogicNode<C, SC>;

  private readonly _truncatedNodes: Set<LogicNode<C, SC>> = new Set();
  private readonly _childMap: Map<LogicNode<C, SC>, Set<LogicNode<C, SC>>> = new Map();

  constructor(root: LogicNode<C, SC>, end: LogicNode<C, SC>, maxDepth = 20, autosort = false) {
    this._root = root;
    this._end = end;
    this.maxDepth = maxDepth;

    const allChildren = findAllChildren(this._root);

    console.log("all nodes:", allChildren.size);

    // for (const node of allChildren) {
    //   console.log(node.name);
    // }
    this.trunc3();
    this.loadChildren();

    console.log("truncated size:", this._truncatedNodes.size);

    if (autosort) {
      for (const node of this._truncatedNodes) {
        node.sortChildren(this._end);
      }
    }

    // for (const node of this._truncatedNodes) {
    //   console.log(node.name);
    // }
  }

  loadChildren(childrenSet = this._truncatedNodes, childMap = this._childMap) {
    for (const node of childrenSet) {
      const childSet = childMap.get(node) ?? new Set();
      for (const child of node.children) {
        if (childrenSet.has(child)) {
          childSet.add(child);
        }
      }
      childMap.set(node, childSet);
    }
  }

  trunc3(endNode: LogicNode = this._end, ret = this._truncatedNodes, depth = 0): Set<LogicNode> {
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
      this.trunc3(parent, ret, depth + 1);
    }

    return ret;
  }

  bestPlan(plans: NewLogicPath<C, SC>[]): NewLogicPath<C, SC> {
    const costs = plans.map((n) => n.cost);
    const lowest = costs.reduce((a, b) => (a > b ? b : a));
    const index = costs.indexOf(lowest);
    return plans[index];
  }

  plan(context: C, simContext: SC) {
    const paths = this._plan(this._root, simContext, this._end);
    return paths;
  }

  _plan(root: LogicNode<C, SC>, simContext: SC, end: LogicNode<C, SC>, depth = 0, cost = 0): NewLogicPath<C, SC>[] {
    if (depth >= this.maxDepth) return [];

    let addCost;
    if (root.isAlreadyCompleted(simContext)) {
      addCost = 0;
    } else if (root.shouldEnter(simContext)) {
      root.simExit?.(simContext);
      addCost = root._calculateCost(simContext);
    } else {
      return [];
    }

    if (root === end) {
      return [new NewLogicPath(simContext, cost + addCost, 0, root)];
    }

    const paths: NewLogicPath<C, SC>[] = [];
    for (const child of root.children) {
      if (!child._shouldEnter(simContext)) continue;
      const copiedContext = { ...simContext };
      child.simEnter?.(copiedContext);
      const childPaths = this._plan(child, copiedContext, end, depth + 1, cost + addCost);
      for (const path of childPaths) {
        paths.push(new NewLogicPath(path.simContext, path.cost, 0, root, ...path.nodes));
      }
    }
    return paths;
  }

  plan2(simContext: SC) {
    const paths = this._plan2(this._root, simContext, this._end);
    return paths;
  }

  _plan2(root: LogicNode<C, SC>, simContext: SC, end: LogicNode<C, SC>, depth = 0, cost = 0): NewLogicPath<C, SC>[] {
    if (depth >= this.maxDepth) return [];
    if (!this._truncatedNodes.has(root)) return [];

    let addCost;
    if (root.isAlreadyCompleted(simContext)) {
      addCost = 0;
    } else if (root.shouldEnter(simContext)) {
      root.simExit?.(simContext);
      addCost = root._calculateCost(simContext);
    } else {
      return [];
    }

    if (root === end) {
      return [new NewLogicPath(simContext, cost + addCost, 0, root)];
    }

    const paths: NewLogicPath<C, SC>[] = [];

    const got = this._childMap.get(root);
    if (!got) throw new Error("no children");
    for (const child of got.keys()) {
      if (!child._shouldEnter(simContext)) continue;
      const copiedContext = { ...simContext };
      child.simEnter?.(copiedContext);
      const childPaths = this._plan2(child, copiedContext, end, depth + 1, cost + addCost);
      for (const path of childPaths) {
        paths.push(new NewLogicPath(path.simContext, path.cost, 0, root, ...path.nodes));
      }
    }
    return paths;
  }

  plan3(context: C, simContext: SC) {
    const paths = this._plan3(this._root, context, simContext, this._end);
    return paths;
  }

  _plan3(
    root: LogicNode<C, SC>,
    context: C,
    simContext: SC,
    end: LogicNode<C, SC>,
    depth = 0,
    cost = 0,
    shouldConsider = new Map<LogicNode, boolean>(),
    reference: { lowest: number } = { lowest: Infinity }
  ): NewLogicPath<C, SC>[] {
    if (depth >= this.maxDepth) return [];
    if (cost > reference.lowest) return [];
    // if (!this._truncatedNodes.has(root)) return [];
    // if (shouldConsider.get(root) === false) return [];

    let consider = shouldConsider.get(root);
    if (consider === undefined) {
      consider = root.shouldConsider(context);
      shouldConsider.set(root, root.shouldConsider(context));
    }
    if (consider === false) return [new NewLogicPath(simContext, cost, 0)];

    let addCost;
    if (root.isAlreadyCompleted(simContext)) {
      addCost = 0;
    } else if (root.shouldEnter(simContext)) {
      root.simEnter?.(simContext)
      addCost = root._calculateCost(simContext);
      root.simExit?.(simContext);
    } else {
      return [];
    }

    if (root === end) {
      reference.lowest = Math.min(reference.lowest, cost + addCost);
      return [new NewLogicPath(simContext, cost + addCost, 0, root)];
    }

    const paths: NewLogicPath<C, SC>[] = [];

    const got = this._childMap.get(root);
    if (!got) throw new Error("no children");
    for (const child of got.keys()) {
      if (!child._shouldEnter(simContext)) continue;

  
      const copiedContext = { ...simContext };
      // child.simEnter?.(copiedContext);
      const childPaths = this._plan3(child, context, copiedContext, end, depth + 1, cost + addCost, shouldConsider, reference);
      for (const path of childPaths) {
        paths.push(new NewLogicPath(path.simContext, path.cost, 0, root, ...path.nodes));
      }
    }
    return paths;
  }

  /**
   *
   * @param context Real-time context for the plan
   * @param simContext Simulation-time context for the plan
   * @param amt maximum possible number of paths to return, default Infinity for all paths
   * @param costOffset given the lowest solution with cost X, return all next solved solutions with cost X + costOffset
   * @param nodeOffset given the lowest solution with node count X, return all next solved solutions with node count X + nodeOffset
   * @returns many paths
   */
  fastplan(context: C, simContext: SC, amt = Infinity, costOffset = Infinity, nodeOffset = Infinity) {
    const ref = {
      amt: 0,
      lowestCost: Infinity,
      lowestCostOffset: costOffset,
      lowestNodeCount: Infinity,
      lowestNodeCountOffset: nodeOffset, // random number I chose
    };
    console.log(ref);
    const paths = this._fastplan(this._root, context, simContext, this._end, ref, amt, 0, 0, new Map<LogicNode, boolean>());
    return paths;
    // return paths.map((p) => this.postFastPlan(p, {...simContext}));
  }

  _fastplan(
    root: LogicNode<C, SC>,
    context: C,
    simContext: SC,
    end: LogicNode<C, SC>,
    reference: {
      amt: number;
      lowestCost: number;
      lowestCostOffset: number;
      lowestNodeCount: number;
      lowestNodeCountOffset: number;
    },
    amt: number,
    // path: LogicNode<C, SC>[] = [],
    depth = 0,
    cost = 0,
    shouldConsider = new Map<LogicNode, boolean>()
  ): NewLogicPath<C, SC>[] {
    if (depth >= this.maxDepth) return [];
    if (depth >= reference.lowestNodeCount + reference.lowestNodeCountOffset) return [];
    if (reference.amt >= amt) return [];
    if (cost > reference.lowestCost + reference.lowestCostOffset) return [];
    if (!this._truncatedNodes.has(root)) return [];
    if (shouldConsider.get(root) === false) return [];

    let addCost;
    if (root.isAlreadyCompleted(simContext)) {
      addCost = 0;
    } else if (root.shouldEnter(simContext)) {
      root.simExit?.(simContext);
      addCost = root._calculateCost(simContext);
    } else {
      return [];
    }

    if (root === end) {
      // console.log(reference.amt, amt, reference.lowestNodes, depth, reference.lowest, cost + addCost);
      reference.amt++;
      let retPath = new NewLogicPath(simContext, cost + addCost, 0, root);
      // retPath = this.postProcess(retPath, reference.osc);
      reference.lowestCost = Math.min(reference.lowestCost, retPath.cost);
      reference.lowestNodeCount = Math.min(reference.lowestNodeCount, depth);
      return [retPath];
    }

    const paths: NewLogicPath<C, SC>[] = [];

    const got = this._childMap.get(root);
    if (!got) throw new Error("no children");
    for (const child of got.keys()) {
      if (!child._shouldEnter(simContext)) continue;

      // if (!this._truncatedNodes.has(child)) continue;
      const consider = shouldConsider.get(child);
      if (consider === undefined) {
        const val = root.shouldConsider(context);
        shouldConsider.set(root, root.shouldConsider(context));
        if (val === false) continue;
      } else if (consider === false) continue;

      const copiedContext = { ...simContext };
      child.simEnter?.(copiedContext);
      const childPaths = this._fastplan(child, context, copiedContext, end, reference, amt, depth + 1, cost + addCost, shouldConsider);
      for (const path of childPaths) {
        paths.push(new NewLogicPath(path.simContext, path.cost, 0, root, ...path.nodes));
      }
    }
    return paths;
  }

  fastplan2(context: C, simContext: SC, amt: number = Infinity) {
    const ref = {
      c: context,
      osc: { ...simContext },
      amt: 0,
      maxAmt: amt,
      lowest: Infinity,
      lowestShit: Infinity,
      considerMap: new Map<LogicNode, boolean>(),
    };
    const paths = this._fastplan2(this._root, simContext, this._end, ref);
    return paths;
    // return paths.map((p) => this.postProcess(p, {...simContext}));
  }

  _fastplan2(
    root: LogicNode<C, SC>,
    simContext: SC,
    end: LogicNode<C, SC>,
    ref: { c: C; osc: SC; amt: number; maxAmt: number; lowest: number; lowestShit: number; considerMap: Map<LogicNode, boolean> },
    path: LogicNode<C, SC>[] = [],
    depth = 0,
    cost = 0
  ): NewLogicPath<C, SC>[] {
    if (depth >= this.maxDepth) return [];
    if (ref.amt >= ref.maxAmt) return [];
    if (path.length > ref.lowestShit) return [];
    if (cost >= ref.lowest) return [];

    if (!this._truncatedNodes.has(root)) return [];
    if (ref.considerMap.get(root) === false) return [];

    let addCost;
    if (root.isAlreadyCompleted(simContext)) {
      addCost = 0;
    } else if (root.shouldEnter(simContext)) {
      root.simExit?.(simContext);
      addCost = root._calculateCost(simContext);
    } else {
      return [];
    }

    if (root === end) {
      ref.amt++;

      let retPath = new NewLogicPath(simContext, cost + addCost, 0, ...path);
      // retPath = this.postProcess(retPath, ref.osc);
      // console.log('got', newPath.cost, 'vs', oldPath.cost, 'for', newPath.nodes.map(n=>n.name))
      ref.lowest = Math.min(ref.lowest, retPath.cost);
      ref.lowestShit = Math.min(ref.lowestShit, retPath.nodes.length);
      return [retPath];
    }

    const paths: NewLogicPath<C, SC>[] = [];
    for (const child of root.children) {
      if (!child._shouldEnter(simContext)) continue;

      if (child === end) {
        const path1 = this._fastplan2(child, simContext, end, ref, [...path, root, child], depth + 1, cost + addCost);
        if (path1.length === 0) continue;
        paths.push(path1[0]);
        return paths;
      }

      if (!this._truncatedNodes.has(child)) continue;
      const consider = ref.considerMap.get(child);
      if (consider === undefined) {
        const val = root.shouldConsider(ref.c);
        ref.considerMap.set(root, root.shouldConsider(ref.c));
        if (val === false) continue;
      } else if (consider === false) continue;

      const copiedContext = { ...simContext };
      child.simEnter?.(copiedContext);
      const childPaths = this._fastplan2(child, copiedContext, end, ref, [...path, root], depth + 1, cost + addCost);
      for (const path of childPaths) {
        paths.push(path);
      }
    }
    return paths;
  }

  bestplanpartial(
    context: C,
    simContext: SC,
    options: {
      maxSuccessPaths?: number;
      maxPartialPaths?: number;
    } = {}
  ) {


    // sortNodeChildren(this._end, this._root, context, simContext, this.maxDepth);
  
    // console.log('done sorting!')
    const solveRec: { [key: number]: { lowestCost: number; keyNodeNum: number; success: boolean } } = {};

    for (let i = 0; i <= this.maxDepth; i++) {
      solveRec[i] = { lowestCost: Infinity, keyNodeNum: Infinity, success: false };
    }

    const childSet = new Set<LogicNode<C, SC>>();
    const childMap = new Map();
    const considerMap = new Map();

    this.trunc3(this._end, childSet);
    this.loadChildren(childSet, childMap);

    for (const node of childSet) {
      const val = node.shouldConsider(context);
      considerMap.set(node, val);
      // if (val) continue;
      // for (const value of childMap.values()) {
      //   value.delete(node);
      // }
    }

    const ref = {
      c: context,
      amt: 0,
      partialAmt: 0,
      maxAmt: options.maxSuccessPaths ?? Infinity,
      maxPartialAmt: options.maxPartialPaths ?? Infinity,
      lowestSuccessCost: Infinity,
      solveRecord: solveRec,
      considerMap: considerMap,
      childMap: childMap,
    };
    const paths = this._bestplanpartial(this._root, context, simContext, this._end, ref);
    return paths;
    // return paths.map((p) => this.postProcess(p, {...simContext}));
  }

  _bestplanpartial(
    root: LogicNode<C, SC>,
    c: C,
    sc: SC,
    end: LogicNode<C, SC>,
    ref: {
      c: C;
      amt: number;
      partialAmt: number;
      maxAmt: number;
      maxPartialAmt: number;
      lowestSuccessCost: number;
      solveRecord: { [key: number]: { lowestCost: number; keyNodeNum: number; success: boolean } };
      considerMap: Map<LogicNode, boolean>;
      childMap: Map<LogicNode, Set<LogicNode>>;
    },
    depth = 0,
    consequentialNodes = 0, // TODO: potential bug here.
    cost = 0
  ) {
    if (depth >= this.maxDepth) return [];
    if (ref.amt >= ref.maxAmt) return [];
    if (ref.partialAmt >= ref.maxPartialAmt) return [];
    if (cost >= ref.lowestSuccessCost) return [];
    if (cost >= ref.solveRecord[depth].lowestCost) return [];
    if (consequentialNodes > ref.solveRecord[depth].keyNodeNum) return [];

    let consider = ref.considerMap.get(root);

    if (consider === false) {
      if (ref.solveRecord[depth].success === true) return [];
      ref.partialAmt++;
      ref.solveRecord[depth].lowestCost = Math.min(ref.solveRecord[depth].lowestCost, cost);
      ref.solveRecord[depth].keyNodeNum = Math.min(ref.solveRecord[depth].keyNodeNum, consequentialNodes);
      let retPath = new NewLogicPath(sc, cost, consequentialNodes);
      return [retPath];
    }

    let addCost;
    if (root.isAlreadyCompleted(sc)) {
      addCost = 0;
    } else if (root.shouldEnter(sc)) {
      root.simEnter?.(sc);
      addCost = root._calculateCost(sc);
      root.simExit?.(sc);
    } else {
      return [];
    }

    const addConsequential = addCost === 0 ? consequentialNodes : consequentialNodes + 1;

    if (root === end) {
      ref.amt++;
      ref.solveRecord[depth].lowestCost = Math.min(ref.solveRecord[depth].lowestCost, cost + addCost);
      ref.solveRecord[depth].keyNodeNum = Math.min(ref.solveRecord[depth].keyNodeNum, consequentialNodes);
      ref.solveRecord[depth].success = true;
      ref.lowestSuccessCost = Math.min(ref.lowestSuccessCost, cost + addCost);
      let retPath = new NewLogicPath(sc, cost + addCost, consequentialNodes, root);
      return [retPath];
    }

    const paths: NewLogicPath<C, SC>[] = [];

    const newDepth = depth + 1;
    const newCost = cost + addCost;

    const got = ref.childMap.get(root);
    if (!got) throw new Error("no children");
    for (const child of got.keys()) {
      if (!child._shouldEnter(sc)) continue;
      // if (ref.considerMap.get(child) === false) continue;
      const copiedContext = { ...sc };
      const childPaths = this._bestplanpartial(child, c, copiedContext, end, ref, newDepth, addConsequential, newCost);
      for (const path of childPaths) {
        paths.push(new NewLogicPath(path.simContext, path.cost, path.keyNodes, root, ...path.nodes));
      }
    }
    return paths;
  }




  bestplanpartial2(
    context: C,
    simContext: SC,
    options: {
      maxSuccessPaths?: number;
      maxPartialPaths?: number;
    } = {
      maxSuccessPaths: Infinity,
      maxPartialPaths: Infinity,
    }
  ) {
    const ref = {
      c: context,
      osc: { ...simContext },
      amt: 0,
      partialAmt: 0,
      maxAmt: options.maxSuccessPaths ?? Infinity,
      maxPartialAmt: options.maxPartialPaths ?? Infinity,
      lowestSuccessCost: Infinity,
      lowestShit: Infinity,
      considerMap: new Map<LogicNode, boolean>(),
    };

    sortNodeChildren(this._end, this._root, context, simContext, this.maxDepth);
    const paths = this._bestplanpartial2(this._root, simContext, this._end, ref);
    return paths;
    // return paths.map((p) => this.postProcess(p, {...simContext}));

  }


  /**
   *  A new function with same functionality as _bestplanpartial
   * but depth-first search instead of breadth-first search.
   * 
   */
  _bestplanpartial2(
    root: LogicNode<C, SC>,
    simContext: SC,
    end: LogicNode<C, SC>,
    ref: {
      c: C;
      osc: SC;
      amt: number;
      partialAmt: number;
      maxAmt: number;
      maxPartialAmt: number;
      lowestSuccessCost: number;
      lowestShit: number;
      considerMap: Map<LogicNode, boolean>;
    },
    path: LogicNode<C, SC>[] = [],
    depth = 0,
    cost = 0
  ) {
    if (depth >= this.maxDepth) return [];
    if (ref.amt >= ref.maxAmt) return [];
    if (ref.partialAmt >= ref.maxPartialAmt) return [];
    if (cost >= ref.lowestSuccessCost) return [];
    if (cost >= ref.lowestShit) return [];

    if (!this._truncatedNodes.has(root)) return [];
    if (ref.considerMap.get(root) === false) return [];

    let consider = ref.considerMap.get(root);
    if (consider === undefined) {
      consider = root.shouldConsider(ref.c);
      ref.considerMap.set(root, root.shouldConsider(ref.c));
      if (consider === false) return [];
    } else if (consider === false) return [];

    let addCost;
    if (root.isAlreadyCompleted(simContext)) {
      addCost = 0;
    } else if (root.shouldEnter(simContext)) {
      root.simEnter?.(simContext);
      addCost = root._calculateCost(simContext);
      root.simExit?.(simContext);
    } else {
      return [];
    }

    if (root === end) {
      ref.amt++;
      ref.lowestSuccessCost = Math.min(ref.lowestSuccessCost, cost + addCost);
      ref.lowestShit = Math.min(ref.lowestShit, path.length);
      let retPath = new NewLogicPath(simContext, cost + addCost, path.length, ...path, root);
      return [retPath];
    }

    const paths: NewLogicPath<C, SC>[] = [];
    for (const child of root.children) {
      if (!child._shouldEnter(simContext)) continue;

      if (child === end) {
        const path1 = this._bestplanpartial2(child, simContext, end, ref, [...path, root], depth + 1, cost + addCost);
        if (path1.length === 0) continue;
        paths.push(path1[0]);
        return paths;
      }

      if (!this._truncatedNodes.has(child)) continue;
      const consider = ref.considerMap.get(child);
      if (consider === undefined) {
        const val = root.shouldConsider(ref.c);
        ref.considerMap.set(root, root.shouldConsider(ref.c));
        if (val === false) continue;
      } else if (consider === false) continue;

      const copiedContext = { ...simContext };
      child.simEnter?.(copiedContext);
      const childPaths = this._bestplanpartial2(child, copiedContext, end, ref, [...path, root], depth + 1, cost + addCost);
      for (const path of childPaths) {
        paths.push(path);
      }
    }
    return paths;
  }


  postFastPlan(paths: NewLogicPath<C, SC>[], simContext: SC) {
    return paths.map((p) => this.postProcess(p, { ...simContext }));
  }

  postProcess(path: NewLogicPath<C, SC>, simContext: SC) {
    const getSC = () => {
      return { ...simContext };
    };
    const nodes = [...path.nodes];
    const cpSC = getSC();

    const [orgsuc, orgcost, indexes] = isPathAchievable(nodes, cpSC);

    const actualBoundaries: Record<number, number> = {};
    const workingBoundaries: Record<number, number> = {};
    for (const item of this.findLoops(nodes)) {
      const [start, end] = item;
      actualBoundaries[start] = end;
    }

    // console.log(actualBoundaries);

    for (const [start, end] of Object.entries(actualBoundaries).map(([start, end]) => [Number(start), end])) {
      for (let i = 1; i < end - start; i++) {
        const test = [...nodes];
        const cpedSC = getSC();
        test.splice(start, i);
        const offset = i;
        const [success, cost] = isPathAchievable(test, cpedSC);
        if (success) {
          // console.log(
          //   "did it!",
          //   start,
          //   workingBoundaries[start],
          //   offset,
          //   test.map((n) => n.name),
          //   "\n\n",
          //   nodes.map((n) => n.name)
          // );
          if (workingBoundaries[start] === undefined || workingBoundaries[start] - offset === -1) workingBoundaries[start] = offset;
        }
      }
    }

    // console.log(workingBoundaries);
    let shift = 0;
    for (const [start, end] of Object.entries(workingBoundaries).map(([start, end]) => [Number(start), end])) {
      // console.log(
      //   nodes.length,
      //   start,
      //   shift,
      //   start - shift,
      //   end,
      //   nodes.map((n) => n.name),
      //   nodes.slice(start - shift, start - shift + end).map((n) => n.name)
      // );
      nodes.splice(start - shift, end);
      shift += end;
    }

    const cpSC1 = getSC();
    const [success, cost, keyNodes, compIndexes] = isPathAchievable(nodes, cpSC1);

    const paths: NewLogicPath<C, SC>[] = [];
    if (!success) {
      // console.log(nodes.map((n) => n.name));
      // throw new Error("not success");
      paths.push(new NewLogicPath(cpSC1, Infinity, keyNodes, ...nodes));
    } else paths.push(new NewLogicPath(cpSC1, cost, keyNodes, ...nodes));

    if (orgcost > cost) {
      for (const index of compIndexes) {
        const test = nodes.slice(index);
        const cpSC = getSC();
        const [success, cost, keyNodes, compIndexes] = isPathAchievable(test, cpSC);
        if (!success) continue;
        const newPath = new NewLogicPath(cpSC, cost, keyNodes, ...test);
        paths.push(this.postProcess(newPath, simContext));
      }
    }

    const lowest = paths.reduce((a, b) => (a.cost > b.cost ? b : a));
    return lowest;

    // return new NewLogicPath(simContext, cost, ...nodes);
  }

  /**
   * Identify all loops of nodes in a path.
   * Returns the start and end indexes of all loops.
   *
   * TODO: detect all sequences of looped nodes, not just individual node loops.
   * Do that and it should be fully optimized.
   */
  findLoops(path: LogicNode<C, SC>[]): [number, number][] {
    const loops: [number, number][] = [];
    let start = 0;

    while (start < path.length) {
      const node = path[start];
      let i = start + 1;
      for (; i < path.length; i++) {
        const next = path[i];
        if (node.name !== next.name) break;
      }
      loops.push([start, i]);
      const end = path.lastIndexOf(node);
      if (end !== start) {
        start = i;
      } else {
        start++;
      }
    }

    return loops;
  }
}

export interface WeightedNFAHandlerEvents {
  enter: (node: LogicNode) => void;
  exit: (node: LogicNode) => void;
  complete: (node: LogicNode) => void;
  failed: (node: LogicNode) => void;
  interrupt: (node: LogicNode) => void;
}

export class WeightedNFAHandler<C = unknown, SC = unknown> {
  private _root!: LogicNode<C, SC>;
  private _end!: LogicNode<C, SC>;
  private _interrupt!: LogicNode<C, SC>;
  private _planner?: WeightedNFAPlanner<C, SC>;

  private _currentPath?: NewLogicPath<C, SC>;
  private _currentNode?: LogicNode<C, SC>;
  private _prevNode?: LogicNode<C, SC>;

  private readonly context: C;
  private readonly simContext: SC;
  private readonly simContextLive: SC;

  private readonly fastPlanning: boolean;

  private opts: { fast?: boolean; maxDepth?: number; autosort?: boolean };

  constructor(context: C, simContext: SC, opts: { fast?: boolean; maxDepth?: number; autosort?: boolean } = {}) {
    this.context = context;
    this.simContext = simContext;
    this.simContextLive = { ...simContext };
    this.fastPlanning = opts.fast ?? false;
    this.opts = opts;
  }

  get currentPath() {
    return this._currentPath;
  }

  get cost() {
    return this._currentPath?.cost ?? -1;
  }

  get done() {
    if (!this._currentPath) return true;
    if (this._currentPath.nodes.length === 0) return true;
    return this._currentNode !== this._end;
  }

  get handlingInterrupt() {
    return this._currentNode === this._interrupt;
  }

  clear() {
    delete this._currentPath;
  }

  init(start: LogicNode<C, SC>, end: LogicNode<C, SC>, interrupt: LogicNode<C, SC>) {
    if (this._currentPath) this.pathCleanup(this._currentPath);
    if (this._currentNode) this.exitNode(this._currentNode);

    this._root = start;
    this._end = end;
    this._interrupt = interrupt;

    this._planner = new WeightedNFAPlanner(this._root, this._end, this.opts.maxDepth, this.opts.autosort);
    let paths;
    if (this.fastPlanning) {
      paths = this._planner.fastplan(this.context, this.simContext, 1);
      paths = paths.map((p) => this._planner!.postProcess(p, this.simContext));
    } else {
      paths = this._planner.plan(this.context, this.simContext);
    }

    if (paths.length === 0) {
      delete this._currentPath;
      return;
    }
    this._currentPath = this._planner.bestPlan(paths);
  }

  pathCleanup(path: NewLogicPath<C, SC>) {
    for (const node of path.nodes) {
      node.emit("cleanup");
      node.cleanup?.();
    }
  }

  enterNode(node: LogicNode<C, SC>) {
    if (!this._currentPath) throw new Error("no current path");
    if (this._currentNode) this.exitNode(this._currentNode);
    this._currentNode = node;

    if (!node.isAlreadyCompleted(this.simContextLive)) {
      this._currentNode.simEnter?.(this.simContextLive);
      this._currentNode.onEnter?.(this.context);
    }
    this._currentNode.emit("entered");
  }

  exitNode(node: LogicNode<C, SC>) {
    if (this._currentNode !== node) throw new Error("not in node");
    if (!this._currentPath) throw new Error("no current path");
    if (!node.isAlreadyCompleted(this.simContextLive)) {
      node.simExit?.(this.simContextLive);
      node.onExit?.(this.context);
    }

    node.emit("exited");

    this._prevNode = node;
  }

  interruptUpdate() {
    if (this.done) return;
    if (!this._currentPath) throw new Error("not initialized");
    if (this._currentNode !== this._interrupt) throw new Error("not in interrupt node");

    if (this._currentNode.isInterrupted()) {
      this.exitNode(this._currentNode);
      this.clear();
      throw new Error("interrupt node interrupted");
    }

    if (this._currentNode.isFailed()) {
      this.exitNode(this._currentNode);
      this.clear();
      throw new Error("interrupt node failed");
    }

    if (this._currentNode.isFinished()) {
      if (!this._prevNode) throw new Error("no previous node");
      this.enterNode(this._prevNode);
      return;
    }
  }

  update() {
    if (this.done) return;
    if (!this._currentPath) throw new Error("not initialized");
    if (!this._currentNode) {
      this.enterNode(this._currentPath.nodes[0]);
      return;
    }

    if (this.handlingInterrupt) {
      this.interruptUpdate();
      return;
    }

    if (this._currentNode.isInterrupted()) {
      this.enterNode(this._interrupt);
      return;
    }

    if (this._currentNode.isFinished()) {
      if (this._currentNode === this._end) {
        this.exitNode(this._currentNode);
        this.clear();
        return;
      }

      const nextNode = this._currentPath.next(this._currentNode);

      this.enterNode(nextNode);
      return;
    }

    /**
     * Can implement recalculation or sticking to path here.
     * For right now, stick with given path.
     */
    if (this._currentNode.isFailed()) {
      if (this._currentNode === this._root) {
        this.exitNode(this._currentNode);
        throw new Error("root node failed");
      }
      const prevNode = this._currentPath.previous(this._currentNode);
      this.enterNode(prevNode);
      return;
    }
  }
}
