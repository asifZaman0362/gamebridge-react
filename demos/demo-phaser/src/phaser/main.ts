import { AUTO, Game } from "phaser";
import Boot from "./scenes/Boot";
import MainMenu from "./scenes/MainMenu";
import LevelLava from "./scenes/LevelLava";
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
  scene: [Boot, MainMenu, LevelLava],
};

/**
 * Wires Control Panel commands, sent over the bridge, to the Game instance.
 * Returns a disposer — `sceneEventsToEngine` is a module-level singleton, so
 * whoever destroys this `game` must also call this, or its listeners keep
 * running against a dead game the next time an event fires.
 */
function attachEngineControls(game: Game): () => void {
  const disposers = [
    sceneEventsToEngine.on("UnloadScene", () => {
      for (const scene of game.scene.getScenes(true)) {
        // Phaser tears a scene down on its own, but never calls a
        // same-named `destroy()` method on it — so a scene that needs
        // cleanup, like stopping a Player's tweens, needs an explicit
        // signal to run it, before it's actually stopped below.
        if (scene instanceof LevelBase) scene.destroy();
        game.scene.stop(scene.sys.settings.key);
      }
    }),
    sceneEventsToEngine.on("LoadScene", ({ key }) => game.scene.start(key)),
    sceneEventsToEngine.on("SetPaused", (paused) =>
      paused ? game.pause() : game.resume(),
    ),
    sceneEventsToEngine.on("SetVolume", (volume) => {
      game.sound.volume = volume;
    }),
  ];
  return () => disposers.forEach((dispose) => dispose());
}

const StartGame = (parent: string) => {
  const game = new Game({ ...config, parent });
  const detachEngineControls = attachEngineControls(game);
  return { game, detachEngineControls };
};

export default StartGame;
