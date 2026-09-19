import { AUTO, Core, Game } from "phaser";
import Boot from "./scenes/Boot";
import MainMenu from "./scenes/MainMenu";
import LevelLava from "./scenes/LevelLava";
import LevelWater from "./scenes/LevelWater";
import { LevelBase } from "./LevelBase";
import { sceneEventsToEngine } from "./SceneEvents";

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
export const GAME_WIDTH = 1024;
export const GAME_HEIGHT = 768;

const config: Phaser.Types.Core.GameConfig = {
  type: AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: "game-container",
  backgroundColor: "#028af8",
  scene: [Boot, MainMenu, LevelLava, LevelWater],
};

/**
 * Wires Control Panel commands, sent over the bridge, to the Game instance.
 * Returns a disposer — `sceneEventsToEngine` is a module-level singleton, so
 * whoever destroys this `game` must also call this, or its listeners keep
 * running against a dead game the next time an event fires.
 */
function stopActiveScenes(game: Game): void {
  for (const scene of game.scene.getScenes(true)) {
    // Phaser tears a scene down on its own, but never calls a same-named
    // `destroy()` method on it — so a scene that needs cleanup, like stopping
    // a Player's tweens, needs an explicit signal to run it, before it's
    // actually stopped below.
    if (scene instanceof LevelBase) scene.destroy();
    game.scene.stop(scene.sys.settings.key);
  }
}

function attachEngineControls(game: Game): () => void {
  // Labels name these handlers in the Debug Console's `listeners` field;
  // without them, inline arrows show up as "(anonymous)".
  const disposers = [
    sceneEventsToEngine.on("UnloadScene", () => stopActiveScenes(game), {
      label: "engine:unloadScene",
    }),
    sceneEventsToEngine.on(
      "LoadScene",
      ({ key }) => {
        // `game.scene.start` only *adds* a running scene; switching means
        // stopping whatever is active first, or the menu keeps running
        // underneath the level.
        stopActiveScenes(game);
        game.scene.start(key);
      },
      { label: "engine:loadScene" },
    ),
    sceneEventsToEngine.on(
      "SetPaused",
      (paused) => (paused ? game.pause() : game.resume()),
      { label: "engine:setPaused" },
    ),
    sceneEventsToEngine.on(
      "SetVolume",
      (volume) => {
        game.sound.volume = volume;
      },
      { label: "engine:setVolume" },
    ),
  ];
  return () => disposers.forEach((dispose) => dispose());
}

const StartGame = (parent: string) => {
  const game = new Game({ ...config, parent });

  // Attach only once the engine can actually take scene commands. Phaser
  // boots its scene manager asynchronously (on `READY`, after its default
  // textures load), and Boot's hand-off to MainMenu is a queued operation
  // that runs during the first step. Attaching any earlier means a `LoadScene`
  // that was queued on the bridge — the exact case `'queue'` exists for — is
  // drained into `scene.start()` before the manager is ready, which only
  // flags the level to auto-start alongside Boot; the level and the menu then
  // end up running at the same time. The first `POST_STEP` is the earliest
  // point at which the manager has processed its queue once.
  let detach: (() => void) | null = null;
  game.events.once(Core.Events.POST_STEP, () => {
    detach = attachEngineControls(game);
  });

  return {
    game,
    detachEngineControls: () => {
      detach?.();
      detach = null;
    },
  };
};

export default StartGame;
