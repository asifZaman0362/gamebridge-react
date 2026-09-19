import type { Ticker } from "../engine";

/**
 * A repeating delay-based callback driven by the shared ticker, standing in
 * for Phaser's `scene.time.addEvent({ delay, loop: true })`. Ticker-driven
 * rather than `setInterval` so that stopping the app's ticker (pause) also
 * freezes every timer built on this, with no separate pause bookkeeping.
 */
export class IntervalTimer {
  private elapsedMs = 0;

  private readonly ticker: Ticker;
  private readonly delayMs: number;
  private readonly callback: () => void;

  constructor(ticker: Ticker, delayMs: number, callback: () => void) {
    this.ticker = ticker;
    this.delayMs = delayMs;
    this.callback = callback;
    this.ticker.add(this.tick);
  }

  private readonly tick = (ticker: Ticker): void => {
    this.elapsedMs += ticker.deltaMS;
    while (this.elapsedMs >= this.delayMs) {
      this.elapsedMs -= this.delayMs;
      this.callback();
    }
  };

  destroy(): void {
    this.ticker.remove(this.tick);
  }
}
