import { createBridgePair, notifiers } from "@gamebridge-react/core";

/** The MainMenu scene's key, shared so nothing has to spell it out twice. */
export const MAIN_MENU_SCENE = "MainMenu";

/** Level scenes selectable from the Control Panel's level dropdown. */
export const LEVEL_SCENES = ["LevelLava"] as const;
export type LevelSceneKey = (typeof LEVEL_SCENES)[number];

export type SceneEventsToApp = {
  SceneCreated: { scene: Phaser.Scene };
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

const { toEngine, toApp } = createBridgePair<
  SceneEventsToEngine,
  SceneEventsToApp
>({
  buffer: {
    // A load requested before the engine has booted still runs, exactly once.
    toEngine: { LoadScene: "queue" },
    // Whichever component mounts later still sees the current scene immediately.
    toApp: { SceneCreated: "replay" },
  },
});

export const sceneEventsToEngine = toEngine;
export const sceneEventsToApp = toApp;

/** Per-event emit helpers, e.g. `notifyApp.SceneCreated({ scene })`. */
export const notifyApp = notifiers(toApp);

/** Per-event emit helpers, e.g. `notifyEngine.SetVolume(0.5)`. */
export const notifyEngine = notifiers(toEngine);
