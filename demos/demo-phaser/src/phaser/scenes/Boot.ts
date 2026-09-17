import { Scene } from "phaser";

export default class Boot extends Scene {
  constructor() {
    super("Boot");
  }

  create() {
    this.scene.start("MainMenu");
  }

  init() {
    this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      "Loading game...",
    );
  }
}
