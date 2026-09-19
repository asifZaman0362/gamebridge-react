import type { Ticker } from "../engine";

export type AnimateOptions = {
  duration: number;
  delay?: number;
  /** Play forward then back to the start, looping forever rather than calling `onComplete`. */
  yoyo?: boolean;
  /** Extra repeats after the first pass; -1 repeats forever. Ignored when `yoyo` is set. */
  repeat?: number;
  onUpdate: (values: Record<string, number>) => void;
  onComplete?: () => void;
};

const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

/**
 * Ticker-driven tween between two flat numeric value sets — a minimal stand-in
 * for Phaser's tween system, covering only what MainMenu's decorative
 * animations need: delay, yoyo, and infinite repeat.
 */
export function animate(
  ticker: Ticker,
  from: Record<string, number>,
  to: Record<string, number>,
  options: AnimateOptions,
): () => void {
  const { duration, delay = 0, yoyo = false, repeat = 0, onUpdate, onComplete } = options;
  const keys = Object.keys(to);

  let elapsed = -delay;
  let direction: 1 | -1 = 1;
  let repeatsLeft = repeat;

  const step = (ticker: Ticker): void => {
    elapsed += ticker.deltaMS;
    if (elapsed < 0) return;

    const progress = Math.min(elapsed / duration, 1);
    const eased = easeInOutSine(progress);
    const values: Record<string, number> = {};
    for (const key of keys) {
      const start = direction === 1 ? from[key] : to[key];
      const end = direction === 1 ? to[key] : from[key];
      values[key] = start + (end - start) * eased;
    }
    onUpdate(values);

    if (progress < 1) return;

    if (yoyo && direction === 1) {
      direction = -1;
      elapsed = 0;
      return;
    }
    if (yoyo || repeatsLeft < 0 || repeatsLeft > 0) {
      if (repeatsLeft > 0) repeatsLeft -= 1;
      direction = 1;
      elapsed = 0;
      return;
    }

    ticker.remove(step);
    onComplete?.();
  };

  ticker.add(step);
  return () => ticker.remove(step);
}
