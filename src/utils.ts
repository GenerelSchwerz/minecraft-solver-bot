import type { Bot } from "mineflayer";

import * as md from "minecraft-data";
import type { Recipe as PRecipe } from "prismarine-recipe";

export function onceWithCleanup<T>(
  emitter: NodeJS.EventEmitter,
  event: string,
  options: { timeout?: number; checkCondition?: (data?: T) => boolean } = {}
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout || 10000;
    const checkCondition = options.checkCondition || (() => true);
    const timeoutId = setTimeout(() => {
      emitter.removeListener(event, listener);
      reject(new Error(`Timeout waiting for ${event}`));
    }, timeout);
    const listener = (data: T) => {
      if (checkCondition(data)) {
        clearTimeout(timeoutId);
        emitter.removeListener(event, listener);
        resolve(data);
      }
    };
    emitter.on(event, listener);
  });
}

export function printInventory(bot: Bot) {
  const items = bot.inventory.items();
  let output = "";
  for (const item of items) {
    output += `${item.name} x ${item.count}\n`;
  }
  console.log(items);
  bot.chat(output);
}

const Recipe: typeof PRecipe = require("prismarine-recipe")("1.19.4").Recipe;

const gettableItems = [263, 264, 265, 266, 296, 331, 341, 388]; // TODO : should be replaced by smelting recipe data

const blocks = require("minecraft-data")("1.19.4").blocksArray;
const itemsByName = require("minecraft-data")("1.19.4").itemsByName;
const itemsMap = require("minecraft-data")("1.19.4").items;
const items = require("minecraft-data")("1.19.4").itemsArray;

type Item = { id: number; count: number };
export function craft(item: Item): { itemsRequired: Item[]; recipesToDo: { recipeApplications: number; recipe: PRecipe }[] } {
  const id = item.id;
  const count = item.count;
  const recipes = Recipe.find(id, null);
  if (recipes.length == 0 || gettableItems.indexOf(id) != -1) {
    return { itemsRequired: [item], recipesToDo: [] };
  }
  const firstRecipe = recipes[0];
  const recipeApplications = Math.ceil(count / firstRecipe.result.count);
  const itemsNeeded = firstRecipe.delta.filter((e) => e.id != id).map((e) => ({ id: e.id, count: -recipeApplications * e.count }));
  console.log(itemsNeeded.map((e) => items[e.id].name));
  return itemsNeeded.reduce(
    (acc, item) => {
      const r = craft(item);
      return { itemsRequired: acc.itemsRequired.concat(r.itemsRequired as any), recipesToDo: r.recipesToDo.concat(acc.recipesToDo) };
    },
    { itemsRequired: [], recipesToDo: [{ recipeApplications: recipeApplications, recipe: firstRecipe }] }
  );
}

export function newCraft(
  item: Item,
  availableItems?: Item[]
): { itemsRequired: Item[]; recipesToDo: { recipeApplications: number; recipe: PRecipe }[] } {
  const id = item.id;
  const recipes = Recipe.find(id, null);

  let matchingItem;
  let recipeWanted;

  let count = item.count;

  // TODO : should be replaced by smelting recipe data
  if (recipes.length == 0 || gettableItems.indexOf(id) != -1) {
    return { itemsRequired: [item], recipesToDo: [] };
  }

  if (availableItems !== undefined) {
    matchingItem = availableItems.find((e) => e.id === id);
    if (matchingItem) {
      if (matchingItem.count >= item.count) {
        return { itemsRequired: [], recipesToDo: [] }; // already have item, no need to craft it.
      } else {
        count -= matchingItem.count;
      }
    }

    recipeWanted = recipes.find((r) =>
      r.delta.slice(0, -1).every((e) => (availableItems.find((i) => i.id === e.id)?.count ?? 0) >= -e.count)
    );

    if (!recipeWanted) {
      throw new Error("No recipe found");
      return { itemsRequired: [item], recipesToDo: [] }; // we don't have a recipe for this item. Fuck.
    }
  } else {
    recipeWanted = recipes[0];
  }

  const recipeApplications = Math.ceil(count / recipeWanted.result.count);
  const itemsNeeded = recipeWanted.delta.filter((e) => e.id != id).map((e) => ({ id: e.id, count: -recipeApplications * e.count }));
  console.log(itemsNeeded.map((e) => items[e.id].name));
  return itemsNeeded.reduce(
    (acc, item) => {
      const r = newCraft(item, availableItems);
      return { itemsRequired: acc.itemsRequired.concat(r.itemsRequired as any), recipesToDo: r.recipesToDo.concat(acc.recipesToDo) };
    },
    { itemsRequired: [], recipesToDo: [{ recipeApplications: recipeApplications, recipe: recipeWanted }] }
  );
}

// blocks.concat(items).forEach((item: any) => {
//   console.log(item.name);
//   const data = craft({id:item.id,count:1})

//   console.log(data.itemsRequired.map((e) => itemsMap[e.id].name));
// });

// const data = craft({ id: itemsByName.wooden_pickaxe.id, count: 1 });
// console.log(Recipe.find(itemsByName.oak_planks.id, null).map((r) => r.delta.map((e) => itemsMap[e.id].name)));
// console.log(itemsMap[data.itemsRequired[0].id].name, data.itemsRequired[0].count);
console.log(newCraft({ id: itemsByName.wooden_pickaxe.id, count: 1 }, [{ id: itemsByName.wooden_pickaxe.id, count: 2 }]));
export const sleep = setTimeout;
