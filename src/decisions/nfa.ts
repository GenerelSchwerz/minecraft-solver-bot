import { v4 } from "uuid";
import { EventEmitter } from "events";
import { StrictEventEmitter } from "strict-event-emitter-types";
import { LogicNode, LogicPath, findAllChildren } from ".";

/**
 * Given a simulation context, return whether or not a path is achievable.
 */

function isPathAchievable<C, SC>(path: LogicNode<C, SC>[], simContext: SC): [boolean, number, number[]] {
  let cost = 0;
  const completedIndexes = [];
  for (let i = 1; i < path.length; i++) {
    const parent = path[i - 1];
    const child = path[i];
    if (!parent._shouldEnter(simContext)) return [false, Infinity, completedIndexes];
    if (!parent.children.includes(child)) return [false, Infinity, completedIndexes];

    let addCost;
    if (parent.isAlreadyCompleted(simContext)) {
      addCost = 0;
      completedIndexes.push(i);
    } else if (parent.shouldEnter(simContext)) {
      parent.simExit?.(simContext);
      addCost = child._calculateCost(simContext);
    } else {
      return [false, Infinity, completedIndexes];
    }

    cost += addCost;

    if (!child._shouldEnter(simContext)) return [false, Infinity, completedIndexes];
    child.simEnter?.(simContext);
  }
  const final = path[path.length - 1];

  if (final.isAlreadyCompleted(simContext)) {
    completedIndexes.push(path.length - 1);
    return [true, cost, completedIndexes];
  } else {
    final.simExit?.(simContext);
    const addCost = final._calculateCost(simContext);
    cost += addCost;
  }
  return [true, cost, completedIndexes];
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
    const nodeNames = this._nodes.map((n, idx) => `${n.name} (#${idx})`);
    // const nodeNamesUnique = [...new Set(nodeNames)];
    // const nodeNamesCounted = nodeNamesUnique.map((n) => {
    //   const count = nodeNames.filter((nn) => nn === n).length;
    //   return count > 1 ? `${n} x${count}` : n;
    // });
    return nodeNames.join(" ->");
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

    // const allChildren = findAllChildren(this._root);

    // console.log("all nodes:", allChildren.size);

    // for (const node of allChildren) {
    //   console.log(node.name);
    // }
    this.trunc3();
    this.loadChildren();

    if (autosort) {
      for (const node of this._truncatedNodes) {
        node.sortChildren(this._end);
      }
    }

    // console.log("truncated size:", this._truncatedNodes.size);

    // for (const node of this._truncatedNodes) {
    //   console.log(node.name);
    // }
  }

  loadChildren() {
    for (const node of this._truncatedNodes) {
      const childSet = this._childMap.get(node) ?? new Set();
      for (const child of node.children) {
        if (this._truncatedNodes.has(child)) {
          childSet.add(child);
        }
      }
      this._childMap.set(node, childSet);
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

  plan(simContext: SC) {
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
      return [new NewLogicPath(simContext, cost + addCost, root)];
    }

    const paths: NewLogicPath<C, SC>[] = [];
    for (const child of root.children) {
      if (!child._shouldEnter(simContext)) continue;
      const copiedContext = { ...simContext };
      child.simEnter?.(copiedContext);
      const childPaths = this._plan(child, copiedContext, end, depth + 1, cost + addCost);
      for (const path of childPaths) {
        paths.push(new NewLogicPath(path.simContext, path.cost, root, ...path.nodes));
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
      return [new NewLogicPath(simContext, cost + addCost, root)];
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
        paths.push(new NewLogicPath(path.simContext, path.cost, root, ...path.nodes));
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
    shouldConsider = new Map<LogicNode, boolean>()
  ): NewLogicPath<C, SC>[] {
    if (depth >= this.maxDepth) return [];
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
      return [new NewLogicPath(simContext, cost + addCost, root)];
    }

    const paths: NewLogicPath<C, SC>[] = [];

    const got = this._childMap.get(root);
    if (!got) throw new Error("no children");
    for (const child of got.keys()) {
      if (!child._shouldEnter(simContext)) continue;

      if (!this._truncatedNodes.has(child)) continue;
      const consider = shouldConsider.get(child);
      if (consider === undefined) {
        const val = root.shouldConsider(context);
        shouldConsider.set(root, root.shouldConsider(context));
        if (val === false) continue;
      } else if (consider === false) continue;

      const copiedContext = { ...simContext };
      child.simEnter?.(copiedContext);
      const childPaths = this._plan3(child, context, copiedContext, end, depth + 1, cost + addCost, shouldConsider);
      for (const path of childPaths) {
        paths.push(new NewLogicPath(path.simContext, path.cost, root, ...path.nodes));
      }
    }
    return paths;
  }

  fastplan(simContext: SC, amt: number) {
    const paths = this._fastplan(this._root, simContext, this._end, amt);
    return paths
    // return paths.map((p) => this.postFastPlan(p, {...simContext}));
  }

  _fastplan(
    root: LogicNode<C, SC>,
    simContext: SC,
    end: LogicNode<C, SC>,
    amt: number,
    path: LogicNode<C, SC>[] = [],
    depth = 0,
    cost = 0,
    done: { amt: number } = { amt: 0 }
  ): NewLogicPath<C, SC>[] {
    if (done.amt >= amt) return [];


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


    if (done.amt < amt && root === end) {
      done.amt++;
      return [new NewLogicPath(simContext, cost + addCost, ...path)];
    }

    const paths: NewLogicPath<C, SC>[] = [];
    for (const child of root.children) {
      if (!child._shouldEnter(simContext)) continue;
      if (child === end) {
        const path1 = this._fastplan(child, simContext, end, amt, [...path, root, child], depth + 1, cost + addCost, done);
        if (path1.length === 0) continue;
        paths.push(path1[0]);
        return paths;
      }
      const copiedContext = { ...simContext };
      child.simEnter?.(copiedContext);
      const childPaths = this._fastplan(child, copiedContext, end, amt, [...path, root], depth + 1, cost + addCost, done);
      for (const path of childPaths) {
        paths.push(path);
      }
    }
    return paths;
  }

  postFastPlan(path: NewLogicPath<C, SC>, simContext: SC) {

    const getSC = () => { return { ...simContext } };
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
          //   start,
          //   workingBoundaries[start],
          //   offset,
          //   test.map((n) => n.name)
          // );
          if (workingBoundaries[start] === undefined || workingBoundaries[start] - offset === -1) workingBoundaries[start] = offset;
        }
      }
    }

    let shift = 0;
    for (const [start, end] of Object.entries(workingBoundaries).map(([start, end]) => [Number(start), end])) {
      // console.log(
      //   start,
      //   end,
      //   nodes.map((n) => n.name)
      // );
      nodes.splice(start - shift, end);
      shift = end;
    }

    const cpSC1 = getSC();
    const [success, cost, compIndexes] = isPathAchievable(nodes, cpSC1);

    const paths: NewLogicPath<C, SC>[] = [];
    if (!success) paths.push(new NewLogicPath(cpSC1, Infinity, ...nodes));
    else paths.push(new NewLogicPath(cpSC1, cost, ...nodes));

    // if (orgcost > cost) {
    //   for (const index of compIndexes) {
    //     const test = nodes.slice(index);
    //     const cpSC = getSC()
    //     const [success, cost, compIndexes] = isPathAchievable(test, cpSC);
    //     if (!success) continue;
    //     const newPath = new NewLogicPath(cpSC, cost, ...test);
    //     paths.push(this.postFastPlan(newPath, simContext));
    //   }
    // }

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
