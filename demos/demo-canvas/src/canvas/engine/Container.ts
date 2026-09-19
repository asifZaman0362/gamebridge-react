export type DestroyOptions = boolean | { children?: boolean };

/**
 * A minimal retained-mode display node. The Canvas 2D API is immediate-mode
 * and has no scene graph of its own, so this (plus {@link Graphics} and
 * {@link Text}) stands in for just enough of Pixi's `Container` API that the
 * game code ported from the Pixi demo barely had to change.
 */
export class Container {
  x = 0;
  y = 0;
  alpha = 1;
  visible = true;

  protected scaleX = 1;
  protected scaleY = 1;

  readonly children: Container[] = [];
  private parent: Container | null = null;

  readonly position = {
    set: (x: number, y: number): void => {
      this.x = x;
      this.y = y;
    },
  };

  readonly scale = {
    set: (value: number): void => {
      this.scaleX = value;
      this.scaleY = value;
    },
  };

  addChild(child: Container): void {
    child.parent?.removeChild(child);
    child.parent = this;
    this.children.push(child);
  }

  removeChild(child: Container): void {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
      child.parent = null;
    }
  }

  /** Draws this node's own content. Left undefined on a bare `Container`, which is just a group; {@link Graphics} and {@link Text} implement it. */
  protected paintSelf?(ctx: CanvasRenderingContext2D): void;

  /** Applies this node's transform and alpha, paints itself, then recurses into children — in insertion order, so later children draw on top of earlier ones. */
  render(ctx: CanvasRenderingContext2D): void {
    if (!this.visible) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.scaleX, this.scaleY);
    ctx.globalAlpha *= this.alpha;

    this.paintSelf?.(ctx);
    for (const child of this.children) child.render(ctx);

    ctx.restore();
  }

  /** Detaches from the parent (so a destroyed node stops being drawn) and, optionally, tears down children too — mirroring Pixi's `Container.destroy()`, which does the same `removeFromParent()` step internally. */
  destroy(options?: DestroyOptions): void {
    this.parent?.removeChild(this);

    const withChildren = typeof options === "boolean" ? options : (options?.children ?? false);
    if (withChildren) {
      // Snapshot first: each child's own destroy() splices itself out of
      // `this.children`, which would shift indices out from under a live
      // for-of over that same array.
      for (const child of [...this.children]) child.destroy(options);
    }
    this.children.length = 0;
  }
}
