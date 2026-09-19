# demo-phaser

A small grid game in Phaser 4 with a React shell around it, wired together with [gamebridge-react](../../README.md). The game is deliberately minimal; the point is the bridge.

## Run

```sh
pnpm install                    # at the repo root
pnpm --filter demo-phaser dev
```

## What's on screen

- **Game canvas** (`PhaserGame`) — boots Phaser, destroys it on unmount.
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
| `sceneEvents.toEngine` | React → Phaser | `LoadScene` | `queue` | A level picked before Phaser has booted still loads, once. |
| | | `UnloadScene` | `none` | If the engine isn't up there is nothing to unload. |
| | | `SetPaused`, `SetVolume` | `replay` | UI-owned state; a rebuilt engine gets the current values on attach. |
| `sceneEvents.toApp` | Phaser → React | `SceneCreated` | `replay` | Whatever mounts later still learns the current scene. |
| `playerStatsToApp` | Phaser → React | `statsChanged` | `replay` | A HUD mounting mid-level sees current stats. |
| `achievementsToApp` | Phaser → React | `unlocked` | `queue` | A toast shows exactly once, even if the drawer was unmounted at unlock time. |
| | | `statusChanged` | `replay` | The drawer gets the full list whenever it mounts. |

## Where the library is used

- [`src/phaser/SceneEvents.ts`](src/phaser/SceneEvents.ts) — `createBridgePair` and `notifiers` for the scene commands.
- [`src/phaser/PlayerStatsBridge.ts`](src/phaser/PlayerStatsBridge.ts), [`src/phaser/AchievementTracker.ts`](src/phaser/AchievementTracker.ts) — one-way `createBridge`s reporting to the app.
- [`src/phaser/main.ts`](src/phaser/main.ts) — engine-side `.on()` handlers, labelled for the debug console, attached once Phaser can take scene commands.
- [`src/components/`](src/components) — `useBridgeEvent` in `Hud`, `AchievementsDrawer` and `PhaserGame`; `notifyEngine.*` in `ControlPanel`; `attachLogger` and `formatPayload` in `DebugConsole`.
- [`src/App.tsx`](src/App.tsx) — `dispose()` when the game screen unmounts.

## Lifecycle: `clear()` vs `dispose()`

- `PhaserGame` calls `sceneEventsToApp.clear()` and `playerStatsToApp.clear()` when the `Game` is destroyed (Strict Mode remount, HMR). The engine that produced those replay values is gone, so a component mounting before the next engine reports must not receive them. `toEngine` is left alone: its queued commands and replayed UI state are exactly what the next engine should pick up.
- `App` calls `sceneEvents.dispose()` and `playerStatsToApp.dispose()` when the whole game screen leaves; subscriptions and buffers both go. `achievementsToApp` is not disposed: its retained status is app-lifetime state the drawer should see next time.

## Phaser-specific notes

- **Engine handlers attach after the first `POST_STEP`.** Phaser boots its scene manager asynchronously, and Boot's hand-off to MainMenu is a queued operation. Attaching earlier means a `LoadScene` drained from the bridge reaches `scene.start()` before the manager is ready, and the level ends up running alongside the menu.
- **`game.events` is not reused as the transport.** The bridges are module-level singletons that outlive any one `Game`; a bridge-owned `GenericTransport` is the one thing that survives a rebuild.
- **Phaser never calls `destroy()` on a scene**, so `main.ts` calls it explicitly on `LevelBase` scenes before stopping them.
- `SceneCreated` carries a live `Phaser.Scene`, which references the whole `Game`. The debug console's `formatPayload` swaps it for the scene key before logging, or serialising it would blow the string length limit.
