//@ts-nocheck

import { LogicNode } from "../..";

export class LogicGraph<Context = unknown, SimContext = unknown> {
    public runningNode: LogicNode<Context, SimContext>;
    private nodes: LogicNode<Context, SimContext>[];
    private visitedNodes: LogicNode<Context, SimContext>[];
  
    private handlingInterruption = false;
  
    #isComplete = false;
    #ctx: Context;
    #simCtx: SimContext;
  
    protected constructor(
      ctx: Context,
      simCtx: SimContext,
      private childrenMap: Map<LogicNode<Context, SimContext>, LogicNode<Context, SimContext>[]>,
      private rootNode: LogicNode<Context, SimContext>,
      private interruptNode: LogicNode<Context, SimContext>
    ) {
      this.#ctx = ctx;
      this.#simCtx = simCtx;
      this.runningNode = rootNode;
      this.visitedNodes = [];
      this.nodes = this.extractNodes(childrenMap);
    }
  
    static fromTo<Context = unknown, SimContext = unknown>(
      ctx: Context,
      simCtx: SimContext,
      from: LogicNode<Context, SimContext>,
      to: LogicNode<Context, SimContext>,
      interrupt: LogicNode<Context, SimContext>
    ) {
      const paths = findPathsToBeginning(to, (node) => node === to)!;
  
      const mapping: Map<LogicNode, LogicNode[]> = new Map();
      for (const path of paths) {
        if (path[path.length - 1] === from) {
          for (let i = 1; i < path.length; i++) {
            const child = path[i - 1];
            const parent = path[i];
            const vals = mapping.get(parent) ?? [];
            vals.push(child);
            mapping.set(parent, vals);
          }
        }
      }
      // console.log(paths)
      // console.log(mapping)
      return new LogicGraph<Context, SimContext>(ctx, simCtx, mapping, from, interrupt);
    }
  
    static rootTree<Context = unknown, SimContext = unknown>(
      ctx: Context,
      simCtx: SimContext,
      root: LogicNode<Context, SimContext>,
      interrupt: LogicNode<Context, SimContext>
    ) {
      const mapping = new Map();
      const loop = (root: LogicNode) => {
        mapping.set(root, root.children);
        for (const child of root.children) {
          loop(child);
        }
      };
  
      loop(root);
      return new LogicGraph<Context, SimContext>(ctx, simCtx, mapping, root, interrupt);
    }
  
    public get isComplete() {
      return this.#isComplete;
    }
  
    private get previousNode() {
      return this.visitedNodes[this.visitedNodes.length - 1];
    }
  
    private extractNodes(map = this.childrenMap): LogicNode[] {
      const nodes: LogicNode[] = [];
      for (const [key, value] of map.entries()) {
        if (!nodes.includes(key)) nodes.push(key);
        for (const node of value) {
          if (!nodes.includes(node)) nodes.push(node);
        }
      }
  
      return nodes;
    }
  
    updateCosts(nodes = this.nodes) {
      for (const node of nodes) {
        node._calculateCost(this.#simCtx);
      }
    }
  
    getLowestCostNode(nodes = this.nodes): LogicNode {
      return nodes.reduce((lowestCostNode, node) => (node.cachedCost < lowestCostNode.cachedCost ? node : lowestCostNode), nodes[0]);
    }
  
    enterNode(node: LogicNode) {
      this.runningNode.onExit?.(this.#ctx);
      this.visitedNodes.push(this.runningNode);
      this.runningNode = node;
      node.onEnter?.(this.#ctx);
    }
  
    /**
     * Enter into previously visited node.
     * If there is no previous node, default to root.
     *
     * TODO: Fix potential bug issue of hard stalling if root fails.
     */
    enterPreviousNode() {
      this.runningNode.onExit?.(this.#ctx);
      const node = this.visitedNodes.pop() || this.rootNode;
      this.runningNode = node;
      node.onEnter?.(this.#ctx);
    }
  
    interruptUpdate() {
      if (!this.runningNode) return;
  
      if (this.runningNode.isInterrupted()) {
        throw new Error("LogicGraph: Interrupted while handling an interruption.");
      }
      // please don't fail twice.
      else if (this.runningNode.isFailed()) {
        throw new Error("LogicGraph: Failed in an interrupt handler.");
      } else if (this.runningNode.isFinished()) {
        this.handlingInterruption = false;
        this.enterNode(this.previousNode);
      }
    }
  
    update() {
      if (!this.runningNode) return console.log("no running node");
      if (this.#isComplete) return console.log("graph is complete");
  
      if (this.handlingInterruption) {
        this.interruptUpdate();
        return;
      }
  
      if (this.runningNode.isInterrupted()) {
        this.handlingInterruption = true;
        this.enterNode(this.interruptNode);
      }
  
      // please don't fail twice.
      // TODO: store all visited nodes and traverse backwards on list.
      else if (this.runningNode.isFailed()) {
        console.log(`failed, reverting from ${this.runningNode.name} to ${this.previousNode.name}`);
        this.enterPreviousNode();
      }
  
      // .
      else if (this.runningNode.isFinished()) {
        const children = this.childrenMap.get(this.runningNode)!;
  
        if (!children || children.length === 0) {
          this.#isComplete = true;
          this.runningNode.onExit?.(this.#ctx);
          console.log("completed");
          return;
        }
  
        this.updateCosts(children);
        const entry = this.getLowestCostNode(children);
        this.enterNode(entry);
      }
    }
  }
  
  export class LogicPath<Context = unknown, SimContext = unknown> {
    #internal: LogicNode<Context, SimContext>[];
    #current: LogicNode<Context, SimContext>;
  
    // pre-calc for speed
    #indexes: Record<string, number> = {};
    #ctx: Context;
    #simCtx: SimContext;
  
    constructor(ctx: Context, simCtx: SimContext, internal: LogicNode<Context, SimContext>[], current = internal[0]) {
      this.#internal = internal;
      this.#current = current;
      this.#ctx = ctx;
      this.#simCtx = simCtx;
  
      this.initIndexes();
    }
  
    static fromList<Context = unknown, SimContext = unknown>(ctx: Context, simCtx: SimContext, nodes: LogicNode<Context, SimContext>[]) {
      return new LogicPath<Context, SimContext>(ctx, simCtx, nodes);
    }
  
    public get completed(): boolean {
      return this.#indexes[this.#current.uuid] === this.#internal.length - 1;
    }
  
    public get current(): LogicNode<Context, SimContext> {
      return this.#current;
    }
  
    public get nodes(): LogicNode<Context, SimContext>[] {
      return this.#internal;
    }
  
    public get next(): LogicNode<Context, SimContext> {
      if (this.completed) throw new Error("LogicPath: Cannot get next, path is completed.");
      return this.#internal[this.#indexes[this.#current.uuid] + 1];
    }
  
    public get end(): LogicNode<Context, SimContext> {
      return this.#internal[this.#internal.length - 1];
    }
  
    public get ctx(): Context {
      return this.#ctx;
    }
  
    public get simCtx(): SimContext {
      return this.#simCtx;
    }
  
    has(node: LogicNode<Context, SimContext>): boolean {
      return this.#indexes[node.uuid] !== undefined;
    }
  
    sublist(start: LogicNode<Context, SimContext>): LogicPath<Context, SimContext> {
      if (this.#indexes[start.uuid] === undefined) throw new Error("LogicPath: Cannot create sublist, start node is not in path.");
      // if (this.#indexes[start.uuid] === 0) return this;
      const nodes = this.#internal.slice(this.#indexes[start.uuid]);
      return new LogicPath(this.#ctx, this.#simCtx, nodes, start);
    }
  
    initIndexes(): void {
      for (let i = 0; i < this.#internal.length; i++) {
        const node = this.#internal[i];
        this.#indexes[node.uuid] = i;
      }
    }
  
    getCost(): number {
      let cost = 0;
  
      const simCtx = structuredClone(this.#simCtx);
      for (let i = this.#indexes[this.#current.uuid]; i < this.#internal.length; i++) {
        const node = this.#internal[i];
        if (node.isAlreadyCompleted(this.#simCtx)) continue;
        node.simInit?.(this.simCtx);
      }
  
      for (let i = this.#indexes[this.#current.uuid]; i < this.#internal.length; i++) {
        const node = this.#internal[i];
        if (node.isAlreadyCompleted(this.#simCtx)) continue;
  
        node.simEnter?.(simCtx);
  
        if (!node.shouldEnter(simCtx)) {
          // console.log("not considering", node.name);
          return Infinity;
        }
  
        cost += node.cachedCost;
  
        node.simExit?.(simCtx);
      }
      return cost;
    }
  
    getStepBackCost(): number {
      if (this.#indexes[this.#current.uuid] === 0) throw new Error("LogicPath: Cannot get step back cost, already at beginning.");
      const prevNode = this.#internal[this.#indexes[this.#current.uuid] - 1];
      if (prevNode.isAlreadyCompleted(this.#simCtx)) return 0;
      return prevNode.cachedCost;
    }
  
    calculateCosts(): number {
      let cost = 0;
  
      const simCtx = structuredClone(this.#simCtx);
  
      for (let i = this.#indexes[this.#current.uuid]; i < this.#internal.length; i++) {
        const node = this.#internal[i];
        if (node.isAlreadyCompleted(this.#simCtx)) continue;
        node.simInit?.(this.simCtx);
      }
  
      for (let i = this.#indexes[this.#current.uuid] + 1; i < this.#internal.length; i++) {
        const node = this.#internal[i];
        if (node.isAlreadyCompleted(simCtx)) {
          // console.log("already completed", node.name);
          continue;
        }
  
        node.simEnter?.(simCtx);
  
        if (!node.shouldEnter(simCtx)) {
          // console.log("not considering", node.name);
          return Infinity;
        }
  
        // if not is not considered, its children will not be, so break.
  
        cost += node._calculateCost(simCtx);
        node.simExit?.(simCtx);
        // console.log("adding cost", node.name, node.cachedCost);
      }
      return cost;
    }
  
    calculateStepBackCost(): void {
      if (this.#indexes[this.#current.uuid] === 0) throw new Error("LogicPath: Cannot calculate step back cost, already at beginning.");
      const prevNode = this.#internal[this.#indexes[this.#current.uuid] - 1];
      if (prevNode.isAlreadyCompleted(this.#simCtx)) return;
      prevNode._calculateCost(this.#simCtx);
    }
  
    moveForward(): void {
      if (this.completed) throw new Error("LogicPath: Cannot move forward, path is completed.");
      this.#current = this.#internal[this.#indexes[this.#current.uuid] + 1];
    }
  
    moveBackward(): void {
      if (this.#indexes[this.#current.uuid] === 0) throw new Error("LogicPath: Cannot move backward, already at beginning.");
      this.#current = this.#internal[this.#indexes[this.#current.uuid] - 1];
    }
  }
  
  export class LogicPathGraph<Context = unknown, SimContext = unknown> {
    #paths: LogicPath<Context, SimContext>[];
    #currentNode: LogicNode<Context, SimContext>;
    #interruptNode: LogicNode<Context, SimContext>;
    #currentPath: LogicPath<Context, SimContext>;
    #visited: LogicNode<Context, SimContext>[] = [];
  
    #handlingInterruption = false;
  
    constructor(paths: LogicPath<Context, SimContext>[], interruptNode: LogicNode<Context, SimContext>) {
      if (paths.length === 0) throw new Error("LogicPathGraph: Cannot create graph with no paths.");
      const start = paths[0].current; // should be 0
      for (const path of paths)
        if (path.current !== start) throw new Error("LogicPathGraph: Cannot create graph with different starting nodes.");
  
      const end = paths[0].end;
      for (const path of paths) if (path.end !== end) throw new Error("LogicPathGraph: Cannot create graph with different ending nodes.");
  
      this.#paths = paths;
      this.#currentNode = start;
      this.#interruptNode = interruptNode;
  
      this.#currentPath = this.selectPath();
    }
  
    public get runningNode() {
      return this.#currentNode;
    }
  
    public get previousNode() {
      return this.#visited[this.#visited.length - 1];
    }
  
    public get completed() {
      return this.#currentPath?.completed;
    }
  
    private get currentCtx() {
      return this.#currentPath?.ctx;
    }
  
    // public begin() {
    //   this.enterNode(this.#currentNode)
    // }
  
    private considerPaths(): LogicPath<Context, SimContext>[] {
      return this.#paths
        .filter((path) => path.has(this.#currentNode))
        .map((p) => p.sublist(this.#currentNode))
        .filter((p) => p.next.shouldEnter(p.simCtx));
    }
  
    private enterNode(node: LogicNode<Context, SimContext>) {
      this.#currentNode.onExit?.(this.currentCtx!);
      this.#visited.push(this.#currentNode);
      this.#currentNode.cleanup?.();
  
      this.#currentNode = node;
  
      // const failFn = this.failHandler.bind(this, node)
      // const interFn = this.interruptHandler.bind(this, node)
      // const exitFn = this.exitHandler.bind(this, node)
      // const cleanup =  () => {
      //   node.off('failed', failFn)
      //   node.off('interrupted', interFn)
      //   node.off('exited', exitFn)
  
      // }
      // node.once('failed', failFn)
      // node.once('interrupted', interFn)
      // node.once('exited', exitFn)
      // node.cleanup = cleanup
  
      node.onEnter?.(this.currentCtx!);
    }
  
    /**
     * Enter into previously visited node.
     * If there is no previous node, error.
     */
    enterPreviousNode() {
      this.#currentNode.onExit?.(this.currentCtx!);
      const node = this.#visited.pop();
      // console.log(this.#currentNode.name, node?.name)
      if (!node) throw new Error("LogicPathGraph: Cannot enter previous node, no previous node.");
      this.#currentNode = node;
      node.onEnter?.(this.currentCtx!);
    }
  
    interruptUpdate() {
      if (!this.#currentNode) return;
  
      if (this.#currentNode.isInterrupted()) {
        throw new Error("LogicPathGraph: Interrupted while handling an interruption.");
      }
      // please don't fail twice.
      else if (this.#currentNode.isFailed()) {
        throw new Error("LogicPathGraph: Failed in an interrupt handler.");
      } else if (this.#currentNode.isFinished()) {
        this.#handlingInterruption = false;
        this.enterNode(this.previousNode);
      }
    }
  
    updateCosts() {
      for (const path of this.#paths) {
        path.calculateCosts();
      }
    }
  
    selectPath() {
      const paths = this.considerPaths();
      if (paths.length === 0) throw new Error("LogicPathGraph: Cannot select path, no paths to consider.");
      const costs = paths.map((p) => p.calculateCosts());
      const lowestCost = Math.min(...costs);
      return paths[costs.indexOf(lowestCost)];
    }
  
    interruptHandler = (node: LogicNode) => {};
  
    failHandler = (node: LogicNode) => {};
  
    exitHandler = (node: LogicNode) => {
      if (this.#currentPath.completed) {
        console.log("completed path");
        return;
      }
  
      this.#currentPath.current.simExit?.(this.#currentPath.simCtx);
      const costs = [];
      const subPaths = [];
      for (const path of this.#paths) {
        if (!path.has(this.#currentNode)) {
          costs.push(Infinity);
          subPaths.push(path);
          continue;
        }
  
        const subPath = path.sublist(this.#currentNode);
        const cost = subPath.calculateCosts();
        costs.push(cost);
        subPaths.push(subPath);
      }
  
      for (const cost of costs) {
        console.log(
          cost,
          subPaths[costs.indexOf(cost)].nodes.map((n) => n.name)
        );
      }
      // console.log(costs, subPaths.map(p=>p.nodes.map(n=>n.name)));
      const lowestCost = Math.min(...costs);
      const currentSubPath = subPaths[costs.indexOf(lowestCost)];
      this.#currentPath = this.#paths[costs.indexOf(lowestCost)];
      const entering = currentSubPath.next;
  
      if (entering.shouldEnter(currentSubPath.simCtx)) {
        this.#currentPath.moveForward();
        this.enterNode(entering);
      } else {
        this.enterNode(this.#currentNode);
      }
    };
  
    update() {
      if (this.#currentPath?.completed) {
        console.log("completed");
        return;
      }
  
      if (this.#handlingInterruption) {
        this.interruptUpdate();
        return;
      }
  
      console.log("updating", this.#currentNode.name);
  
      if (this.#currentNode.isInterrupted()) {
        this.#handlingInterruption = true;
        this.enterNode(this.#interruptNode);
      }
  
      // .
      else if (this.#currentNode.isFailed()) {
        console.log(`failed, reverting from ${this.#currentNode.name} to ${this.previousNode.name}`);
        this.#currentPath?.moveBackward();
        this.enterPreviousNode();
      }
  
      // .
      else if (this.#currentNode.isFinished()) {
        this.#currentPath.current.simExit?.(this.#currentPath.simCtx);
        const costs = [];
        const subPaths = [];
        for (const path of this.#paths) {
          if (!path.has(this.#currentNode)) {
            costs.push(Infinity);
            subPaths.push(path);
            continue;
          }
          const subPath = path.sublist(this.#currentNode);
          const cost = subPath.calculateCosts();
          costs.push(cost);
          subPaths.push(subPath);
        }
  
        for (const cost of costs) {
          console.log(
            cost,
            subPaths[costs.indexOf(cost)].nodes.map((n) => n.name)
          );
        }
        // console.log(costs, subPaths.map(p=>p.nodes.map(n=>n.name)));
        const lowestCost = Math.min(...costs);
        const currentSubPath = subPaths[costs.indexOf(lowestCost)];
        this.#currentPath = this.#paths[costs.indexOf(lowestCost)];
        const entering = currentSubPath.next;
  
        if (entering.shouldEnter(currentSubPath.simCtx)) {
          this.#currentPath.moveForward();
          this.enterNode(entering);
        } else {
          this.enterNode(this.#currentNode);
        }
      }
    }
  }
  