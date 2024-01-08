import { LogicNode } from "../decisions";
import { SimulationContext } from "../decisions/nfa";

/**
 * Class for entry into logic (imagine base/static state.)
 */
export class EntryNode<SC extends SimulationContext, C> extends LogicNode<SC, C> {
  name = "entry";
}

export class InterruptNode <SC extends SimulationContext, C> extends LogicNode<SC, C> {
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