/**
 * theater 场景库（移植自 D:\bigproject\AdventureX\theater）。
 * 每个场景为纯 three.js 构建：create() → { group, update(t), camera }，
 * 由 Scene3D.tsx 通过 R3F 的 <primitive> 挂载并逐帧驱动 update。
 */
import * as campsite from "./scenes/campsite";
import * as bedroomWindow from "./scenes/bedroomWindow";
import * as seaside from "./scenes/seaside";
import * as diningRoom from "./scenes/diningRoom";
import * as airport from "./scenes/airport";
import * as trainStation from "./scenes/trainStation";
import type { TheaterScene, TheaterSceneId } from "./types";

export type { TheaterScene, TheaterSceneId, TheaterCamera } from "./types";

export const THEATER_SCENES: Record<TheaterSceneId, () => TheaterScene> = {
  campsite: campsite.create,
  bedroom: bedroomWindow.create,
  seaside: seaside.create,
  dining: diningRoom.create,
  airport: airport.create,
  station: trainStation.create,
};

export const THEATER_SCENE_IDS = Object.keys(THEATER_SCENES) as TheaterSceneId[];
