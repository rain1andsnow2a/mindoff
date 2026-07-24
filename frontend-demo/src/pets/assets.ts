import type { ImageSourcePropType } from "react-native";

export type PetArtworkAssets = {
  idle: ImageSourcePropType;
  groom: ImageSourcePropType[];
  frameRate: number;
};

const MIRO_IDLE_SOURCE = require("../../assets/pets/miro/miro-idle.png");

const MIRO_GROOM_FRAMES: ImageSourcePropType[] = [
  require("../../assets/pets/miro/groom/frame-00.png"),
  require("../../assets/pets/miro/groom/frame-01.png"),
  require("../../assets/pets/miro/groom/frame-02.png"),
  require("../../assets/pets/miro/groom/frame-03.png"),
  require("../../assets/pets/miro/groom/frame-04.png"),
  require("../../assets/pets/miro/groom/frame-05.png"),
  require("../../assets/pets/miro/groom/frame-06.png"),
  require("../../assets/pets/miro/groom/frame-07.png"),
  require("../../assets/pets/miro/groom/frame-08.png"),
  require("../../assets/pets/miro/groom/frame-09.png"),
  require("../../assets/pets/miro/groom/frame-10.png"),
  require("../../assets/pets/miro/groom/frame-11.png"),
  require("../../assets/pets/miro/groom/frame-12.png"),
  require("../../assets/pets/miro/groom/frame-13.png"),
  require("../../assets/pets/miro/groom/frame-14.png"),
  require("../../assets/pets/miro/groom/frame-15.png"),
  require("../../assets/pets/miro/groom/frame-16.png"),
  require("../../assets/pets/miro/groom/frame-17.png"),
  require("../../assets/pets/miro/groom/frame-18.png"),
  require("../../assets/pets/miro/groom/frame-19.png"),
  require("../../assets/pets/miro/groom/frame-20.png"),
  require("../../assets/pets/miro/groom/frame-21.png"),
  require("../../assets/pets/miro/groom/frame-22.png"),
  require("../../assets/pets/miro/groom/frame-23.png"),
  require("../../assets/pets/miro/groom/frame-24.png"),
  require("../../assets/pets/miro/groom/frame-25.png"),
  require("../../assets/pets/miro/groom/frame-26.png"),
  require("../../assets/pets/miro/groom/frame-27.png"),
  require("../../assets/pets/miro/groom/frame-28.png"),
  require("../../assets/pets/miro/groom/frame-29.png"),
  require("../../assets/pets/miro/groom/frame-30.png"),
  require("../../assets/pets/miro/groom/frame-31.png"),
  require("../../assets/pets/miro/groom/frame-32.png"),
  require("../../assets/pets/miro/groom/frame-33.png"),
  require("../../assets/pets/miro/groom/frame-34.png"),
  require("../../assets/pets/miro/groom/frame-35.png"),
  require("../../assets/pets/miro/groom/frame-36.png"),
];

const PET_ARTWORK: Record<string, PetArtworkAssets> = {
  miro: {
    idle: MIRO_IDLE_SOURCE,
    groom: MIRO_GROOM_FRAMES,
    frameRate: 12,
  },
};

export function getPetArtwork(presetId: string | null): PetArtworkAssets | undefined {
  return presetId ? PET_ARTWORK[presetId] : undefined;
}
