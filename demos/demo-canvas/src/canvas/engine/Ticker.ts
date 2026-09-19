export type TickerCallback = (ticker: Ticker) => void;

/** A minimal stand-in for Pixi's `Ticker`: tracks the current frame's delta and runs per-frame callbacks. */
export class Ticker {
  deltaMS = 0;

  private readonly callbacks: TickerCallback[] = [];

  add(fn: TickerCallback): void {
    this.callbacks.push(fn);
  }

  remove(fn: TickerCallback): void {
    const index = this.callbacks.indexOf(fn);
    if (index !== -1) this.callbacks.splice(index, 1);
  }

  /** Advances the ticker by `deltaMS` and runs every registered callback. */
  tick(deltaMS: number): void {
    this.deltaMS = deltaMS;
    // Snapshot first: a callback may add/remove listeners while this runs.
    for (const callback of [...this.callbacks]) callback(this);
  }
}
