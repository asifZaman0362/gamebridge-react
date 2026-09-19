# demo-canvas

A small grid game on a plain 2D canvas with a React shell around it, wired together with [gamebridge-react](../../README.md). The game is deliberately minimal; the point is the bridge.

## Run

```sh
pnpm install                    # at the repo root
pnpm --filter demo-canvas dev
```

## What's on screen

- **Game canvas** (`CanvasGame`) — creates the engine, destroys it on unmount.
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
| `sceneEvents.toEngine` | React → engine | `LoadScene` | `queue` | A level picked before the engine exists still loads, once. |
| | | `UnloadScene` | `none` | If the engine isn't up there is nothing to unload. |
| | | `SetPaused`, `SetVolume` | `replay` | UI-owned state; a rebuilt engine gets the current values on attach. |
| `sceneEvents.toApp` | engine → React | `SceneCreated` | `replay` | Whatever mounts later still learns the current scene. |
| `playerStatsToApp` | engine → React | `statsChanged` | `replay` | A HUD mounting mid-level sees current stats. |
| `achievementsToApp` | engine → React | `unlocked` | `queue` | A toast shows exactly once, even if the drawer was unmounted at unlock time. |
| | | `statusChanged` | `replay` | The drawer gets the full list whenever it mounts. |

## Where the library is used

- [`src/canvas/SceneEvents.ts`](src/canvas/SceneEvents.ts) — `createBridgePair` and `notifiers` for the scene commands.
- [`src/canvas/PlayerStatsBridge.ts`](src/canvas/PlayerStatsBridge.ts), [`src/canvas/AchievementTracker.ts`](src/canvas/AchievementTracker.ts) — one-way `createBridge`s reporting to the app.
- [`src/canvas/main.ts`](src/canvas/main.ts) — engine-side `.on()` handlers, labelled for the debug console, attached after Boot has run.
- [`src/components/`](src/components) — `useBridgeEvent` in `Hud`, `AchievementsDrawer` and `CanvasGame`; `notifyEngine.*` in `ControlPanel`; `attachLogger` and `formatPayload` in `DebugConsole`.
- [`src/App.tsx`](src/App.tsx) — `dispose()` when the game screen unmounts.

## Lifecycle: `clear()` vs `dispose()`

- `CanvasGame` calls `sceneEventsToApp.clear()` and `playerStatsToApp.clear()` when the engine is destroyed (Strict Mode remount, HMR). The engine that produced those replay values is gone, so a component mounting before the next engine reports must not receive them. `toEngine` is left alone: its queued commands and replayed UI state are exactly what the next engine should pick up.
- `App` calls `sceneEvents.dispose()` and `playerStatsToApp.dispose()` when the whole game screen leaves; subscriptions and buffers both go. `achievementsToApp` is not disposed: its retained status is app-lifetime state the drawer should see next time.

## Canvas-specific notes

- **The engine is hand-rolled.** [`src/canvas/engine/`](src/canvas/engine) is a tiny `Application` / `Container` / `Graphics` / `Text` / `Ticker` over `CanvasRenderingContext2D`, shaped like Pixi's API so the scene code is nearly identical to the Pixi demo's.
- **It has no emitter at all**, which is the case the bridge's default `GenericTransport` exists for. There is nothing engine-side to pass as a transport, and no reason to want one.
- Initialisation is synchronous, so unlike the Pixi demo there is no pending-init window to guard in `CanvasGame`; `LoadScene: "queue"` still matters for a command sent before `CanvasGame` has mounted at all.
- **No scene manager** either; [`SceneManager.ts`](src/canvas/SceneManager.ts) is the same push/pop stack as the Pixi demo. Engine handlers attach after `manager.start("Boot")`, so a queued `LoadScene` lands after Boot has handed over to the menu.
- **No audio.** The `SetVolume` handler is a no-op, kept so the control panel's slider has the same bridge surface as the other demos.
- `SceneCreated` carries a live `Scene` with its whole display tree. The debug console's `formatPayload` swaps it for the scene key before logging.
