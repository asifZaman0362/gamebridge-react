import { forwardRef, useLayoutEffect, useRef } from "react";
import { useBridgeEvent } from "@gamebridge-react/react";
import StartGame from "../canvas/main";
import { sceneEventsToApp } from "../canvas/SceneEvents";
import { playerStatsToApp } from "../canvas/PlayerStatsBridge";
import type { Application } from "../canvas/engine";
import type { Scene } from "../canvas/Scene";
import type { SceneManager } from "../canvas/SceneManager";

export interface IRefCanvasGame {
  app: Application | null;
  scene: Scene | null;
}

interface IProps {
  currentActiveScene?: (scene_instance: Scene) => void;
}

export const CanvasGame = forwardRef<IRefCanvasGame, IProps>(
  function CanvasGame({ currentActiveScene }, ref) {
    const app = useRef<Application | null>(null);
    const manager = useRef<SceneManager | null>(null);
    const detachEngineControls = useRef<(() => void) | null>(null);

    useLayoutEffect(() => {
      if (app.current === null) {
        const started = StartGame("game-container");
        app.current = started.app;
        manager.current = started.manager;
        detachEngineControls.current = started.detachEngineControls;

        if (typeof ref === "function") {
          ref({ app: app.current, scene: null });
        } else if (ref) {
          ref.current = { app: app.current, scene: null };
        }
      }

      return () => {
        if (app.current) {
          detachEngineControls.current?.();
          detachEngineControls.current = null;
          // Tear the active scene down before the app: a level's keyboard
          // bindings and timers belong to the scene, not the renderer.
          manager.current?.destroy();
          manager.current = null;
          app.current.destroy(true);
          app.current = null;
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
          ref({ app: app.current, scene });
        } else if (ref) {
          ref.current = { app: app.current, scene };
        }
      },
      { label: "CanvasGame" },
    );

    return <div id="game-container"></div>;
  },
);
