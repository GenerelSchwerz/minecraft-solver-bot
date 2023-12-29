import { v4 } from "uuid";

function isSubClassOf<T extends new (...args: any[]) => any>(child: T, parent: T) {
  return child === parent && child.prototype instanceof parent;
}

export function linkNodes(...nodes: LogicNode[]) {
  for (const node of nodes) {
    for (const child of node.children) {
      child.addParents(node);
    }
    linkNodes(...node.children);
  }
}

export function findPathsToBeginning(
  endNode: LogicNode,
  stopIf: (node: LogicNode) => boolean = () => false,
  paths: LogicNode[][] = [],
  path: LogicNode[] = []
) {
  path.push(endNode);
  if (endNode.parents.length === 0) {
    paths.push(path);
    return [];
  }
  for (const child of endNode.parents) {
    findPathsToBeginning(child, stopIf, paths, [...path]);
  }
  return paths;
}

export function findPathsToEnd(
  endNode: LogicNode,
  stopIf: (node: LogicNode) => boolean = () => false,
  paths: LogicNode[][] = [],
  path: LogicNode[] = []
) {
  path.push(endNode);
  if (endNode.children.length === 0) {
    paths.push(path);
    return [];
  }
  for (const child of endNode.children) {
    findPathsToEnd(child, stopIf, paths, [...path]);
  }
  return paths;
}

export abstract class LogicNode<Context = unknown> {
  public readonly uuid = v4();

  abstract name: string;

  abstract get cost(): number;

  public get staticRef(): typeof LogicNode {
    return this.constructor as typeof LogicNode;
  }

  readonly children: LogicNode[] = [];

  readonly parents: LogicNode[] = [];

  addParents(...parents: LogicNode[]) {
    for (const parent of parents) {
      if (this.parents.includes(parent)) return; // already added, prevent multiple if already specified.
      this.parents.push(parent);
    }
  }

  addChildren(...children: LogicNode[]) {
    for (const child of children) {
      if (this.children.includes(child)) return; // already added, prevent multiple if already specified.
      this.children.push(child);
    }
  }

  isCompleted(ctx: Context): boolean {
    return true;
  }

  shouldConsider(ctx: Context): boolean {
    return true;
  }

  abstract calculateCost(ctx: Context): void;

  abstract onEnter?(): void;

  abstract onExit?(): void;

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

export class LogicGraph<Context = unknown> {
  public runningNode: LogicNode<Context>;
  private nodes: LogicNode<Context>[];
  private visitedNodes: LogicNode<Context>[];

  private handlingInterruption = false;

  #isComplete = false;
  #ctx: Context;

  protected constructor(
    ctx: Context,
    private childrenMap: Map<LogicNode<Context>, LogicNode<Context>[]>,
    private rootNode: LogicNode<Context>,
    private interruptNode: LogicNode<Context>
  ) {
    this.#ctx = ctx;
    this.runningNode = rootNode;
    this.visitedNodes = [];
    this.nodes = this.extractNodes(childrenMap);
  }

  static fromTo<Context = unknown>(ctx: Context, from: LogicNode<Context>, to: LogicNode<Context>, interrupt: LogicNode<Context>) {
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
    return new LogicGraph<Context>(ctx, mapping, from, interrupt);
  }

  static rootTree<Context = unknown>(ctx: Context, root: LogicNode<Context>, interrupt: LogicNode<Context>) {
    const mapping = new Map();
    const loop = (root: LogicNode) => {
      mapping.set(root, root.children);
      for (const child of root.children) {
        loop(child);
      }
    };

    loop(root);
    return new LogicGraph<Context>(ctx, mapping, root, interrupt);
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
      node.calculateCost(this.#ctx);
    }
  }

  getLowestCostNode(nodes = this.nodes): LogicNode {
    return nodes.reduce((lowestCostNode, node) => (node.cost < lowestCostNode.cost ? node : lowestCostNode), nodes[0]);
  }

  enterNode(node: LogicNode) {
    this.runningNode.onExit?.();
    this.visitedNodes.push(this.runningNode);
    this.runningNode = node;
    node.onEnter?.();
  }

  /**
   * Enter into previously visited node.
   * If there is no previous node, default to root.
   *
   * TODO: Fix potential bug issue of hard stalling if root fails.
   */
  enterPreviousNode() {
    this.runningNode.onExit?.();
    const node = this.visitedNodes.pop() || this.rootNode;
    this.runningNode = node;
    node.onEnter?.();
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
        this.runningNode.onExit?.();
        console.log("completed");
        return;
      }

      this.updateCosts(children);
      const entry = this.getLowestCostNode(children);
      this.enterNode(entry);
    }
  }
}

export class LogicPath<Context = unknown> {
  #internal: LogicNode<Context>[];
  #current: LogicNode<Context>;

  // pre-calc for speed
  #indexes: Record<string, number> = {};
  #ctx: Context;

  constructor(ctx: Context, internal: LogicNode<Context>[], current = internal[0]) {
    this.#internal = internal;
    this.#current = current;
    this.#ctx = ctx;

    this.initIndexes();
  }

  static fromList<Context = unknown>(ctx: Context, nodes: LogicNode<Context>[]) {
    return new LogicPath<Context>(ctx, nodes);
  }

  public get completed(): boolean {
    return this.#indexes[this.#current.uuid] === this.#internal.length - 1;
  }

  public get current(): LogicNode<Context> {
    return this.#current;
  }

  public get end(): LogicNode<Context> {
    return this.#internal[this.#internal.length - 1];
  }

  has(node: LogicNode<Context>): boolean {
    return this.#indexes[node.uuid] !== undefined;
  }

  sublist(start: LogicNode<Context>): LogicPath<Context> {
    if (this.#indexes[start.uuid] === undefined) throw new Error("LogicPath: Cannot create sublist, start node is not in path.");
    if (this.#indexes[start.uuid] === 0) return this;
    const nodes = this.#internal.slice(this.#indexes[start.uuid]);
    return new LogicPath(this.#ctx, nodes, start);
  }

  initIndexes(): void {
    for (let i = 0; i < this.#internal.length; i++) {
      const node = this.#internal[i];
      this.#indexes[node.uuid] = i;
    }
  }

  getCost(): number {
    let cost = 0;
    for (let i = this.#indexes[this.#current.uuid]; i < this.#internal.length; i++) {
      const node = this.#internal[i];
      if (node.isCompleted(this.#ctx)) continue;

      // if not is not considered, its children will not be, so break.
      if (!node.shouldConsider(this.#ctx)) break;
      cost += node.cost;
    }
    return cost;
  }

  getStepBackCost(): number {
    if (this.#indexes[this.#current.uuid] === 0) throw new Error("LogicPath: Cannot get step back cost, already at beginning.");
    const prevNode = this.#internal[this.#indexes[this.#current.uuid] - 1];
    if (prevNode.isCompleted(this.#ctx)) return 0;
    return prevNode.cost;
  }

  calculateCosts(): void {
    for (let i = this.#indexes[this.#current.uuid]; i < this.#internal.length; i++) {
      const node = this.#internal[i];
      if (node.isCompleted(this.#ctx)) continue;

      // if not is not considered, its children will not be, so break.
      if (!node.shouldConsider(this.#ctx)) break;
      node.calculateCost(this.#ctx);
    }
  }

  calculateStepBackCost(): void {
    if (this.#indexes[this.#current.uuid] === 0) throw new Error("LogicPath: Cannot calculate step back cost, already at beginning.");
    const prevNode = this.#internal[this.#indexes[this.#current.uuid] - 1];
    if (prevNode.isCompleted(this.#ctx)) return;
    prevNode.calculateCost(this.#ctx);
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

export class LogicPathGraph<Context = unknown> {
  #paths: LogicPath<Context>[];
  #currentNode: LogicNode<Context>;
  #interruptNode: LogicNode<Context>;
  #currentPath?: LogicPath<Context>;
  #visited: LogicNode<Context>[] = [];

  #handlingInterruption = false;

  constructor(paths: LogicPath<Context>[], interruptNode: LogicNode<Context>) {
    if (paths.length === 0) throw new Error("LogicPathGraph: Cannot create graph with no paths.");
    const start = paths[0].current; // should be 0
    for (const path of paths)
      if (path.current !== start) throw new Error("LogicPathGraph: Cannot create graph with different starting nodes.");

    const end = paths[0].end;
    for (const path of paths) if (path.end !== end) throw new Error("LogicPathGraph: Cannot create graph with different ending nodes.");

    this.#paths = paths;
    this.#currentNode = start;
    this.#interruptNode = interruptNode;
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

  private considerPaths(): LogicPath<Context>[] {
    return this.#paths.filter((path) => path.has(this.#currentNode)).map((p) => p.sublist(this.#currentNode));
  }

  private enterNode(node: LogicNode<Context>) {
    this.#currentNode.onExit?.();
    this.#visited.push(this.#currentNode);
    this.#currentNode = node;
    node.onEnter?.();
  }

  /**
   * Enter into previously visited node.
   * If there is no previous node, error.
   */
  enterPreviousNode() {
    this.#currentNode.onExit?.();
    const node = this.#visited.pop();
    if (!node) throw new Error("LogicPathGraph: Cannot enter previous node, no previous node.");
    this.#currentNode = node;
    node.onEnter?.();
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

  update() {
    if (this.#currentPath?.completed) {
      console.log("completed");
      return;
    }

    if (this.#handlingInterruption) {
      this.interruptUpdate();
      return;
    }

    if (this.#currentNode.isInterrupted()) {
      this.#handlingInterruption = true;
      this.enterNode(this.#interruptNode);
    }

    // .
    else if (this.#currentNode.isFailed()) {
      console.log(`failed, reverting from ${this.#currentNode.name} to ${this.previousNode.name}`);
      this.enterPreviousNode();
    }

    // .
    else if (this.#currentNode.isFinished()) {
      const paths = this.considerPaths();
      const costs = paths.map((path) => path.getCost());
      const lowestCost = Math.min(...costs);
      this.#currentPath = this.#paths[costs.indexOf(lowestCost)];

      this.#currentPath.moveForward();
      this.enterNode(this.#currentPath.current);
    }
  }
}
