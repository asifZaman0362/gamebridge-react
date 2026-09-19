import { Application } from "./engine";
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
  const disposers = [
    sceneEventsToEngine.on("UnloadScene", () => manager.clear()),
    sceneEventsToEngine.on("LoadScene", ({ key }) => manager.start(key)),
    sceneEventsToEngine.on("SetPaused", (paused) => (paused ? app.stop() : app.start())),
    sceneEventsToEngine.on("SetVolume", () => {
      // No audio in this demo; kept so the Control Panel's volume slider has
      // somewhere to send events, matching the other demos' bridge surface.
    }),
  ];
  return () => disposers.forEach((dispose) => dispose());
}

function StartGame(parent: string) {
  const app = new Application();
  app.init({
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: 0x028af8,
  });
  document.getElementById(parent)!.appendChild(app.canvas);

  const manager = new SceneManager(app);
  registerScenes(manager);
  const detachEngineControls = attachEngineControls(app, manager);
  manager.start("Boot");

  return { app, detachEngineControls };
}

export default StartGame;
