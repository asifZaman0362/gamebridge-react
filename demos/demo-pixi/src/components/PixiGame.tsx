import { forwardRef, useLayoutEffect, useRef } from "react";
import { useBridgeEvent } from "@gamebridge-react/react";
import type { Application } from "pixi.js";
import StartGame from "../pixi/main";
import { sceneEventsToApp } from "../pixi/SceneEvents";
import { playerStatsToApp } from "../pixi/PlayerStatsBridge";
import type { Scene } from "../pixi/Scene";
import type { SceneManager } from "../pixi/SceneManager";

export interface IRefPixiGame {
  app: Application | null;
  scene: Scene | null;
}

interface IProps {
  currentActiveScene?: (scene_instance: Scene) => void;
}

export const PixiGame = forwardRef<IRefPixiGame, IProps>(
  function PixiGame({ currentActiveScene }, ref) {
    const app = useRef<Application | null>(null);
    const manager = useRef<SceneManager | null>(null);
    const detachEngineControls = useRef<(() => void) | null>(null);

    useLayoutEffect(() => {
      // Unlike Phaser's synchronous `new Game(config)`, Pixi's `Application`
      // must be initialized with `await app.init(...)` — so this effect can't
      // assign the ref in the same tick, and a fast unmount (React Strict
      // Mode's mount/cleanup/mount cycle) can land while that init is still
      // pending. `cancelled` makes that case destroy the just-created app
      // instead of leaking it.
      let cancelled = false;

      if (app.current === null) {
        StartGame("game-container").then((started) => {
          if (cancelled) {
            started.detachEngineControls();
            started.manager.destroy();
            started.app.destroy(true, true);
            return;
          }
          app.current = started.app;
          manager.current = started.manager;
          detachEngineControls.current = started.detachEngineControls;

          if (typeof ref === "function") {
            ref({ app: app.current, scene: null });
          } else if (ref) {
            ref.current = { app: app.current, scene: null };
          }
        });
      }

      return () => {
        cancelled = true;
        if (app.current) {
          detachEngineControls.current?.();
          detachEngineControls.current = null;
          // Tear the active scene down before the app: a level's keyboard
          // bindings and timers belong to the scene, not the renderer.
          manager.current?.destroy();
          manager.current = null;
          app.current.destroy(true, true);
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
      { label: "PixiGame" },
    );

    return <div id="game-container"></div>;
  },
);
