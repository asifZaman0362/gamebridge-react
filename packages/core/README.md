# @gamebridge-react/core

Typed, fault-tolerant event bridge for wiring a declarative UI layer to an imperatively managed engine — a renderer, game loop, or canvas.

## The problem

A UI framework and an engine mount independently. Either side may emit before the other is listening:

- The UI issues a command while the engine is still initialising. With a plain emitter, the command is lost.
- The engine reports it is ready before a component subscribes. That component then waits forever for an event that already fired.
- A second component subscribes later and needs the current state, not the next change.

These three cases need different handling, which is why buffering is declared per event rather than applied uniformly.

## Install

```sh
npm install @gamebridge-react/core
```

## Usage

```ts
import { createBridgePair } from '@gamebridge-react/core';

type ToEngine = {
  load: { url: string };
  seek: { seconds: number };
  pause: void;
};

type ToApp = {
  ready: void;
  progress: { done: number; total: number };
};

export const { toEngine, toApp } = createBridgePair<ToEngine, ToApp>({
  buffer: {
    toEngine: { load: 'queue' },   // a command: deliver once, to whoever mounts
    toApp: { ready: 'replay' },    // state: every late subscriber needs it
  },
});
```

Emit from either side. The payload argument is omitted for `void` events:

```ts
toEngine.emit('load', { url: '/scene.json' });
toEngine.emit('pause');
```

Event maps may be declared with `type` or `interface`.

Subscribe, and dispose when the subscriber goes away:

```ts
const dispose = toApp.on('progress', ({ done, total }) => {
  setProgress(done / total);
});

dispose();
```

### Tearing down

Two operations cover the lifecycle of the engine side:

```ts
// The engine was destroyed and will be rebuilt: buffered state it produced
// (a retained `ready`, a queued command for the old instance) is stale, but
// the subscribers are still valid.
toApp.clear();

// This module is going away entirely — a hot reload, a route change out of
// the game: drop every subscription and every buffer on both directions.
pair.dispose();
```

`dispose()` removes only what the bridge registered, so listeners the engine holds on a shared transport are untouched, and the bridge stays usable afterwards. With Vite, the natural place for it is the module's own HMR hook:

```ts
if (import.meta.hot) import.meta.hot.dispose(() => pair.dispose());
```

## Buffering modes

Declared per event. Events with no declared mode default to `none`.

| Mode | Behaviour | Use for |
| --- | --- | --- |
| `none` | Discarded if nothing is listening. | High-frequency streams, where a backlog is worse than a gap. |
| `queue` | Retained while nothing listens, delivered in order to the first subscriber, then cleared. | Commands, which must happen exactly once. |
| `replay` | Most recent payload retained and delivered to every later subscriber. | State, where any subscriber needs the current value. |

The distinction between `queue` and `replay` is the one most easily got wrong. Buffering only while the listener count is zero — a common shortcut — is correct for commands and wrong for state: a second subscriber attaching later receives nothing, because nothing was buffered while the first was attached.

## Transports

The backend that carries messages is pluggable. The contract is three methods:

```ts
interface EventTransport {
  emit(event: string, payload?: any): void;
  on(event: string, fn: (payload: any) => void, context?: any): void;
  off(event: string, fn?: (payload: any) => void, context?: any): void;
}
```

`once` is not required: the bridge implements one-shot subscriptions on top of `on` and `off`.

By default each bridge creates its own `GenericTransport`, which suits engines that expose only a scene graph and a render loop. An engine that already owns an emitter can be used as the backend directly, with no wrapper — the signature above deliberately matches the widely used `eventemitter3` shape, so such emitters conform structurally:

```ts
createBridgePair<ToEngine, ToApp>({ toEngineTransport: engine.events });
```

## One bridge, or several

`createBridgePair` is the common shape, but nothing requires exactly two. `createBridge` makes a single channel, which is what you want for several channels in the same direction, a subsystem with its own event vocabulary, or one bridge shared between two engines:

```ts
import { createBridge, attachLogger, consoleLogger } from '@gamebridge-react/core';

const sceneCommands = createBridge<SceneEvents>({ name: 'scene', buffer: { load: 'queue' } });
const audioCommands = createBridge<AudioEvents>({ name: 'audio' });
const engineReports = createBridge<ReportEvents>({ name: 'reports', buffer: { ready: 'replay' } });
```

Give each one a `name`: that is what distinguishes them in log records. Point them all at one sink with `attachLogger`, which returns a disposer:

```ts
const stop = attachLogger(
  [sceneCommands, audioCommands, engineReports],
  consoleLogger,
  { verbose: true },
);

stop();
```

Bridges with unrelated event maps can be logged together, including the two halves of a pair.

## Why two bridges

`createBridgePair` gives each direction its own bridge and its own transport.

Sharing one emitter across both directions means an event name appearing in both maps — something generic like `reset` or `pause` — can trigger the wrong side's handler: the UI emits `reset` towards the engine and the UI's own `reset` subscriber fires. Separate transports make that impossible structurally, rather than relying on the two maps never colliding.

Separate maps also give direction-correct typing. An event declared only in `ToApp` cannot be emitted on the `toEngine` bridge:

```ts
toEngine.emit('ready', undefined);
//              ~~~~~  not assignable to keyof ToEngine
```

If two bridges must share one transport, give each a `namespace` instead. `createBridgePair` does this automatically when the same transport is passed for both directions.

## Logging

Off by default. Attach any object with a `debug` method:

```ts
import { consoleLogger } from '@gamebridge-react/core';

pair.enableLogging(consoleLogger);
pair.disableLogging();
```

One record per emission, carrying the bus, event, payload, and what became of it:

```json
{
  "bus": "toEngine",
  "event": "load",
  "payload": { "url": "/scene.json" },
  "disposition": "queued"
}
```

`disposition` is usually the answer being looked for. `delivered` means something received the event; `dropped`, `queued`, and `retained` each mean nothing did, and say what happened instead.

| Disposition | Meaning |
| --- | --- |
| `delivered` | At least one subscriber received it. |
| `dropped` | Nothing was listening and the event was not buffered. |
| `queued` | Nothing was listening; retained for the next subscriber. |
| `retained` | Nothing was listening; kept as current state. |

With `verbose`, records also list the subscribed handlers by name, and subscription lifecycle is reported — `subscribe`, `unsubscribe`, `drain`, `replay`, `clear`, `evict`:

```ts
pair.enableLogging(consoleLogger, { verbose: true });
```

```json
{
  "bus": "scene",
  "event": "load",
  "payload": { "url": "/a.json" },
  "disposition": "delivered",
  "listeners": ["loadScene", "trackTelemetry", "hud:refresh"]
}
```

Handler names come from the functions themselves, so named functions and arrows assigned to a `const` identify themselves. Anonymous handlers show as `(anonymous)`; pass `label` when subscribing to name them explicitly, which also survives minification:

```ts
bridge.on('load', () => refreshHud(), { label: 'hud:refresh' });
```

The same list is available on demand, without logging:

```ts
bridge.listenerNames('load'); // ['loadScene', 'trackTelemetry', 'hud:refresh']
```

Subscriber failures are reported at both levels, since a silently failing subscriber is usually why logging was turned on:

```json
{ "bus": "toApp", "event": "progress", "action": "error", "error": "Cannot read properties of undefined" }
```

Large payloads can be trimmed without affecting what subscribers receive:

```ts
pair.enableLogging(consoleLogger, {
  formatPayload: (payload, event) => (event === 'load' ? '[omitted]' : payload),
});
```

The sink receives a plain object, so records can be forwarded to a structured logger rather than printed. `consoleLogger` pretty-prints them via `safeStringify`, which tolerates the circular structures engine objects routinely carry.

A logger is never allowed to break the application: a throwing sink is swallowed, and logging adds one null check per emit when disabled.

## Fault tolerance

- **Handler isolation.** A subscriber that throws does not prevent other subscribers from running, whatever transport is in use — every handler is registered through an isolating wrapper, so an engine emitter with no isolation of its own (such as `eventemitter3`) is still safe. Errors are routed to `onError`, which defaults to logging; a throwing `onError` is swallowed.
- **Nothing throws.** `emit`, `on`, `off` and disposers never throw, including when the underlying transport has already been destroyed — a UI framework may unmount a subtree while the engine is mid-teardown. Transport failures are reported to `onError`, and a subscription the transport refused yields a no-op disposer.
- **Stable dispatch.** `GenericTransport` snapshots the handler list before dispatch, so subscribing or unsubscribing from inside a handler does not disturb the current dispatch. Engine emitters built on `eventemitter3` behave the same way.
- **Shared transports stay intact.** `off(event)` removes only what the bridge registered, never listeners the engine holds on the same emitter.
- **Bounded buffers.** `queue` events retain at most `maxQueued` payloads (default 256), so a subscriber that never attaches cannot grow memory without limit.
- **No double-running commands.** A `queue` emission that was delivered live is not retained, so a subscriber attaching later does not re-run work another subscriber already did.

## API

| Member | Purpose |
| --- | --- |
| `new Bridge<Events>(options)` | A typed, one-directional channel. |
| `createBridge<Events>(options)` | The same, as a factory. |
| `createBridgePair<ToEngine, ToApp>(options)` | Two bridges, one per direction, each with its own transport. |
| `attachLogger(bridges, logger, options?)` | Log several bridges to one sink; returns a disposer. |
| `bridge.emit(event, payload)` | Emit, applying the event's buffering mode. |
| `bridge.on(event, handler, options?)` | Subscribe; returns a disposer. |
| `bridge.once(event, handler, options?)` | Subscribe for a single occurrence. |
| `bridge.off(event, handler?)` | Remove a subscription, or all for an event. |
| `bridge.clear(event?)` | Discard buffered payloads. Call when the engine is rebuilt. |
| `bridge.dispose()` | Remove every subscription and discard every buffer. Call when the module is unloaded. |
| `pair.clear()` / `pair.dispose()` | The same, for both directions of a pair. |
| `bridge.queuedCount(event)` | Retained `queue` payloads. Diagnostics. |
| `bridge.hasRetained(event)` | Whether a `replay` payload is held. Diagnostics. |
| `bridge.listenerCount(event)` | Subscriptions this bridge holds for an event. |
| `bridge.listenerNames(event)` | Names of those subscriptions, in order. |
| `bridge.transportListenerCount(event)` | The transport's own count, when it can report one. |
| `bridge.enableLogging(logger, options?)` | Start diagnostic logging. |
| `bridge.disableLogging()` | Stop diagnostic logging. |
| `consoleLogger` | Pretty-printing logger, circular-safe. |
| `GenericTransport` | Default backend for engines with no emitter. |
| `notifiers(bridge)` / `listeners(bridge)` | Optional per-event call-site sugar. |

### Listen options

| Option | Default | Meaning |
| --- | --- | --- |
| `context` | — | `this` binding for the handler. |
| `once` | `false` | Remove the subscription after one invocation. |
| `label` | function name | Name for this handler in log records. |
| `collectWaiting` | `true` | Whether this subscriber consumes a `queue` event. Set `false` for an observer that sees live emissions but must not consume a backlog another subscriber is waiting for; while only observers are attached, emissions are still retained. |

## License

MIT
