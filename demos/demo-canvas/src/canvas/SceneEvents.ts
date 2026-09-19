import { createBridgePair, notifiers } from "@gamebridge-react/core";
import type { Scene } from "./Scene";

/** The MainMenu scene's key, shared so nothing has to spell it out twice. */
export const MAIN_MENU_SCENE = "MainMenu";

/** Level scenes selectable from the Control Panel's level dropdown. */
export const LEVEL_SCENES = ["LevelLava", "LevelWater"] as const;
export type LevelSceneKey = (typeof LEVEL_SCENES)[number];

export type SceneEventsToApp = {
  SceneCreated: { scene: Scene };
};

export type SceneEventsToEngine = {
  UnloadScene: void;
  /** Switch the active scene, e.g. `{ key: "MainMenu" }` or a level's key. */
  LoadScene: { key: string };
  /** Pauses or resumes the whole game loop. */
  SetPaused: boolean;
  /** Global sound volume, 0 to 1. */
  SetVolume: number;
};

/**
 * Both directions use the default `GenericTransport`. The engine here exposes
 * no emitter the bridge would want to reuse, and the bridges are module-level
 * singletons that outlive any one `Application` (React Strict Mode and HMR
 * rebuild it), so a bridge-owned transport is the natural fit.
 */
export const sceneEvents = createBridgePair<
  SceneEventsToEngine,
  SceneEventsToApp
>({
  buffer: {
    toEngine: {
      // A command: a load requested before the engine has booted still runs,
      // exactly once. `app.init()` is async, so this window is real.
      LoadScene: "queue",
      // State: the latest value is what a freshly (re)built engine needs, so
      // it is replayed to the engine's handler the moment it attaches.
      SetPaused: "replay",
      SetVolume: "replay",
    },
    // State: whichever component mounts later still sees the current scene.
    toApp: { SceneCreated: "replay" },
  },
});

const { toEngine, toApp } = sceneEvents;

export const sceneEventsToEngine = toEngine;
export const sceneEventsToApp = toApp;

/** Per-event emit helpers, e.g. `notifyApp.SceneCreated({ scene })`. */
export const notifyApp = notifiers(toApp);

/** Per-event emit helpers, e.g. `notifyEngine.SetVolume(0.5)`. */
export const notifyEngine = notifiers(toEngine);
