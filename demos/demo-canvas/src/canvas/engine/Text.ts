import { Container } from "./Container";
import { toCssColor } from "./color";

export type TextStyle = {
  fontFamily: string;
  fontSize: number;
  fontWeight?: string;
  fill: number;
  stroke?: { color: number; width: number };
};

export type TextOptions = { text: string; style: TextStyle };

/** A minimal stand-in for Pixi's `Text`: draws with the Canvas 2D text APIs, anchored the same way Pixi's is (`0` = top/left origin, `0.5` = centered, `1` = bottom/right). */
export class Text extends Container {
  text: string;
  style: TextStyle;

  private anchorX = 0;
  private anchorY = 0;

  readonly anchor = {
    set: (x: number, y: number = x): void => {
      this.anchorX = x;
      this.anchorY = y;
    },
  };

  constructor(options: TextOptions) {
    super();
    this.text = options.text;
    this.style = options.style;
  }

  protected paintSelf(ctx: CanvasRenderingContext2D): void {
    const { fontFamily, fontSize, fontWeight, fill, stroke } = this.style;
    ctx.font = `${fontWeight ?? "normal"} ${fontSize}px ${fontFamily}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    const width = ctx.measureText(this.text).width;
    const x = -this.anchorX * width;
    const y = -this.anchorY * fontSize;

    if (stroke) {
      ctx.strokeStyle = toCssColor(stroke.color);
      ctx.lineWidth = stroke.width;
      ctx.strokeText(this.text, x, y);
    }
    ctx.fillStyle = toCssColor(fill);
    ctx.fillText(this.text, x, y);
  }
}
