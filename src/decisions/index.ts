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

export abstract class LogicNode {
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

  abstract calculateCost(): void;

  abstract onEnter?(): void;

  abstract onExit?(): void;

  abstract isFinished(): boolean;

  abstract isFailed(): boolean;

  abstract isInterrupted(): boolean;
}

export class LogicGraph {
  public runningNode: LogicNode;
  private nodes: LogicNode[];
  private visitedNodes: LogicNode[];

  private handlingInterruption = false;

  #isComplete = false;

  protected constructor(private childrenMap: Map<LogicNode, LogicNode[]>, private rootNode: LogicNode, private interruptNode: LogicNode) {
    this.runningNode = rootNode;
    this.visitedNodes = [];
    this.nodes = this.extractNodes(childrenMap);
  }

  static fromTo(from: LogicNode, to: LogicNode, interrupt: LogicNode) {
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
    return new LogicGraph(mapping, from, interrupt);
  }

  static rootTree(root: LogicNode, interrupt: LogicNode) {
    const mapping = new Map();
    const loop = (root: LogicNode) => {
        mapping.set(root, root.children)
        for (const child of root.children) {
            loop(child)
        }
    }

    loop(root)
    return new LogicGraph(mapping, root, interrupt)
  }

  public get isComplete() {
    return this.#isComplete;
  }

  private get previousNode() {
    return this.visitedNodes[this.visitedNodes.length-1]
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
      node.calculateCost();
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
    const node = this.visitedNodes.pop() || this.rootNode
    this.runningNode = node
    node.onEnter?.()

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
        console.log(`failed, reverting from ${this.runningNode.name} to ${this.previousNode.name}` )
      this.enterPreviousNode()
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
