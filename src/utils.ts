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
const blocksMap = md1.blocks;
const itemsByName = md1.itemsByName;
const blocksByName = md1.blocksByName;
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
      return { itemsRequired: acc.itemsRequired.concat(r.itemsRequired), recipesToDo: r.recipesToDo.concat(acc.recipesToDo) };
    },
    { itemsRequired: [] as Item[], recipesToDo: [{ recipeApplications: recipeApplications, recipe: firstRecipe }] }
  );
}

function _newCraft(
  item: Item,
  opts: {
    includeRecursion?: boolean;
    multipleRecipes?: boolean;
    availableItems?: Item[];
  } = {},
  seen = new Map(),
  target = item.count
): { success: boolean; itemsRequired: Item[]; recipesToDo: { recipeApplications: number; recipe: PRecipe }[] } {
  const id = item.id;
  const recipes = Recipe.find(id, null);

  let availableItems = opts.availableItems;
  const includeRecursion = opts.includeRecursion ?? false;
  const multipleRecipes = opts.multipleRecipes ?? false;

  let matchingItem;
  let recipeWanted;

  let count = item.count;

  const ret0: Item[] = [];
  const ret1: {
    recipeApplications: number;
    recipe: PRecipe;
  }[] = [];

  if (availableItems !== undefined) {
    matchingItem = availableItems.find((e) => e.id === id && e.count >= target);
    if (matchingItem) {
      // console.log("already have", itemsMap[id].name, matchingItem.count, count, target);
      if (matchingItem.count >= target) {
        return { success: true, itemsRequired: [], recipesToDo: [] }; // already have item, no need to craft it.
      } else {
        count -= matchingItem.count;
      }
    }

    if (seen.has(id)) {
      // seen.clear();
      if (!includeRecursion) {
        return { success: false, itemsRequired: [item], recipesToDo: [] };
      }
      return { success: false, itemsRequired: [item], recipesToDo: [] };
    }

    seen.set(id, item);

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

      // store current amount of items available to be crafted
      let craftedCount = 0;

      // console.log(
      //   itemsMap[id].name,
      //   count,
      //   availableItems.map((e) => [e.id, itemsMap[e.id].name, e.count])
      // );
      // console.log(deltas);
      // console.log(recipes.map((e) => e.delta.map((i) => [i.count, itemsMap[i.id].name])));

      outer: for (let i = 0; i < deltas.length; i++) {
        if (deltas[i] !== mostAmt) continue;

        // we are going to recurse downwards, so we need to remove items from availableItems as we use them.
        // const opts = opts//structuredClone(opts);
        const currentItems = opts.availableItems!;
        const recipe = recipes1[i];
        const ingredien = recipe.delta.slice(0, -1);

        // all items that need to be crafted to craft this recipe
        let ingredients = ingredien.filter((i) => availableItems!.find((e) => e.id === i.id && e.count >= -i.count) === undefined);

        // store all results for crafting attempts on all ingredients of current recipe
        const results = [];

        // console.log("ITEM WE WANT:", itemsMap[id].name ,"INGREDIENTS", ingredients.map((e) => [e.id, itemsMap[e.id].name, e.count]), "AVAILABLE", availableItems.map((e) => [e.id, itemsMap[e.id].name, e.count]));
        const found = ingredients.find((e) => e.id === id);
        if (found) ingredients = [found];
        // do craft on all ingredients of current recipe
        inner: for (const ing of ingredients) {
          // console.log("crafting", itemsMap[ing.id].name, -ing.count, "times");
          const data = _newCraft({ id: ing.id, count: -ing.count }, opts, seen);
          // console.log('crafted', itemsMap[ing.id].name, -ing.count, 'times', data.success, data.itemsRequired.map((e) => [e.id, itemsMap[e.id].name, e.count]), data.recipesToDo.map((e) => [e.recipe.delta.map((i) => [i.count, itemsMap[i.id].name]), e.recipeApplications]) );
          if (data.success === false) continue inner;
          results.push(data);

          // ret0.push(...data.itemsRequired);
          ret1.push(...data.recipesToDo);
          // if we successfully crafted an item, remove the ingredients from availableItems
          for (const item1 of data.recipesToDo) {
            // const recipeApplications = Math.ceil(count / item1.recipe.result.count);

            for (let j = 0; j < item1.recipe.delta.length; j++) {
              const item = item1.recipe.delta[j];
              const index = currentItems!.findIndex((e) => e.id === item.id);
              if (index !== -1) {
                currentItems![index].count += item.count * item1.recipeApplications;
              } else {
                currentItems!.push({ id: item.id, count: item.count * item1.recipeApplications });
              }
            }
          }
        }

        // if we successfully crafted all ingredients, we can craft this recipe
        if (results.length === ingredients.length) {
          // with our available items properly managed now, we can do the standard crafting option.

          let test;
          let attemptCount = count - craftedCount;
          tester: for (; attemptCount > 0; attemptCount--) {
            // console.log("attempted", attemptCount);
            const newopts = opts;
            const test1 = _newCraft({ id: id, count: attemptCount }, newopts, seen, target);
            // console.log(
            //   attemptCount,
            //   test1.success,
            //   test1.itemsRequired.map((e) => [e.id, itemsMap[e.id].name, e.count]),
            //   newopts.availableItems?.map((e) => [e.id, itemsMap[e.id].name, e.count])
            // );
            if (test1.success === true) {
              test = test1;
              craftedCount += attemptCount;
              // console.log("crafted", craftedCount);
              break tester;
            }
          }

          // console.log(test, count, craftedCount,  currentItems.map((e) => [e.id, itemsMap[e.id].name, e.count]))
          if (test === undefined) continue outer;

          // const items = results.flatMap((e) => e.itemsRequired);
          // ret0.push(...items, ...test.itemsRequired);

          // const recipesToDo = results.flatMap((e) => e.recipesToDo);
          ret1.push(...test.recipesToDo);

          for (const toDo of test.recipesToDo) {
            for (const ing of toDo.recipe.delta) {
              const index = currentItems.findIndex((e) => e.id === ing.id);
              const num = (currentItems[index]?.count ?? 0) + ing.count * toDo.recipeApplications;
              if (num < 0) {
                // console.log("failed here:", toDo.recipe.delta.map((i) => [i.count, itemsMap[i.id].name]) , toDo.recipeApplications, availableItems.map((e) => [e.id, itemsMap[e.id].name, e.count]), currentItems.map((e) => [e.id, itemsMap[e.id].name, e.count]))
                // const new1 = {id: ing.id, count: -num * toDo.recipeApplications}
                return { success: false, itemsRequired: [item], recipesToDo: [] };
              }
              if (index !== -1) {
                currentItems[index].count += ing.count * toDo.recipeApplications;
              } else {
                currentItems.push({ id: ing.id, count: ing.count * toDo.recipeApplications });
              }
            }
          }

          // console.log(
          //   "hey2",
          //   ret0.map((e) => [e.id, itemsMap[e.id].name, e.count])
          // );
          // console.log(
          //   "hey3",
          //   ret1.map((e) => [e.recipe.delta.map((i) => [i.count, itemsMap[i.id].name]), e.recipeApplications])
          // );

          // console.log("hey4", results.map((e) => [e.itemsRequired.map((i) => [i.count, itemsMap[i.id].name]), e.recipesToDo.map((i) => [i.recipe.delta.map((i) => [i.count, itemsMap[i.id].name]), i.recipeApplications])]) );

          // console.log(
          //   craftedCount,
          //   count,
          //   currentItems.map((e) => [e.id, itemsMap[e.id].name, e.count])
          // );

          if (craftedCount !== count) {
            continue outer;
          }

          // console.log("FICL")
          return {
            success: true,
            itemsRequired: ret0,
            recipesToDo: ret1,
          };
        }
      }

      // TODO can implement partial completion of recipes here.
      if (!recipeWanted) {
        const hasNoRecipes = recipes.length == 0 || gettableItems.indexOf(id) != -1;
        const weHaveItem = availableItems.find((e) => e.id === id && e.count >= count);
        if (hasNoRecipes && weHaveItem) {
          // console.log("no recipe for ", itemsMap[item.id].name, "returning as is");
          return { success: true, itemsRequired: [], recipesToDo: [] };
        } else {
          if (!multipleRecipes || (hasNoRecipes && !weHaveItem)) {
            // console.log("no recipe for ", itemsMap[item.id].name, "and dont have");
            const new1 = { id: id, count: count - craftedCount };
            return { success: false, itemsRequired: [new1], recipesToDo: [] };
          } else {
            const data = _newCraft({ id: id, count: count - craftedCount }, opts, seen, target);
            // console.log('hey', id, data.success, data.itemsRequired.map((e) => [e.id, itemsMap[e.id].name, e.count])  )
            return {
              success: data.success,
              itemsRequired: ret0.concat(data.itemsRequired),
              recipesToDo: ret1.concat(data.recipesToDo),
            };
          }
        }
      }
    }
  } else {
    // TODO : should be replaced by smelting recipe data

    const found = recipes.find((r) => r.result.count > 1);
    recipeWanted = found ?? recipes[0];

    if (recipes.length == 0 || gettableItems.indexOf(id) != -1) {
      // console.log("no recipe for ", itemsMap[item.id].name);
      return { success: true, itemsRequired: [item], recipesToDo: [] };
    }

    if (seen.has(id)) {
      // console.log('hey1', itemsMap[id].name)
      // seen.clear();
      if (!includeRecursion) {
        return { success: true, itemsRequired: [item], recipesToDo: [] };
      }
      return { success: true, itemsRequired: [item], recipesToDo: [] };
    }

    seen.set(id, item);
  }

  const recipeApplications = Math.ceil(count / recipeWanted.result.count);

  // for (const ing of recipeWanted.delta) {
  //   const seen1 = new Map(seen);
  //   const data = _newCraft({ id: ing.id, count: -ing.count * recipeApplications }, opts, seen1);
  //   if (data.success === false) {
  //     return { success: false, itemsRequired: [item], recipesToDo: [] };
  //   }
  //   ret1.push(...data.recipesToDo);
  // }

  const items = recipeWanted.delta.slice(0, -1).map((e) => ({ id: e.id, count: -recipeApplications * e.count }));

  const ret = items.reduce(
    (acc, item) => {
      const r = _newCraft(item, opts, seen);
      return {
        success: acc.success && r.success,
        itemsRequired: acc.itemsRequired.concat(r.itemsRequired),
        recipesToDo: r.recipesToDo.concat(acc.recipesToDo),
      };
    },
    { success: true, itemsRequired: [] as Item[], recipesToDo: [{ recipeApplications: recipeApplications, recipe: recipeWanted }] }
  ) as any;

  seen.clear();

  return ret;
  return {
    success: true,
    itemsRequired: ret0,
    recipesToDo: ret1,
  };
}

function newCraft(
  item: Item,
  opts: {
    includeRecursion?: boolean;
    multipleRecipes?: boolean;
    availableItems?: Item[];
  } = {}
) {
  const seen = new Map();
  const ret = _newCraft(item, opts, seen);

  const multipleRecipes = opts.multipleRecipes ?? false;
  const availableItems = opts.availableItems ;

  // due to multiple recipes, preserve order of items required.
  if (multipleRecipes && availableItems !== undefined) {
    return ret;
  }

  ret.itemsRequired = [];
  const ref = ret.recipesToDo;

  const map: Record<string, number> = {};

  if (!opts.includeRecursion) {
    // const mappings = ret.recipesToDo.map(r=>r.recipe.delta)
    hey: while (ret.recipesToDo.length > 0) {
      // remove single-level loops
      let change = 0;
      inner: for (const res1 of ret.recipesToDo) {
        const res = res1.recipe.result;
        const res2 = res1.recipe.delta.slice(0, 1);
        const found = ret.recipesToDo.find(
          (r1) =>
            r1 !== res1 &&
            r1.recipe.delta.length === res1.recipe.delta.length &&
            !!r1.recipe.delta.find((i) => i.id !== r1.recipe.result.id && i.id === res.id) &&
            res2.find((i) => i.id === r1.recipe.result.id)
        );
        if (!found) continue inner;

        const consumerIdx = ret.recipesToDo.indexOf(res1);
        ret.recipesToDo.splice(consumerIdx, 1);
        if (ret.recipesToDo.length <= 1) break hey;
        const producerIdx = ret.recipesToDo.indexOf(found!);
        ret.recipesToDo.splice(producerIdx, 1);
        change++;
      }

      if (change === 0) break hey;
    }
  } else {
    console.log(ret.recipesToDo.map((r) => r.recipe.delta.map((i) => [i.count, itemsMap[i.id].name])));
    hey: while (ret.recipesToDo.length > 0) {
      // remove single-level loops

      let change = 0;
      inner: for (const res1 of ret.recipesToDo) {
        console.log(ret.recipesToDo.indexOf(res1), ret.recipesToDo.length);
        const res = res1.recipe.result;
        const res2 = res1.recipe.delta.slice(0, 1);
        const found = ret.recipesToDo.find(
          (r1) =>
            r1 !== res1 &&
            r1.recipe.delta.length === res1.recipe.delta.length &&
            !!r1.recipe.delta.find((i) => i.id !== r1.recipe.result.id && i.id === res.id) &&
            res2.find((i) => i.id === r1.recipe.result.id)
        );
        console.log("found loop", !!res1, !!res, found);
        if (!found) continue inner;

        const consumerIdx = ret.recipesToDo.indexOf(res1);
        ret.recipesToDo.splice(consumerIdx, 1);
        change++;
        if (ret.recipesToDo.length === 1) break hey;
      }

      if (change === 0) break hey;
    }
  }

  console.log(ret.recipesToDo.map((r) => r.recipe.delta.map((i) => [i.count, itemsMap[i.id].name])));
  for (let i = 0; i < ret.recipesToDo.length; i++) {
    const res = ret.recipesToDo[i];
    const recipe = res.recipe;
    const recipeApplications = res.recipeApplications;
    const delta = recipe.delta;
    for (let j = 0; j < delta.length; j++) {
      const ing = delta[j];
      const count = ing.count * recipeApplications;

      const val = map[ing.id];
      const nan = isNaN(val);

      if (nan) map[ing.id] = count;
      else map[ing.id] += count;
    }
  }

  if (ret.recipesToDo.length > 1)
    for (let idx = 0; idx < ret.recipesToDo.length; idx++) {
      const res = ret.recipesToDo[idx];
      if (res.recipe.result.id === item.id) continue;
      const potentialShift = res.recipe.delta.slice(0, -1).some((i) => map[i.id] < 0);
      if (!potentialShift) continue;
      const valid = res.recipe.delta.reduce((acc, ing) => (map[ing.id] < 0 ? true : map[ing.id] - ing.count >= 0 && acc), true);
      if (valid) {
        for (const ing of res.recipe.delta) {
          map[ing.id] -= ing.count;
        }
        // for (const ing of res.recipe.delta) {
        //   const val = map[ing.id];
        //   if (val === 0) delete map[ing.id];
        // }
        ret.recipesToDo.splice(idx, 1);
      }
    }

  for (const [key, val] of Object.entries(map)) {
    if (val <= 0) ret.itemsRequired.push({ id: Number(key), count: val === 0 ? 0 : -val });
  }

  return ret;
}

const opts = {
  includeRecursion: false,
  multipleRecipes: true,
  availableItems: [
    // { id: itemsByName.stick.id, count: 8 },
    { id: itemsByName.spruce_log.id, count: 4 },
    { id: itemsByName.iron_ingot.id, count: 9 },
    { id: itemsByName.iron_block.id, count: 1 },
    { id: itemsByName.diamond_block.id, count: 9 },
  ],
};
let data = newCraft({ id: itemsByName.iron_sword.id, count: 6 }, opts);

console.log(data.success);
console.log(data);
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

// data = newCraft({ id: itemsByName.coal_block.id, count: 1 }, opts);

// console.log(data.success);
// console.log(data);
// console.log(
//   data.recipesToDo.map((r) => {
//     return { count: r.recipeApplications, recipes: r.recipe.delta.flatMap((d) => [itemsMap[d.id].name, d.count]) };
//   })
// );
// console.log(
//   "required",
//   data.itemsRequired.map((e) => {
//     return { id: e.id, name: itemsMap[e.id].name, count: e.count };
//   })
// );

// if ((opts as any).availableItems)
//   console.log(
//     (opts as any).availableItems.map((d: any) => {
//       return { name: itemsMap[d.id].name, count: d.count };
//     })
//   );
// const data1 = craft({ id: itemsByName.wooden_sword.id, count: 1 });

// console.log(
//   data1.recipesToDo.map((r) => {
//     return { count: r.recipeApplications, recipes: r.recipe.delta.flatMap((d) => [itemsMap[d.id].name, d.count]) };
//   })
// );
// console.log(data1.itemsRequired.map((e) => { return {id: e.id, name: itemsMap[e.id].name, count: e.count}}));

// console.time("hi");
// items.forEach((item: any) => {
//   const res = newCraft({ id: item.id, count: 256 }, { includeRecursion: true, multipleRecipes: true });
//   if (res.success === false) {
//     console.log(JSON.stringify(res));
//     console.log(res.itemsRequired.map((e) => [e.id, itemsMap[e.id].name, e.count]));
//     console.log(
//       res.recipesToDo.map((r) => {
//         return { count: r.recipeApplications, recipes: r.recipe.delta.flatMap((d) => [itemsMap[d.id].name, d.count]) };
//       }),
//       res.recipesToDo.length
//     );
//     throw new Error("failed to craft " + item.name);
//   }
// });
// console.timeEnd("hi");

// console.log("hi", Object.values(postProcess(data)).map((e) => Object.values(e).map(e=>[e.name, postProcess(data)[e]])));
export const sleep = setTimeout;
