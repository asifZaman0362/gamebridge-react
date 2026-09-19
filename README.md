# gamebridge-react

Typed, fault-tolerant event bridge for wiring React to imperative game/canvas engines — Phaser, PixiJS, Three.js, or your own.

## The problem

A React tree and a game engine mount independently, so either side can emit before the other is listening. A plain emitter drops those events. The bridge lets each event declare what should happen instead:

| Mode | Behaviour | Use for |
| --- | --- | --- |
| `none` | Dropped if nothing is listening. | High-frequency streams. |
| `queue` | Held until the next subscriber, delivered once, in order. | Commands. |
| `replay` | Latest payload handed to every later subscriber. | State. |

```tsx
import { useState } from "react";
import { createBridgePair } from "@gamebridge-react/core";
import { useBridgeEvent } from "@gamebridge-react/react";

type ToEngine = { load: { url: string }; pause: void };
type ToApp = { ready: void; score: number };

export const { toEngine, toApp } = createBridgePair<ToEngine, ToApp>({
  buffer: {
    toEngine: { load: "queue" },  // runs once, even if the engine boots late
    toApp: { score: "replay" },   // a HUD mounting mid-game sees the current score
  },
});

// React side
function Hud() {
  const [score, setScore] = useState(0);
  useBridgeEvent(toApp, "score", setScore);
  return <span>{score}</span>;
}

// Engine side
toEngine.on("load", ({ url }) => engine.load(url));
toApp.emit("score", 42);
```

## Packages

| Package | What it is |
| --- | --- |
| [`@gamebridge-react/core`](packages/core/README.md) | The bridge: typed event maps, per-event buffering, pluggable transports, logging. No React dependency. |
| [`@gamebridge-react/react`](packages/react/README.md) | `useBridgeEvent` and `useBridgeEmit` hooks over a core bridge. |

Full API and the reasoning behind it are in the [core README](packages/core/README.md).

## Example use cases

Each demo is the same small grid game with the same React shell around it — HUD, control panel, achievements drawer, debug console — so the only thing that differs is the engine integration. Every demo's README explains which bridges it creates and where the library is used.

| Demo | Engine | What it shows |
| --- | --- | --- |
| [demo-phaser](demos/demo-phaser) | Phaser 4 | An engine with its own scene manager and async boot. Engine-side handlers must attach *after* boot, or a queued `LoadScene` lands before the scene manager can take it. |
| [demo-pixi](demos/demo-pixi) | PixiJS 8 | A renderer with no scene manager. `await app.init()` makes the "command emitted before the engine exists" window real. |
| [demo-canvas](demos/demo-canvas) | Hand-rolled 2D canvas | An engine with no emitter of its own, on the default `GenericTransport`. |

```sh
pnpm install
pnpm --filter demo-phaser dev   # or demo-pixi, demo-canvas
```

## Development

```sh
pnpm install
pnpm build                                  # builds both packages
pnpm typecheck
pnpm --filter @gamebridge-react/core test
```

## License

MIT
