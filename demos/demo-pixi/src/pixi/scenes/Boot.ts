import { Container } from "pixi.js";
import { Scene } from "../Scene";

export default class Boot extends Scene {
  readonly view = new Container();

  create(): void {
    this.manager.start("MainMenu");
  }

  destroy(): void {}
}
