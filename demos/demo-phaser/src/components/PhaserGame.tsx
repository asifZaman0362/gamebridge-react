import { forwardRef, useEffect, useLayoutEffect, useRef } from "react";
import StartGame from "../phaser/main";
import { sceneEventsToApp } from "../phaser/SceneEvents";
import Phaser from "phaser";

export interface IRefPhaserGame {
  game: Phaser.Game | null;
  scene: Phaser.Scene | null;
}

interface IProps {
  currentActiveScene?: (scene_instance: Phaser.Scene) => void;
}

export const PhaserGame = forwardRef<IRefPhaserGame, IProps>(
  function PhaserGame({ currentActiveScene }, ref) {
    const game = useRef<Phaser.Game | null>(null!);
    const detachEngineControls = useRef<(() => void) | null>(null);

    useLayoutEffect(() => {
      if (game.current === null) {
        const started = StartGame("game-container");
        game.current = started.game;
        detachEngineControls.current = started.detachEngineControls;

        if (typeof ref === "function") {
          ref({ game: game.current, scene: null });
        } else if (ref) {
          ref.current = { game: game.current, scene: null };
        }
      }

      return () => {
        if (game.current) {
          detachEngineControls.current?.();
          detachEngineControls.current = null;
          game.current.destroy(true);
          game.current = null;
        }
      };
    }, [ref]);

    useEffect(() => {
      sceneEventsToApp.on("SceneCreated", ({ scene }) => {
        if (currentActiveScene && typeof currentActiveScene === "function") {
          currentActiveScene(scene);
        }

        if (typeof ref === "function") {
          ref({ game: game.current, scene });
        } else if (ref) {
          ref.current = { game: game.current, scene };
        }
      });
      return () => {
        sceneEventsToApp.off("SceneCreated");
      };
    }, [currentActiveScene, ref]);

    return <div id="game-container"></div>;
  },
);
