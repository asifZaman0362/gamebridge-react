import { forwardRef, useEffect, useLayoutEffect, useRef } from "react";
import type { Application } from "pixi.js";
import StartGame from "../pixi/main";
import { sceneEventsToApp } from "../pixi/SceneEvents";
import type { Scene } from "../pixi/Scene";

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
            started.app.destroy(true, true);
            return;
          }
          app.current = started.app;
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
          app.current.destroy(true, true);
          app.current = null;
        }
      };
    }, [ref]);

    useEffect(() => {
      sceneEventsToApp.on("SceneCreated", ({ scene }) => {
        if (currentActiveScene && typeof currentActiveScene === "function") {
          currentActiveScene(scene);
        }

        if (typeof ref === "function") {
          ref({ app: app.current, scene });
        } else if (ref) {
          ref.current = { app: app.current, scene };
        }
      });
      return () => {
        sceneEventsToApp.off("SceneCreated");
      };
    }, [currentActiveScene, ref]);

    return <div id="game-container"></div>;
  },
);
