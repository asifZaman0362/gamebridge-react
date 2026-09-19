# demo-pixi

A small grid game in PixiJS 8 with a React shell around it, wired together with [gamebridge-react](../../README.md). The game is deliberately minimal; the point is the bridge.

## Run

```sh
pnpm install                  # at the repo root
pnpm --filter demo-pixi dev
```

## What's on screen

- **Game canvas** (`PixiGame`) — initialises a Pixi `Application`, destroys it on unmount.
- **HUD** — health / score / steps, fed only over the bridge.
- **Control panel** — pause, level select, volume. React → engine.
- **Achievements drawer** — unlock list and toasts. Engine → React.
- **Debug console** — every bridge record, live, via `attachLogger`.
- **Unmount game** — tears the game screen down so `dispose()` can be watched in the console.

## The library in a paragraph

`createBridgePair<ToEngine, ToApp>()` gives one typed, one-directional bridge per direction. Each event declares what happens if it's emitted before anything listens: `none` (drop it), `queue` (hold it for the next subscriber, deliver once) or `replay` (hand the latest payload to every later subscriber). React subscribes with `useBridgeEvent`, which ties the subscription to the component's lifetime. Full docs: [core](../../packages/core/README.md), [react](../../packages/react/README.md).

## Bridges in this demo

| Bridge | Direction | Event | Mode | Why |
| --- | --- | --- | --- | --- |
| `sceneEvents.toEngine` | React → Pixi | `LoadScene` | `queue` | A level picked while `app.init()` is still pending loads once it resolves. |
| | | `UnloadScene` | `none` | If the engine isn't up there is nothing to unload. |
| | | `SetPaused`, `SetVolume` | `replay` | UI-owned state; a rebuilt engine gets the current values on attach. |
| `sceneEvents.toApp` | Pixi → React | `SceneCreated` | `replay` | Whatever mounts later still learns the current scene. |
| `playerStatsToApp` | Pixi → React | `statsChanged` | `replay` | A HUD mounting mid-level sees current stats. |
| `achievementsToApp` | Pixi → React | `unlocked` | `queue` | A toast shows exactly once, even if the drawer was unmounted at unlock time. |
| | | `statusChanged` | `replay` | The drawer gets the full list whenever it mounts. |

## Where the library is used

- [`src/pixi/SceneEvents.ts`](src/pixi/SceneEvents.ts) — `createBridgePair` and `notifiers` for the scene commands.
- [`src/pixi/PlayerStatsBridge.ts`](src/pixi/PlayerStatsBridge.ts), [`src/pixi/AchievementTracker.ts`](src/pixi/AchievementTracker.ts) — one-way `createBridge`s reporting to the app.
- [`src/pixi/main.ts`](src/pixi/main.ts) — engine-side `.on()` handlers, labelled for the debug console, attached after Boot has run.
- [`src/components/`](src/components) — `useBridgeEvent` in `Hud`, `AchievementsDrawer` and `PixiGame`; `notifyEngine.*` in `ControlPanel`; `attachLogger` and `formatPayload` in `DebugConsole`.
- [`src/App.tsx`](src/App.tsx) — `dispose()` when the game screen unmounts.

## Lifecycle: `clear()` vs `dispose()`

- `PixiGame` calls `sceneEventsToApp.clear()` and `playerStatsToApp.clear()` when the `Application` is destroyed (Strict Mode remount, HMR). The engine that produced those replay values is gone, so a component mounting before the next engine reports must not receive them. `toEngine` is left alone: its queued commands and replayed UI state are exactly what the next engine should pick up.
- `App` calls `sceneEvents.dispose()` and `playerStatsToApp.dispose()` when the whole game screen leaves; subscriptions and buffers both go. `achievementsToApp` is not disposed: its retained status is app-lifetime state the drawer should see next time.

## Pixi-specific notes

- **`app.init()` is async**, so the window between "React emitted a command" and "an engine exists to take it" is real, and `LoadScene: "queue"` is what covers it. `PixiGame` also has to handle Strict Mode unmounting while init is still pending; a `cancelled` flag destroys the just-created app instead of leaking it.
- **Pixi has no scene manager**, so [`SceneManager.ts`](src/pixi/SceneManager.ts) is a minimal push/pop stack. Engine handlers attach after `manager.start("Boot")`, so a `LoadScene` drained from the bridge lands after Boot has handed over to the menu rather than being replaced by it.
- **No audio.** The `SetVolume` handler is a no-op, kept so the control panel's slider has the same bridge surface as the Phaser demo.
- The active scene is torn down before the `Application`: a level's keyboard bindings and timers belong to the scene, not the renderer.
- `SceneCreated` carries a live `Scene` with its whole display tree. The debug console's `formatPayload` swaps it for the scene key before logging.
