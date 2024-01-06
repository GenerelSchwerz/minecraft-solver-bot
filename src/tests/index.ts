import { LogicNode } from "../decisions";

/**
 * Class for entry into logic (imagine base/static state.)
 */
export class EntryNode<Context=unknown, SimContext=unknown> extends LogicNode<Context, SimContext> {
  name = "entry";
}

export class InterruptNode <Context=unknown, SimContext=unknown> extends LogicNode<Context, SimContext> {
  name = "interrupt";
}

export class TestNode extends LogicNode {
  constructor(private cost: number, public name: string) {
    super();
  }

  calculateCost(ctx: unknown): number {
    return this.cost;
  }

  onEnter(): void {
    console.log("entering node: " + this.name);
  }

  onExit(): void {
    console.log("exiting node: " + this.name);
  }

  isFailed(): boolean {
    return Math.random() > 0.4;
  }
}