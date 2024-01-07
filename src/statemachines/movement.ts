import { StateBehavior } from "@nxg-org/mineflayer-static-statemachine";
import { goals } from "mineflayer-pathfinder";
import { Vec3 } from "vec3";

import type { Block as PBlock } from "prismarine-block";
import type { Entity } from "prismarine-entity";


export class CollectBlock extends StateBehavior {
  async onStateEntered(...blockTypes: number[]): Promise<void> {
    // console.log("Collecting", blockTypes);
    const block = this.bot.findBlock({
      matching: blockTypes,
      maxDistance: 16,
    });

    if (block) {
      const goal = new goals.GoalLookAtBlock(block.position, this.bot.world);
      await this.bot.pathfinder.goto(goal);
      await this.bot.dig(block, true);

 
      const listener = (entity: Entity) => {
        if (entity.type === "object" && entity.objectType === "Item") {
          const dist = entity.position.distanceTo(block.position);
          if (dist < 3) {
            this.bot.off("entitySpawn", listener);
            const goal = new goals.GoalFollow(entity, 0.5);
            this.bot.pathfinder.setGoal(goal);
          }
        }
      };
    }
  }
}

export class PlaceBlockNear extends StateBehavior {
  async onStateEntered(itemType: number): Promise<void> {
    // console.log("Placing", this.bot.registry.items[itemType].displayName);
    const item = this.bot.inventory.items().find((item) => item.type === itemType);

    if (!item) throw new Error("No item found");
    this.bot.equip(item, "hand");

    let blocks = this.bot.findBlocks({
      matching: this.bot.registry.blocksByName.air.id,
      maxDistance: 5,
      count: 100,
    });

    blocks = blocks.filter((b) => this.bot.blockAt(b.offset(0, -1, 0))?.boundingBox === "block");
    blocks = blocks.filter((b) => b.distanceTo(this.bot.entity.position) > 2);
    const realBlocks = blocks.map(b=>this.bot.blockAt(b)).filter(b=>!!b && this.bot.canSeeBlock(b)) as PBlock[];

    const bPos = realBlocks[0];
    console.log(bPos.toString(), this.bot.entity.position.toString());

    const under = this.bot.blockAt(bPos.position.offset(0, -1, 0));
    if (!under) throw new Error("No block under");

    if (bPos) {
      // const goal = new goals.GoalBlock(bPos.x, bPos.y, bPos.z);
      // await this.bot.pathfinder.goto(goal);
      await this.bot.lookAt(bPos.position.offset(0.5, 0.5, 0.5));
      await this.bot.placeBlock(under, new Vec3(0, 1, 0));
    }
  }
}
