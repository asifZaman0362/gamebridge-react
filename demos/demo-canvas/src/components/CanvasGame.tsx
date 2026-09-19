import { forwardRef, useEffect, useLayoutEffect, useRef } from "react";
import StartGame from "../canvas/main";
import { sceneEventsToApp } from "../canvas/SceneEvents";
import type { Application } from "../canvas/engine";
import type { Scene } from "../canvas/Scene";

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
    const detachEngineControls = useRef<(() => void) | null>(null);

    useLayoutEffect(() => {
      if (app.current === null) {
        const started = StartGame("game-container");
        app.current = started.app;
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
          app.current.destroy(true);
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
