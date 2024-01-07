import { goals } from 'mineflayer-pathfinder'
import type { Move, goals as GoalTypes } from 'mineflayer-pathfinder'

export class GoalExtraCost extends goals.Goal {
  parent: goals.Goal
  extraCost: number
  constructor (parent: goals.Goal, extraCost: number) {
    super()
    this.parent = parent
    this.extraCost = extraCost
  }

  public hasChanged(): boolean {
    return this.parent.hasChanged()
  }

  public heuristic(node: Move): number {
    return this.parent.heuristic(node) + this.extraCost
  }

  public isEnd(node: Move): boolean {
    return this.parent.isEnd(node)
  }

  public isValid(): boolean {
    return this.parent.isValid()
  }
}