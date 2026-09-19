import { Container } from "./Container";
import { toCssColor } from "./color";

type Shape =
  | { kind: "circle"; x: number; y: number; radius: number }
  | { kind: "rect"; x: number; y: number; width: number; height: number };

export type StrokeStyle = { width: number; color: number; alpha?: number };

function tracePath(ctx: CanvasRenderingContext2D, shape: Shape): void {
  ctx.beginPath();
  if (shape.kind === "circle") {
    ctx.arc(shape.x, shape.y, shape.radius, 0, Math.PI * 2);
  } else {
    ctx.rect(shape.x, shape.y, shape.width, shape.height);
  }
}

/** A minimal stand-in for Pixi's `Graphics`: buffers `circle()`/`rect()` shapes and replays them on `fill()`/`stroke()`. */
export class Graphics extends Container {
  private pendingShapes: Shape[] = [];
  private fills: { shapes: Shape[]; color: number; alpha: number }[] = [];
  private strokes: { shapes: Shape[]; style: StrokeStyle }[] = [];

  circle(x: number, y: number, radius: number): this {
    this.pendingShapes.push({ kind: "circle", x, y, radius });
    return this;
  }

  rect(x: number, y: number, width: number, height: number): this {
    this.pendingShapes.push({ kind: "rect", x, y, width, height });
    return this;
  }

  fill(color: number, alpha = 1): this {
    this.fills.push({ shapes: [...this.pendingShapes], color, alpha });
    return this;
  }

  stroke(style: StrokeStyle): this {
    this.strokes.push({ shapes: [...this.pendingShapes], style });
    return this;
  }

  protected paintSelf(ctx: CanvasRenderingContext2D): void {
    for (const { shapes, color, alpha } of this.fills) {
      ctx.fillStyle = toCssColor(color, alpha);
      for (const shape of shapes) {
        tracePath(ctx, shape);
        ctx.fill();
      }
    }
    for (const { shapes, style } of this.strokes) {
      ctx.strokeStyle = toCssColor(style.color, style.alpha ?? 1);
      ctx.lineWidth = style.width;
      for (const shape of shapes) {
        tracePath(ctx, shape);
        ctx.stroke();
      }
    }
  }
}
