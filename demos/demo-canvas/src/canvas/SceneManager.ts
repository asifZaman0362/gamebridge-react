import type { Application } from "./engine";
import type { Scene, SceneContext } from "./Scene";

export type SceneFactory = (ctx: SceneContext) => Scene;

/**
 * A minimal push/pop scene stack — Canvas has no scene manager of its own,
 * same as Pixi. Each pushed scene's view sits above the ones beneath it on
 * the shared stage, and its `update` runs every tick while it's on top.
 *
 * This demo only ever calls {@link SceneManager.start}, which replaces the
 * whole stack — mirroring the other demos' `LoadScene` handling — but it's
 * built on the same `push`/`pop` primitives a screen that layers scenes (a
 * pause overlay, say) would use directly.
 */
export class SceneManager {
  private readonly app: Application;
  private readonly factories = new Map<string, SceneFactory>();
  private readonly stack: Scene[] = [];

  constructor(app: Application) {
    this.app = app;
    this.app.ticker.add(this.tick);
  }

  register(key: string, factory: SceneFactory): void {
    this.factories.set(key, factory);
  }

  /** Pushes `key` on top, leaving the current scene (if any) mounted underneath. */
  push(key: string): Scene {
    const factory = this.factories.get(key);
    if (!factory) throw new Error(`Unknown scene: ${key}`);

    const scene = factory({ app: this.app, manager: this });
    this.stack.push(scene);
    this.app.stage.addChild(scene.view);
    scene.create();
    return scene;
  }

  /** Tears down and removes the top scene, revealing the one beneath (if any). */
  pop(): void {
    const scene = this.stack.pop();
    if (!scene) return;
    scene.destroy();
    this.app.stage.removeChild(scene.view);
    scene.view.destroy({ children: true });
  }

  /** Clears the whole stack and pushes `key` as the new sole scene. */
  start(key: string): Scene {
    this.clear();
    return this.push(key);
  }

  clear(): void {
    while (this.stack.length > 0) this.pop();
  }

  get active(): Scene | null {
    return this.stack[this.stack.length - 1] ?? null;
  }

  private readonly tick = (): void => {
    this.active?.update?.(this.app.ticker);
  };

  destroy(): void {
    this.app.ticker.remove(this.tick);
    this.clear();
  }
}
