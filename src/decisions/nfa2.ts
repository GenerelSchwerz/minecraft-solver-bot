import { LogicNode } from ".";
import { SimulationContext } from "./nfa";

export class NewLogicPath<SC extends SimulationContext, C> {
  private readonly _success: boolean;
  private readonly _nodes: LogicNode<SC, C>[];
  private readonly _simContext: SC;
  private readonly _cost: number;
  private readonly _keyNodes: number;
  public maxDepth: number;

  constructor(success: boolean, simContext: SC, cost: number, keyNodes: number, ...nodes: LogicNode<SC, C>[]) {
    this._success = success;
    this._simContext = simContext;
    this._nodes = nodes;
    this._cost = cost;
    this._keyNodes = keyNodes;
    this.maxDepth = 20;
  }

  get success() {
    return this._success;
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

  next(logicNode: LogicNode<SC, C>) {
    const index = this._nodes.indexOf(logicNode);
    if (index === -1) throw new Error("node not in path");
    if (index === this._nodes.length - 1) throw new Error("no next node");
    return this._nodes[index + 1];
  }

  previous(logicNode: LogicNode<SC, C>) {
    const index = this._nodes.indexOf(logicNode);
    if (index === -1) throw new Error("node not in path");
    if (index === 0) throw new Error("no previous node");
    return this._nodes[index - 1];
  }
}

export class NewWeightedNFAPlanner<SC extends SimulationContext, C> {
  public maxDepth: number;

  private readonly _root: LogicNode<SC, C>;
  private readonly _end: LogicNode<SC, C>;

  private readonly _truncatedNodes: Set<LogicNode<SC, C>> = new Set();
  private readonly _parentMap: Map<LogicNode<SC, C>, Set<LogicNode<SC, C>>> = new Map();

  constructor(root: LogicNode<SC, C>, end: LogicNode<SC, C>, maxDepth = 20) {
    this._root = root;
    this._end = end;
    this.maxDepth = maxDepth;

    this.identRelevant();
    this.identRelParents();

    console.log("truncated size:", this._truncatedNodes.size);
  }

  identRelParents(nodeSet = this._truncatedNodes, parentMap = this._parentMap) {
    for (const node of nodeSet) {
      const parentSet = parentMap.get(node) ?? new Set();
      for (const parent of node.parents) {
        if (nodeSet.has(parent)) {
          parentSet.add(parent);
        }
      }
      parentMap.set(node, parentSet);
    }
  }

  identRelevant(endNode: LogicNode = this._end, ret = this._truncatedNodes, depth = 0): Set<LogicNode> {
    if (depth >= this.maxDepth) return ret;
    if (ret.has(endNode)) return ret;

    ret.add(endNode);
    for (const parent of endNode.parents) {
      this.identRelevant(parent, ret, depth + 1);
    }

    return ret;
  }

  bestPlan(plans: NewLogicPath<SC, C>[]): NewLogicPath<SC, C> {
    console.log(plans.length);
    const successes = plans.some((p) => p.success);
    if (successes) plans = plans.filter((p) => p.success);
    console.log(plans.length);
    const costs = plans.map((n) => n.cost);
    const lowest = costs.reduce((a, b) => (a > b ? b : a));
    plans = plans.filter((p) => p.cost === lowest);
    console.log(plans.length);
    const shortestLen = plans.map((p) => p.nodes.length).reduce((a, b) => (a > b ? b : a));
    plans = plans.filter((p) => p.nodes.length === shortestLen);
    console.log(plans.length);
    const keys = plans.map((p) => p.keyNodes);
    const shortestKeys = keys.reduce((a, b) => (a > b ? b : a));
    plans = plans.filter((p) => p.keyNodes === shortestKeys);
    console.log(plans.length);

    return plans[0];
  }

  goalfirstplan(
    context: C,
    simContext: SC,
    options: {
      maxSuccessPaths?: number;
      maxPartialPaths?: number;
      costOffset?: number;
      nodeOffset?: number;
      timeout?: number;
    } = {}
  ) {
    const maxAmt = options.maxSuccessPaths ?? Infinity;
    const maxPartialAmt = options.maxPartialPaths ?? Infinity;

    // console.log(this._end.name)
    const check = [this._end];
    const starts = new Set<LogicNode>();
    while (check.length > 0) {
      const node = check.shift()!;
      if (starts.has(node)) continue;
      console.log(node.name, node.shouldConsider(context));
      if (!node.shouldConsider(context)) check.push(...node.parents);
      else starts.add(node);
    }

    console.log(
      "hi",
      starts.size,
      [...starts.keys()].map((n) => n.name)
    );

    const solveRec: { [key: number]: { lowestCost: number; keyNodeNum: number; success: boolean } } = {};

    for (let i = 0; i <= this.maxDepth; i++) {
      solveRec[i] = { lowestCost: Infinity, keyNodeNum: Infinity, success: false };
    }

    const parentSet = new Set<LogicNode<SC, C>>();
    const parentMap = new Map();
    const considerMap = new Map();

    for (const node of starts) {
      this.identRelevant(node, parentSet);
    }
    this.identRelParents(parentSet, parentMap);

    for (const node of parentSet) {
      considerMap.set(node, node.shouldConsider(context));
    }

    const ref = {
      c: context,
      amt: 0,
      partialAmt: 0,
      maxAmt,
      maxPartialAmt,
      lowestSuccessCost: Infinity,
      lowestSuccessCostOffset: options.costOffset ?? Infinity,
      lowestSuccessNodes: Infinity,
      lowestSuccessNodeOffset: options.nodeOffset ?? Infinity,
      solveRecord: solveRec,
      considerMap: considerMap,
      parentMap: parentMap,
    };

    // console.log(ref.lowestSuccessCost, ref.lowestSuccessCostOffset, ref.lowestSuccessNodes, ref.lowestSuccessNodeOffset)
    const allPaths = [];
    for (const node of starts) {
      const paths = this._goalfirstplan(node, context, simContext, this._root, ref);
      allPaths.push(...paths);
    }

    return allPaths;
  }

  _goalfirstplan(
    end: LogicNode<SC, C>,
    c: C,
    sc: SC,
    root: LogicNode<SC, C>,
    ref: {
      c: C;
      amt: number;
      partialAmt: number;
      maxAmt: number;
      maxPartialAmt: number;
      lowestSuccessCost: number;
      lowestSuccessCostOffset: number;
      lowestSuccessNodes: number;
      lowestSuccessNodeOffset: number;
      solveRecord: { [key: number]: { lowestCost: number; keyNodeNum: number; success: boolean } };
      considerMap: Map<LogicNode, boolean>;
      parentMap: Map<LogicNode, Set<LogicNode>>;
    },
    depth = 0,
    consequentialNodes = 0, // TODO: potential bug here.
    cost = 0
  ) {
    // if (end.name === "craftWoodenAxe") {
    //   console.log(
    //     "node",
    //     end.name,
    //     "depth",
    //     depth,
    //     "conseq",
    //     consequentialNodes,
    //     "cost",
    //     cost,
    //     "\n\t",
    //     ref.considerMap.get(end),
    //     end.shouldEnter(sc),
    //     ref.solveRecord[depth].success
    //   );

    //   if (!end.shouldEnter(sc)) {
    //     const ctx = sc as any;
    //     const reasonable = ctx.wantedWoodenAxe >= ctx.woodenAxe;
    //     if (!reasonable) {

    //       console.log(sc, '\n\t', reasonable, ctx.wantedSticks <= ctx.sticks, ctx.wantedWood <= ctx.wood);
    //     }
    //   }
    // }

    if (depth >= this.maxDepth) return [];
    if (ref.amt >= ref.maxAmt) return [];
    if (ref.partialAmt >= ref.maxPartialAmt) return [];
    if (cost > ref.lowestSuccessCost + ref.lowestSuccessCostOffset) return [];
    if (consequentialNodes > ref.lowestSuccessNodes + ref.lowestSuccessNodeOffset) return [];
    if (ref.solveRecord[depth].lowestCost < cost) return [];
    // if (ref.solveRecord[depth].keyNodeNum < consequentialNodes) return [];

    const ret: NewLogicPath<SC, C>[] = [];

    if (ref.considerMap.get(end) === false) {
      if (ref.solveRecord[depth].success) return [];
      ref.partialAmt++;
      ref.solveRecord[depth].lowestCost = Math.min(cost, ref.solveRecord[depth].lowestCost);
      ref.solveRecord[depth].keyNodeNum = Math.min(consequentialNodes, ref.solveRecord[depth].keyNodeNum);
      return [new NewLogicPath(false, sc, cost, consequentialNodes)];
    }

  
    let addCost = 0;
    if (end.isAlreadyCompleted(sc)) { } 
    else {
      if (end.shouldEnter(sc)) {
        end.simEnter?.(sc);
         addCost = end._calculateCost(sc);
        end.simExit?.(sc);
        if (addCost > 0) consequentialNodes++;
      } else {
        return [];
      }
    }

    

      cost += addCost;
    if (end === root) {
      const newPath = new NewLogicPath(true, sc, cost, consequentialNodes, end);
      ref.amt++;
      ref.lowestSuccessCost = Math.min(cost, ref.lowestSuccessCost);
    ref.lowestSuccessNodes = Math.min(consequentialNodes, ref.lowestSuccessNodes);
      ref.solveRecord[depth].lowestCost = Math.min(cost, ref.solveRecord[depth].lowestCost);
      ref.solveRecord[depth].keyNodeNum = Math.min(consequentialNodes, ref.solveRecord[depth].keyNodeNum);
      ref.solveRecord[depth].success = true;
      ret.push(newPath);
      return ret;
    }

    const parents = ref.parentMap.get(end) ?? new Set();
    for (const parent of parents) {
      if (!ref.considerMap.get(parent)) continue;
      const copiedSC = { ...sc };
      const newPaths = this._goalfirstplan(parent, c, copiedSC, root, ref, depth + 1, consequentialNodes, cost);
      
      for (const path of newPaths) {
        ret.push(
          new NewLogicPath(path.success, path.simContext, path.cost, path.keyNodes, ...path.nodes, end)
        );
      }

      //   ret.push(...newPaths);
    }

    return ret;
  }
}
