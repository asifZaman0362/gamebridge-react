import { forwardRef, useLayoutEffect, useRef } from "react";
import { useBridgeEvent } from "@gamebridge-react/react";
import StartGame from "../phaser/main";
import { sceneEventsToApp } from "../phaser/SceneEvents";
import { playerStatsToApp } from "../phaser/PlayerStatsBridge";
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
          // The engine that produced these replay values is gone: a component
          // mounting before the next engine reports must not be handed a dead
          // scene or a dead player's stats. The `toEngine` side is left alone —
          // it holds UI-owned state (paused, volume) and queued commands that
          // the next engine should still pick up.
          sceneEventsToApp.clear();
          playerStatsToApp.clear();
        }
      };
    }, [ref]);

    // Subscribed for exactly this component's lifetime, disposed on unmount,
    // and always invoking the latest closure — so `ref` and
    // `currentActiveScene` need no dependency bookkeeping.
    useBridgeEvent(
      sceneEventsToApp,
      "SceneCreated",
      ({ scene }) => {
        currentActiveScene?.(scene);
        if (typeof ref === "function") {
          ref({ game: game.current, scene });
        } else if (ref) {
          ref.current = { game: game.current, scene };
        }
      },
      { label: "PhaserGame" },
    );

    return <div id="game-container"></div>;
  },
);
