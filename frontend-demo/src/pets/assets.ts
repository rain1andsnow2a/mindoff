import type { ImageSourcePropType } from "react-native";

export type PetArtworkAssets = {
  idle: ImageSourcePropType;
  groom: ImageSourcePropType[];
  frameRate: number;
  states: Partial<Record<"idle" | "waving" | "waiting" | "running" | "review", ImageSourcePropType[]>>;
};

// 米露 2.1：所有状态均从同一套规格化状态条稳定切帧，避免动画播放时角色跑样。
const MIRO_IDLE_FRAMES = [
  require("../../assets/pets/miro/miro-idle-v3.png"),
  require("../../assets/pets/miro/miro-blink-half-v2.png"),
  require("../../assets/pets/miro/miro-blink-closed-v2.png"),
  require("../../assets/pets/miro/miro-blink-half-v2.png"),
  require("../../assets/pets/miro/miro-idle-v3.png"),
];
const MIRO_WAVING_FRAMES = [
  require("../../assets/pets/miro/animations-webp/waving/00.webp"),
  require("../../assets/pets/miro/animations-webp/waving/01.webp"),
  require("../../assets/pets/miro/animations-webp/waving/02.webp"),
  require("../../assets/pets/miro/animations-webp/waving/03.webp"),
  require("../../assets/pets/miro/animations-webp/waving/04.webp"),
  require("../../assets/pets/miro/animations-webp/waving/05.webp"),
  require("../../assets/pets/miro/animations-webp/waving/06.webp"),
  require("../../assets/pets/miro/animations-webp/waving/07.webp"),
];
const MIRO_WAITING_FRAMES = [
  require("../../assets/pets/miro/animations-webp/waiting/00.webp"),
  require("../../assets/pets/miro/animations-webp/waiting/01.webp"),
  require("../../assets/pets/miro/animations-webp/waiting/02.webp"),
  require("../../assets/pets/miro/animations-webp/waiting/03.webp"),
  require("../../assets/pets/miro/animations-webp/waiting/04.webp"),
  require("../../assets/pets/miro/animations-webp/waiting/05.webp"),
  require("../../assets/pets/miro/animations-webp/waiting/06.webp"),
  require("../../assets/pets/miro/animations-webp/waiting/07.webp"),
];
const MIRO_RUNNING_FRAMES = [
  require("../../assets/pets/miro/animations-webp/running/00.webp"),
  require("../../assets/pets/miro/animations-webp/running/01.webp"),
  require("../../assets/pets/miro/animations-webp/running/02.webp"),
  require("../../assets/pets/miro/animations-webp/running/03.webp"),
  require("../../assets/pets/miro/animations-webp/running/04.webp"),
  require("../../assets/pets/miro/animations-webp/running/05.webp"),
  require("../../assets/pets/miro/animations-webp/running/06.webp"),
  require("../../assets/pets/miro/animations-webp/running/07.webp"),
];
const MIRO_REVIEW_FRAMES = [
  require("../../assets/pets/miro/animations-webp/review/00.webp"),
  require("../../assets/pets/miro/animations-webp/review/01.webp"),
  require("../../assets/pets/miro/animations-webp/review/02.webp"),
  require("../../assets/pets/miro/animations-webp/review/03.webp"),
  require("../../assets/pets/miro/animations-webp/review/04.webp"),
  require("../../assets/pets/miro/animations-webp/review/05.webp"),
  require("../../assets/pets/miro/animations-webp/review/06.webp"),
  require("../../assets/pets/miro/animations-webp/review/07.webp"),
];

const PET_ARTWORK: Record<string, PetArtworkAssets> = {
  miro: {
    idle: MIRO_IDLE_FRAMES[0],
    // 首页在静候片刻后播放一次低打扰待机循环。
    groom: MIRO_IDLE_FRAMES.slice(1),
    frameRate: 12,
    states: {
      idle: MIRO_IDLE_FRAMES,
      waving: MIRO_WAVING_FRAMES,
      waiting: MIRO_WAITING_FRAMES,
      running: MIRO_RUNNING_FRAMES,
      review: MIRO_REVIEW_FRAMES,
    },
  },
};

const PET_AVATARS: Record<string, ImageSourcePropType> = {
  miro: require("../../assets/pets/avatars/miro-avatar-v1.png"),
  bobi: require("../../assets/pets/avatars/bobi-avatar-v1.png"),
};

export function getPetArtwork(presetId: string | null): PetArtworkAssets | undefined {
  return presetId ? PET_ARTWORK[presetId] : undefined;
}

export function getPetAvatar(presetId: string | null): ImageSourcePropType | undefined {
  return presetId ? PET_AVATARS[presetId] : undefined;
}
