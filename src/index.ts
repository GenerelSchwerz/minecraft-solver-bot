
export { LogicNode, WeightedNFAHandler, WeightedNFAPlanner } from "./decisions";
import * as states from "./states";

import { createBot } from "mineflayer";
import { pathfinder, goals, Movements } from "mineflayer-pathfinder";
import { Context, SimContext } from "./constants";
import { WeightedNFAHandler, WeightedNFAPlanner } from "./decisions/nfa";

import { default as PBlock } from 'prismarine-block'
import { Item , default as PItem } from 'prismarine-item'
import { LogicNode } from "./decisions";
import { printInventory } from "./utils";
import { buildCraftingMachine } from "./statemachines/craft";

import {Item as mdItem} from 'minecraft-data'
import { BotStateMachine, StateMachineWebserver } from "@nxg-org/mineflayer-static-statemachine";
import crafter from 'mineflayer-crafting-util'

const entryNode = new states.EntryNode<SimContext, Context>();
const interruptNode = new states.InterruptNode<SimContext, Context>();

const collectDirtNode = new states.CollectDirtNode(1);
const collectWoodNode = new states.CollectWoodNode(1);
const collectStoneNode = new states.CollectStoneNode(1);
const collectIronNode = new states.CollectIronNode(1);
const collectDiamondNode = new states.CollectDiamondNode(1);

const craftWoodenAxeNode = new states.CraftWoodenAxeNode();
const craftStoneAxeNode = new states.CraftStoneAxeNode();
const craftWoodenPickaxeNode = new states.CraftWoodenPickaxeNode();
const craftStonePickaxeNode = new states.CraftStonePickaxeNode();
const craftIronAxeNode = new states.CraftIronAxeNode();
const craftIronPickaxeNode = new states.CraftIronPickaxeNode();
const craftDiamondPickaxeNode = new states.CraftDiamondPickaxeNode();
const craftDiamondAxeNode = new states.CraftDiamondAxeNode();
const craftPlanksNode = new states.CraftPlanksNode(1);
const craftSticksNode = new states.CraftSticksNode(2);
const craftFurnaceNode = new states.CraftFurnaceNode();

const smeltIronNode = new states.SmeltIronNode(1);

entryNode.addChildren(
  collectDirtNode,
  collectWoodNode,
);

collectDirtNode.addChildren(collectDirtNode);
collectWoodNode.addChildren(collectWoodNode, craftPlanksNode, craftSticksNode);

collectStoneNode.addChildren(collectStoneNode, craftFurnaceNode, craftStoneAxeNode, craftStonePickaxeNode);
collectIronNode.addChildren(collectIronNode, craftFurnaceNode);
collectDiamondNode.addChildren(collectDiamondNode, craftDiamondPickaxeNode);
craftWoodenAxeNode.addChildren(collectWoodNode);
craftWoodenPickaxeNode.addChildren(collectStoneNode);
craftStoneAxeNode.addChildren(collectWoodNode);
craftStonePickaxeNode.addChildren(collectIronNode, craftFurnaceNode);
craftIronPickaxeNode.addChildren(collectDiamondNode);
craftIronAxeNode.addChildren(collectWoodNode);
craftDiamondPickaxeNode.addChildren(collectDiamondNode);
craftDiamondAxeNode.addChildren(collectWoodNode);

craftPlanksNode.addChildren(
  craftSticksNode,
  craftWoodenAxeNode,
  craftWoodenPickaxeNode
)

craftSticksNode.addChildren(
  craftWoodenAxeNode,
  craftWoodenPickaxeNode,
  craftStoneAxeNode,
  craftStonePickaxeNode,
  craftIronPickaxeNode,
  craftIronAxeNode,
  craftDiamondPickaxeNode,
  craftDiamondAxeNode
);
craftFurnaceNode.addChildren(collectIronNode, smeltIronNode);
smeltIronNode.addChildren(smeltIronNode, craftIronPickaxeNode, craftIronAxeNode);

function createSimContextFromContext(ctx: Context): SimContext {

    const Block = PBlock(ctx.registry)
    const Item = PItem(ctx.registry)


    const dirtBlock =  new Block(ctx.registry.blocksByName.dirt.id, 0, 0)
    const woodBlock =  new Block(ctx.registry.blocksByName.oak_wood.id, 0, 0)
    const stoneBlock =  new Block(ctx.registry.blocksByName.stone.id, 0, 0)
    const ironOreBlock =  new Block(ctx.registry.blocksByName.iron_ore.id, 0, 0)
    const diamondOreBlock =  new Block(ctx.registry.blocksByName.diamond_ore.id, 0, 0)

    const woodenAxeItem = new Item(ctx.registry.itemsByName.wooden_axe.id, 0, 0)
    const woodenPickaxeItem = new Item(ctx.registry.itemsByName.wooden_pickaxe.id, 0, 0)
    const stoneAxeItem = new Item(ctx.registry.itemsByName.stone_axe.id, 0, 0)
    const stonePickaxeItem = new Item(ctx.registry.itemsByName.stone_pickaxe.id, 0, 0)
    const ironAxeItem = new Item(ctx.registry.itemsByName.iron_axe.id, 0, 0)
    const ironPickaxeItem = new Item(ctx.registry.itemsByName.iron_pickaxe.id, 0, 0)
    const diamondAxeItem = new Item(ctx.registry.itemsByName.diamond_axe.id, 0, 0)
    const diamondPickaxeItem = new Item(ctx.registry.itemsByName.diamond_pickaxe.id, 0, 0)

    return {
        dirt: ctx.inventory.items().filter((item) => item.name === "dirt").reduce((acc, item) => acc + item.count, 0),
        logs: ctx.inventory.items().filter((item) => item.name.endsWith('_log')).reduce((acc, item) => acc + item.count, 0),
        woodenAxe: ctx.inventory.items().filter((item) => item.name === "wooden_axe").reduce((acc, item) => acc + item.count, 0),
        woodenPickaxe: ctx.inventory.items().filter((item) => item.name === "wooden_pickaxe").reduce((acc, item) => acc + item.count, 0),
        stone: ctx.inventory.items().filter((item) => item.name === "stone").reduce((acc, item) => acc + item.count, 0),
        stoneAxe: ctx.inventory.items().filter((item) => item.name === "stone_axe").reduce((acc, item) => acc + item.count, 0),
        stonePickaxe: ctx.inventory.items().filter((item) => item.name === "stone_pickaxe").reduce((acc, item) => acc + item.count, 0),
        iron: ctx.inventory.items().filter((item) => item.name === "iron").reduce((acc, item) => acc + item.count, 0),
        ironOre: ctx.inventory.items().filter((item) => item.name === "iron_ore").reduce((acc, item) => acc + item.count, 0),
        ironAxe: ctx.inventory.items().filter((item) => item.name === "iron_axe").reduce((acc, item) => acc + item.count, 0),
        ironPickaxe: ctx.inventory.items().filter((item) => item.name === "iron_pickaxe").reduce((acc, item) => acc + item.count, 0),
        diamonds: ctx.inventory.items().filter((item) => item.name === "diamond").reduce((acc, item) => acc + item.count, 0),
        diamondAxe: ctx.inventory.items().filter((item) => item.name === "diamond_axe").reduce((acc, item) => acc + item.count, 0),
        diamondPickaxe: ctx.inventory.items().filter((item) => item.name === "diamond_pickaxe").reduce((acc, item) => acc + item.count, 0),
        sticks: ctx.inventory.items().filter((item) => item.name === "stick").reduce((acc, item) => acc + item.count, 0),
        planks: ctx.inventory.items().filter((item)=>item.name.endsWith("_planks")).reduce((acc,item)=> acc+item.count, 0),
        furnace: ctx.inventory.items().filter((item) => item.name === "furnace").reduce((acc, item) => acc + item.count, 0),

        digTimes: {
            dirt: {
                none: dirtBlock.digTime(null, false, false, false),
                woodenShovel: dirtBlock.digTime(null, false, false, false),
                stoneShovel: dirtBlock.digTime(null, false, false, false),
                ironShovel: dirtBlock.digTime(null, false, false, false),
                diamondShovel: dirtBlock.digTime(null, false, false, false),
            },
            wood: {
                none: woodBlock.digTime(null, false, false, false),
                woodenAxe: woodBlock.digTime(woodenAxeItem.type, false, false, false),
                stoneAxe: woodBlock.digTime(stoneAxeItem.type, false, false, false),
                ironAxe: woodBlock.digTime(ironAxeItem.type, false, false, false),
                diamondAxe: woodBlock.digTime(diamondAxeItem.type, false, false, false),
            },
            stone: {
                woodenPickaxe: stoneBlock.digTime(woodenPickaxeItem.type, false, false, false),
                stonePickaxe: stoneBlock.digTime(stonePickaxeItem.type, false, false, false),
                ironPickaxe: stoneBlock.digTime(ironPickaxeItem.type, false, false, false),
                diamondPickaxe: stoneBlock.digTime(diamondPickaxeItem.type, false, false, false),
            },
            ironOre: {
                stonePickaxe: ironOreBlock.digTime(stonePickaxeItem.type, false, false, false),
                ironPickaxe: ironOreBlock.digTime(ironPickaxeItem.type, false, false, false),
                diamondPickaxe: ironOreBlock.digTime(diamondPickaxeItem.type, false, false, false),
            },
            diamonds: {
                ironPickaxe: diamondOreBlock.digTime(ironPickaxeItem.type, false, false, false),
                diamondPickaxe: diamondOreBlock.digTime(diamondPickaxeItem.type, false, false, false),
            },
        },
        clone: function() { 
          return {
            // copy all the fields
            dirt: this.dirt,
            logs: this.logs,
            woodenAxe: this.woodenAxe,
            woodenPickaxe: this.woodenPickaxe,
            stone: this.stone,
            stoneAxe: this.stoneAxe,
            stonePickaxe: this.stonePickaxe,
            iron: this.iron,
            ironOre: this.ironOre,
            ironAxe: this.ironAxe,
            ironPickaxe: this.ironPickaxe,
            diamonds: this.diamonds,
            diamondAxe: this.diamondAxe,
            diamondPickaxe: this.diamondPickaxe,
            sticks: this.sticks,
            planks: this.planks,
            furnace: this.furnace,
            digTimes: this.digTimes,
            clone: this.clone,
          }
        }
    }
}


const bot = createBot({
  host: "127.0.0.1",
  username: "bot",
  auth: "offline",
});

bot.on('spawn', () => {
  const movements = new Movements(bot)
  bot.loadPlugin(pathfinder)
  bot.loadPlugin(crafter)
  bot.pathfinder.setMovements(movements)
})

const webserver = new StateMachineWebserver({})
webserver.startServer();

let stateMachine: BotStateMachine<any, any> | null = null;

bot.on("chat", async (username, message) => {
  if (username === bot.username) return
  const [command, ...args] = message.split(" ");
  switch (command) {
    case "test1":
      bot.chat("test1");
      break;

    case "teststate":
        const itemWanted = args[0];
        const maxDistance = parseInt(args[1] ?? "16");
        const item = Object.values(bot.registry.itemsByName as mdItem[]).find(i=>i.name === (itemWanted));
        if (!item) {
            bot.chat("no item found");
            return;
        }


        const fns = bot.listeners('physicsTick')

        bot.chat('trying to craft ' + item.displayName + ' at ' + maxDistance)

        if (stateMachine!== null) stateMachine.stop();

        const machine = buildCraftingMachine(bot, item.id, null, maxDistance);
        stateMachine = new BotStateMachine({bot, root: machine, data: {}, autoStart: false});
        stateMachine.start();
        webserver.loadStateMachine(stateMachine);
        stateMachine.on('stateEntered', (type, cls, newState) => console.log(newState.stateName, newState.name, newState.constructor.name))
        
        // const webserver = new StateMachineWebserver({ stateMachine });
        // webserver.startServer();
        break
    case "wood":

        const target = craftSticksNode;
        const sc = createSimContextFromContext(bot);

        const handler = new WeightedNFAHandler(bot, sc);

        handler.init(bot, entryNode, target, interruptNode);
        handler.update();

        let prev: LogicNode | null = null;

        const listener = () => {
            handler.update();
            const cur = handler.currentNode;
            if (cur === target) {
                bot.chat("done!");
                bot.off('physicsTick', listener)
                return;
            };

            if (!cur) throw new Error("no current node");
            if (cur !== prev) bot.chat(`test! ${cur.name}`)
            prev = cur;
        }


        bot.on('physicsTick', listener)
      break;
    case 'inv':
      printInventory(bot);
      break;
    default:
    //   bot.chat("unknown command!");
      break;
  }
});

bot.on("spawn", () => console.info("Spawned"));

bot.on("error", (err) => console.error("Bot error", err));
bot.on("kicked", (reason) => console.error("Bot was kicked for reason", reason));
bot.on("end", () => console.info("Bot disconnected"));
