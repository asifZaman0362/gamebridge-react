import Phaser from "phaser";

export abstract class LevelBase extends Phaser.Scene {
  constructor(sceneName: string) {
    super(sceneName);
  }

  abstract create(): void;
  abstract destroy(): void;
}
