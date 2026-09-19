import { Container } from "./Container";
import { Ticker } from "./Ticker";
import { toCssColor } from "./color";

export type ApplicationOptions = {
  width: number;
  height: number;
  backgroundColor?: number;
};

/**
 * A minimal stand-in for Pixi's `Application`: owns the canvas, a
 * `requestAnimationFrame` loop, and the root of the display tree.
 *
 * Unlike Pixi's, `init()` is synchronous — the Canvas 2D context has no async
 * setup step, so there's nothing here to await.
 */
export class Application {
  readonly stage = new Container();
  readonly ticker = new Ticker();
  canvas!: HTMLCanvasElement;

  private context!: CanvasRenderingContext2D;
  private backgroundColor = 0x000000;
  private rafId: number | null = null;

  init(options: ApplicationOptions): void {
    this.canvas = document.createElement("canvas");
    this.canvas.width = options.width;
    this.canvas.height = options.height;
    this.context = this.canvas.getContext("2d")!;
    this.backgroundColor = options.backgroundColor ?? 0x000000;
    this.start();
  }

  get screen(): { width: number; height: number } {
    return { width: this.canvas.width, height: this.canvas.height };
  }

  start(): void {
    if (this.rafId !== null) return;
    let lastTime = performance.now();
    const loop = (time: number): void => {
      this.ticker.tick(time - lastTime);
      lastTime = time;
      this.render();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId === null) return;
    cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private render(): void {
    const { width, height } = this.screen;
    this.context.save();
    this.context.fillStyle = toCssColor(this.backgroundColor);
    this.context.fillRect(0, 0, width, height);
    this.context.restore();
    this.stage.render(this.context);
  }

  /** @param removeView Also removes the canvas from the DOM. */
  destroy(removeView = false): void {
    this.stop();
    this.stage.destroy({ children: true });
    if (removeView) this.canvas.remove();
  }
}
