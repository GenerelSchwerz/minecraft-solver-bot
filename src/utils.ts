import type { Bot } from "mineflayer";

import * as md from "minecraft-data";
import type { Recipe as PRecipe, RecipeItem } from "prismarine-recipe";

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

const md1 = require("minecraft-data")("1.19.4");
const blocks = md1.blocksArray;
const itemsByName = md1.itemsByName;
const items = md1.itemsArray;
const itemsMap = md1.items;

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
  return itemsNeeded.reduce(
    (acc, item) => {
      const r = craft(item);
      return { itemsRequired: acc.itemsRequired.concat(r.itemsRequired as any), recipesToDo: r.recipesToDo.concat(acc.recipesToDo) };
    },
    { itemsRequired: [], recipesToDo: [{ recipeApplications: recipeApplications, recipe: firstRecipe }] }
  );
}

function randomShit(recipes: PRecipe[], availableItems: Item[], acc: [PRecipe, Item[]][] = []): [PRecipe, Item[]][] {
  recipes = recipes.reduce((acc, recipe) => {
    const setDelta = recipe.delta.slice(0, -1).map((e) => ({ id: e.id, count: -e.count }));
    if (acc.find((r) => r.delta.every((i) => setDelta.findIndex((i1) => i1.id === i.id && i1.count === i.count)))) return acc;
    acc.push(recipe);
    return acc;
  }, [] as PRecipe[]);

  for (const recipe of recipes) {
    const checking = recipe.delta.slice(0, -1);
    const notdone = checking.filter((e) => !((availableItems.find((i) => i.id === e.id)?.count ?? 0) >= -e.count));

    if (notdone.length === 0) {
      console.log("found all items for", itemsMap[recipe.result.id].name);
      for (const item of recipe.delta) {
        const i = availableItems.find((e) => e.id === item.id && e.count >= -item.count);

        if (i !== undefined) {
          // console.log('checking had item', item.id, itemsMap[item.id].name, item.count, checking.map((e) => [e.id, itemsMap[e.id].name, e.count]), availableItems.map((e) => [e.id, itemsMap[e.id].name, e.count]))
          i.count += item.count; // subtraction
        } else {
          // console.log('checking didn not have item', item.id, itemsMap[item.id].name, item.count, checking.map((e) => [e.id, itemsMap[e.id].name, e.count]), availableItems.map((e) => [e.id, itemsMap[e.id].name, e.count]))
          const index = availableItems.findIndex((e) => e.id === item.id);
          if (index !== -1) availableItems[index].count += item.count;
          else availableItems.push({ id: item.id, count: item.count });
        }
      }
      // console.log(availableItems)
      acc.push([recipe, availableItems]);
    } else {
      // console.log(checking.length, notdone.length)
      // console.log(availableItems.map((e) => [e.id, itemsMap[e.id].name, e.count]))
      for (const neededItem of notdone) {
        // console.log("didn't find", itemsMap[neededItem.id].name)
        const items = structuredClone(availableItems);
        const r = randomShit(Recipe.find(neededItem.id, null), items, acc);
        acc.push(...r);
      }
    }
  }

  return acc;
}

function _newCraft(
  item: Item,
  opts: {
    includeRecursion?: boolean;
    availableItems?: Item[];
  } = {},
  seen = new Map(),
  removal = new Set()
): { success: boolean; itemsRequired: Item[]; recipesToDo: { recipeApplications: number; recipe: PRecipe }[] } {
  const id = item.id;
  const recipes = Recipe.find(id, null);
  let availableItems = opts.availableItems;
  const includeRecursion = opts.includeRecursion ?? false;

  let matchingItem;
  let recipeWanted;

  let itemsNeeded: Item[];

  let count = item.count;


  if (seen.has(id)) {
    removal.add(id);
    return { success: false, itemsRequired: [seen.get(id)], recipesToDo: [] };
  }

  seen.set(id, item);

  if (availableItems !== undefined) {
    matchingItem = availableItems.find((e) => e.id === id && e.count >= count);
    if (matchingItem) {
      if (matchingItem.count >= item.count) {
        return { success: true, itemsRequired: [], recipesToDo: [] }; // already have item, no need to craft it.
      } 
      else {
        count -= matchingItem.count;
      }
    }

    recipeWanted = recipes.find((r) =>
      r.delta.slice(0, -1).every((e) => (availableItems!.find((i) => i.id === e.id)?.count ?? 0) >= -e.count)
    );

    if (recipeWanted) {
    } else {
      // since no recipes exist with all items available, search for the recipe with the most amount of items available inline
      let recipes1 = recipes;

      const deltas = recipes
        .map((recipe) => recipe.delta.slice(0, -1).map((e) => ({ id: e.id, count: -e.count })))
        .map(
          (delta) =>
            availableItems!.filter((have) => delta.findIndex((wanted) => wanted.id === have.id && wanted.count <= have.count) !== -1).length
        );

      deltas.sort((a, b) => b - a);

      const mostAmt = Math.max(...deltas);

      outer: for (let i = 0; i < deltas.length; i++) {
        if (deltas[i] !== mostAmt) continue;

        // we are going to recurse downwards, so we need to remove items from availableItems as we use them.
        const newOpts = opts//structuredClone(opts);
        const currentItems = newOpts.availableItems!;
        const recipe = recipes1[i];
        const ingredien = recipe.delta.slice(0, -1);

        // all items that need to be crafted to craft this recipe
        const ingredients = ingredien.filter((i) => availableItems!.find((e) => e.id === i.id && e.count >= -i.count) === undefined);

        // store all results for crafting attempts on all ingredients of current recipe
        const results = [];

        
        // const seen = new Map();
        // const removal = new Set();
        // do craft on all ingredients of current recipe
        inner: for (const ing of ingredients) {
          const data = _newCraft({ id: ing.id, count: -ing.count }, newOpts, seen, removal);
          if (data.success === false) break inner;
          results.push(data);

          // if we successfully crafted an item, remove the ingredients from availableItems
          for (const item1 of data.recipesToDo) {
            // const recipeApplications = Math.ceil(count / item1.recipe.result.count);

            for (let j = 0; j < item1.recipe.delta.length; j++) {
              const item = item1.recipe.delta[j];
              const index = currentItems!.findIndex((e) => e.id === item.id);
              if (index !== -1) {
                currentItems![index].count += item.count * item1.recipeApplications ;
              } else {
                currentItems!.push({ id: item.id, count: item.count * item1.recipeApplications });
              }
            }
          }
        }

        // if we successfully crafted all ingredients, we can craft this recipe
        if (results.length === ingredients.length) {
          // with our available items properly managed now, we can do the standard crafting option.
          const test = _newCraft({ id: id, count: count }, newOpts, seen, removal);

          if (test.success === false) {
            continue outer;
          }

          console.log('hey')

          const items = results.flatMap((e) => e.itemsRequired);
          items.push(...test.itemsRequired);

          const recipesToDo = results.flatMap((e) => e.recipesToDo);
          recipesToDo.push(...test.recipesToDo);

          for (const toDo of test.recipesToDo) {
            for (const item of toDo.recipe.delta) {
              const index = currentItems.findIndex((e) => e.id === item.id);
              if (index !== -1) {
                currentItems[index].count += item.count * toDo.recipeApplications ;
              } else {
                currentItems.push({ id: item.id, count: item.count * toDo.recipeApplications  });
              }
            }
          }

          return {
            success: true,
            itemsRequired: items,
            recipesToDo: recipesToDo,
          };
        }
      }

      // TODO can implement partial completion of recipes here.
      if (!recipeWanted) {
        const hasNoRecipes = (recipes.length == 0 || gettableItems.indexOf(id) != -1)
        const weHaveItem = availableItems.find((e) => e.id === id && e.count >= count)
        if (hasNoRecipes && weHaveItem) {
          // console.log("no recipe for ", itemsMap[item.id].name, "returning as is");
          return { success: true, itemsRequired: [item], recipesToDo: [] };
        } else { //if (hasNoRecipes && !weHaveItem) {
          // console.log("no recipe for ", itemsMap[item.id].name, "and dont have");
          return { success: false, itemsRequired: [item], recipesToDo: [] };
        // } else {
        //   console.log("no recipe for ", itemsMap[item.id].name, "but have ingredients", availableItems?.map((e) => [e.id, itemsMap[e.id].name, e.count]), count);
        //   recipeWanted = recipes[0];
        }
      }
    }
  } else {
    // TODO : should be replaced by smelting recipe data

    recipeWanted = recipes[0];

    if (recipes.length == 0 || gettableItems.indexOf(id) != -1) {
      console.log("no recipe for ", itemsMap[item.id].name);
      return { success: true, itemsRequired: [item], recipesToDo: [] };
    }
  }

  const recipeApplications = Math.ceil(count / recipeWanted.result.count);
  itemsNeeded ??= recipeWanted.delta.filter((e) => e.id !== id).map((e) => ({ id: e.id, count: -recipeApplications * e.count }));
  const ret = itemsNeeded.reduce(
    (acc, item) => {
      const r = _newCraft(item, opts, seen, removal);
      console.log(r.success)
      if (r.success === false && !includeRecursion) return { success: false, itemsRequired: acc.itemsRequired, recipesToDo: acc.recipesToDo };
      
      return {
        success: acc.success && r.success,
        itemsRequired: r.itemsRequired.concat(acc.itemsRequired),
        recipesToDo: r.recipesToDo.concat(acc.recipesToDo),
      } as any;
    },
    { success: true, itemsRequired: [] as Item[], recipesToDo: [{ recipeApplications: recipeApplications, recipe: recipeWanted }] }
  );

  const inRemoval = removal.has(id);
  if (inRemoval && !includeRecursion) {
    // console.log("alread had + recursion", itemsMap[id].name, 'removing')
    removal.delete(id);
    return { success: true, itemsRequired: [item], recipesToDo: [] };
  }

  // console.log("found", itemsMap[id].name, availableItems);
  seen.clear();
  return ret;
}

function newCraft(
  item: Item,
  opts: {
    includeRecursion?: boolean;
    availableItems?: Item[];
  } = {}
) {
  const seen = new Map();
  const removal = new Set();
  const ret = _newCraft(item, opts, seen, removal);

  console.log(ret)

  const ref = ret.recipesToDo;

  let index = 0;
  for (const rInfo of ret.recipesToDo) {
    const setDelta = rInfo.recipe.delta.map((e) => ({ id: e.id, count: e.count }));

    const idx = ref.findIndex((i) =>
      i.recipe.delta.every((i1) => setDelta.findIndex((i2) => i2.id === i1.id && i2.count === i1.count) !== -1)
    );
    if (idx !== index) {
      ref[idx].recipeApplications += rInfo.recipeApplications;
      ret.recipesToDo.splice(index, 1);
    }
    index++;
  }

  let index1 = 0;
  for (const item of ret.itemsRequired) {
    const idx = ret.itemsRequired.findIndex((i) => i.id === item.id);
    if (idx !== index1) {
      ret.itemsRequired[idx].count += item.count;
      ret.itemsRequired.splice(index1, 1);
    }
    index1++;
  }

  let index2 = 0;
  for (const item of ret.itemsRequired) {
    const ingredientIndex = ret.recipesToDo.findIndex((r) => r.recipe.delta.slice(0, -1).findIndex((i) => i.id === item.id) !== -1);
    const producedIndex = ret.recipesToDo.findIndex((r) => r.recipe.result.id === item.id);
    if (ingredientIndex !== -1 && producedIndex !== -1) {
      const resultItem = ret.recipesToDo[ingredientIndex].recipe.result;
      ret.recipesToDo.splice(ingredientIndex, 1);
      ret.itemsRequired.splice(index2, 1, resultItem);
    }
    index2++;
  }
  return ret;
}

const opts = {
  includeRecursion: false,
  availableItems: [
    // { id: itemsByName.stick.id, count: 8 },
    { id: itemsByName.spruce_log.id, count: 3 },
    { id: itemsByName.iron_ingot.id, count: 3 },
    // { id: itemsByName.iron_block.id, count: 1 },
  ],
};
const data = newCraft({ id: itemsByName.iron_pickaxe.id, count: 3 }, opts);

console.log(data.success)
console.log(
  data.recipesToDo.map((r) => {
    return { count: r.recipeApplications, recipes: r.recipe.delta.flatMap((d) => [itemsMap[d.id].name, d.count]) };
  })
);
console.log(
  "required",
  data.itemsRequired.map((e) => {
    return { id: e.id, name: itemsMap[e.id].name, count: e.count };
  })
);

console.log(
  opts.availableItems.map((d) => {
    return { name: itemsMap[d.id].name, count: d.count };
  })
);
const data1 = craft({ id: itemsByName.wooden_sword.id, count: 1 });

// console.log(
//   data1.recipesToDo.map((r) => {
//     return { count: r.recipeApplications, recipes: r.recipe.delta.flatMap((d) => [itemsMap[d.id].name, d.count]) };
//   })
// );
// console.log(data1.itemsRequired.map((e) => { return {id: e.id, name: itemsMap[e.id].name, count: e.count}}));

// blocks.concat(items).forEach((item: any) => newCraft({ id: item.id, count: 1 }));

// console.log("hi", Object.values(postProcess(data)).map((e) => Object.values(e).map(e=>[e.name, postProcess(data)[e]])));
export const sleep = setTimeout;
