import type { Application, Container, Ticker } from "./engine";
import type { SceneManager } from "./SceneManager";

export type SceneContext = {
  app: Application;
  manager: SceneManager;
};

/** Canvas has no scene concept of its own; this is the minimal contract {@link SceneManager} pushes, ticks, and pops. */
export abstract class Scene {
  readonly key: string;
  protected readonly app: Application;
  protected readonly manager: SceneManager;

  /** This scene's root display object, added to the stage while it's on the manager's stack. */
  abstract readonly view: Container;

  constructor(ctx: SceneContext, key: string) {
    this.app = ctx.app;
    this.manager = ctx.manager;
    this.key = key;
  }

  abstract create(): void;
  abstract destroy(): void;

  /** Runs every tick while this scene is the top of the stack. */
  update?(ticker: Ticker): void;
}
