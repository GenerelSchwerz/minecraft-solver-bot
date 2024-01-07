import { Bot } from "mineflayer";

export interface SimContext {
  diamondAxe: number;
  ironAxe: number;
  sticks: number;
  diamonds: number;
  diamondPickaxe: number;
  ironOre: number;
  ironPickaxe: number;
  furnace: number;
  iron: number;
  stonePickaxe: number;
  dirt: number;
  woodenPickaxe: number;
  stone: number;
  wood: number;
  woodenAxe: number;
  stoneAxe: number;

  digTimes: {
    dirt: {
      none: number;
      woodenShovel: number;
      stoneShovel: number;
      ironShovel: number;
      diamondShovel: number;
    };
    wood: {
      none: number;
      woodenAxe: number;
      stoneAxe: number;
      ironAxe: number;
      diamondAxe: number;
    };
    stone: {
      woodenPickaxe: number;
      stonePickaxe: number;
      ironPickaxe: number;
      diamondPickaxe: number;
    };
    ironOre: {
      stonePickaxe: number;
      ironPickaxe: number;
      diamondPickaxe: number;
    };
    diamonds: {
      ironPickaxe: number;
      diamondPickaxe: number;
    };
  };
}

export type Context = Bot;
