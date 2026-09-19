# @gamebridge-react/react

React hooks for [`@gamebridge-react/core`](../core/README.md). The bridge itself has no React dependency; these hooks tie a subscription to a component's lifetime.

## Install

```sh
npm install @gamebridge-react/core @gamebridge-react/react
```

## useBridgeEvent

Subscribe for the lifetime of the component. The disposer from `bridge.on` becomes the effect cleanup.

```tsx
import { useBridgeEvent } from "@gamebridge-react/react";

function Hud() {
  const [stats, setStats] = useState(INITIAL);
  useBridgeEvent(toApp, "statsChanged", setStats, { label: "Hud" });
  return <span>{stats.score}</span>;
}
```

- `handler` does not need to be stable. The latest one is always called, so an inline closure over current props or state is fine without `useCallback`.
- The subscription is re-created only when `bridge`, `event`, `enabled` or another option changes. Whatever buffering the event declares applies on each (re)subscribe: a `replay` event delivers its retained payload, a `queue` event drains its backlog.
- All of [`ListenOptions`](../core/README.md#listen-options) are accepted, plus `enabled` (default `true`) to hold off subscribing without unmounting the component.

Gotchas:

- `context` is compared by identity. An object literal written inline resubscribes on every render — and on a `replay` event, re-delivers the retained payload each time.
- With `once`, the subscription ends after its first delivery and is not re-created until a dependency changes.

## useBridgeEmit

A referentially stable `emit` for one bridge, for when it's passed as a prop or listed as a dependency. `bridge.emit` can always be called directly instead.

```tsx
const emit = useBridgeEmit(toEngine);
<PlaybackControls onSeek={(seconds) => emit("seek", { seconds })} />
```

## License

MIT
