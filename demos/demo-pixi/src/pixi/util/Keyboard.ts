/**
 * Pixi has no built-in input layer (unlike Phaser's `scene.input.keyboard`),
 * so key bindings are just `KeyboardEvent.code` listeners on `window`,
 * scoped per-scene by calling `destroy()` from the scene's own teardown.
 */
export class Keyboard {
  private readonly handlersByCode = new Map<string, Set<() => void>>();

  constructor() {
    window.addEventListener("keydown", this.onKeyDown);
  }

  onKeyPress(code: string, handler: () => void): void {
    let handlers = this.handlersByCode.get(code);
    if (handlers === undefined) {
      handlers = new Set();
      this.handlersByCode.set(code, handlers);
    }
    handlers.add(handler);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    this.handlersByCode.get(event.code)?.forEach((handler) => handler());
  };

  destroy(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    this.handlersByCode.clear();
  }
}
