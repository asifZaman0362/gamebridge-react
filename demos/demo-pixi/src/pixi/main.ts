import { Application } from "pixi.js";
import Boot from "./scenes/Boot";
import MainMenu from "./scenes/MainMenu";
import LevelLava from "./scenes/LevelLava";
import LevelWater from "./scenes/LevelWater";
import { SceneManager } from "./SceneManager";
import { sceneEventsToEngine } from "./SceneEvents";

export const GAME_WIDTH = 1024;
export const GAME_HEIGHT = 768;

function registerScenes(manager: SceneManager): void {
  manager.register("Boot", (ctx) => new Boot(ctx, "Boot"));
  manager.register("MainMenu", (ctx) => new MainMenu(ctx, "MainMenu"));
  manager.register("LevelLava", (ctx) => new LevelLava(ctx));
  manager.register("LevelWater", (ctx) => new LevelWater(ctx));
}

/**
 * Wires Control Panel commands, sent over the bridge, to the Application instance.
 * Returns a disposer — `sceneEventsToEngine` is a module-level singleton, so
 * whoever destroys this `app` must also call this, or its listeners keep
 * running against a dead app the next time an event fires.
 */
function attachEngineControls(app: Application, manager: SceneManager): () => void {
  // Labels name these handlers in the Debug Console's `listeners` field;
  // without them, inline arrows show up as "(anonymous)".
  const disposers = [
    sceneEventsToEngine.on("UnloadScene", () => manager.clear(), { label: "engine:unloadScene" }),
    sceneEventsToEngine.on("LoadScene", ({ key }) => manager.start(key), { label: "engine:loadScene" }),
    sceneEventsToEngine.on("SetPaused", (paused) => (paused ? app.stop() : app.start()), {
      label: "engine:setPaused",
    }),
    sceneEventsToEngine.on(
      "SetVolume",
      () => {
        // No audio in this demo; kept so the Control Panel's volume slider has
        // somewhere to send events, matching the Phaser demo's bridge surface.
      },
      { label: "engine:setVolume" },
    ),
  ];
  return () => disposers.forEach((dispose) => dispose());
}

async function StartGame(parent: string) {
  const app = new Application();
  await app.init({
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: 0x028af8,
    antialias: true,
  });
  document.getElementById(parent)!.appendChild(app.canvas);

  const manager = new SceneManager(app);
  registerScenes(manager);
  // Boot first, then attach. A `LoadScene` queued while `app.init()` was
  // pending is drained the moment its handler attaches, and must land after
  // Boot has handed over to the main menu — not be replaced by it.
  manager.start("Boot");
  const detachEngineControls = attachEngineControls(app, manager);

  return { app, manager, detachEngineControls };
}

export default StartGame;
