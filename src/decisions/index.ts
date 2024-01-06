import { v4 } from "uuid";
import { StrictEventEmitter } from "strict-event-emitter-types";
import { EventEmitter } from "events";

function isSubClassOf<T extends new (...args: any[]) => any>(child: T, parent: T) {
  return child === parent && child.prototype instanceof parent;
}

export function linkNodes(node: LogicNode) {
  for (const child of node.children) {
    child.addParents(node);
    linkNodes(child);
  }
}

export function findAllChildren(node: LogicNode, set = new Set<LogicNode>()): Set<LogicNode> {
  set.add(node);
  for (const child of node.children) {
    if (set.has(child)) continue;
    findAllChildren(child, set);
  }
  return set;
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
  if (path.indexOf(endNode) !== path.lastIndexOf(endNode)) {
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

  if (path.indexOf(endNode) !== path.lastIndexOf(endNode)) {
    paths.push(path);
    return [];
  }

  for (const child of endNode.children) {
    findPathsToEnd(child, stopIf, paths, [...path]);
  }
  return paths;
}

interface LogicEvents {
  interrupted: () => void;
  failed: () => void;
  entered: () => void;
  exited: () => void;
  cleanup: () => void;
}

export abstract class LogicNode<Context = unknown, SimContext = unknown> extends (EventEmitter as new () => StrictEventEmitter<
  EventEmitter,
  LogicEvents
>) {
  abstract name: string;

  private _cachedConsider: boolean = true;

  public get cachedConsider(): boolean {
    return this._cachedConsider;
  }

  public readonly immediateReturn: boolean = false;

  cleanup?: () => void;

  // abstract get cost(): number;

  _calculateCost(ctx: SimContext): number {
    return this.calculateCost(ctx);
  }


  shouldConsider(ctx: Context): boolean {
    return true;
  }

  protected calculateCost(ctx: SimContext): number {
    return 0;
  }

  simInit?(ctx: SimContext): void;

  simEnter?(ctx: SimContext): void;

  simExit?(ctx: SimContext): void;

  onEnter?(ctx: Context): void;

  onExit?(ctx: Context): void;

  public readonly uuid = v4();

  children: LogicNode<Context, SimContext>[] = [];

  readonly parents: LogicNode<Context, SimContext>[] = [];

  addParents(...parents: LogicNode<Context, SimContext>[]) {
    for (const parent of parents) {
      if (this.parents.includes(parent)) return; // already added, prevent multiple if already specified.
      this.parents.push(parent);
      parent.addChildren(this);
    }
  }

  addChildren(...children: LogicNode<Context, SimContext>[]) {
    for (const child of children) {
      if (this.children.includes(child)) return; // already added, prevent multiple if already specified.
      this.children.push(child);
      child.addParents(this);
    }
  }

  isAlreadyCompleted(ctx: SimContext): boolean {
    return false;
  }

  shouldEnter(ctx: SimContext): boolean {
    return true;
  }

  _shouldEnter(ctx: SimContext): boolean {
    return this.shouldEnter(ctx) || this.isAlreadyCompleted(ctx);
  }

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
