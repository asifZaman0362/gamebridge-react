import { Container, Graphics, type Ticker } from "./engine";
import type { GridPosition } from "./Player";
import { IntervalTimer } from "./util/Timer";
import { pickRandom } from "./util/random";

const DIRECTIONS: GridPosition[] = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
];

export type EnemyOptions = {
  isWalkable: (pos: GridPosition) => boolean;
  cellToWorld: (pos: GridPosition) => { x: number; y: number };
  radius: number;
  tickMs: number;
  /** Ticker driving this enemy's movement timer. */
  ticker: Ticker;
  /** Number of hits this enemy can take before dying. Defaults to 1. */
  health?: number;
  /** Sprite color. Defaults to red. */
  color?: number;
};

/** A dot that wanders the grid, picking a random direction each tick and staying put if that direction is blocked. */
export class Enemy {
  position: GridPosition;
  isDestroyed = false;
  health: number;

  private readonly sprite: Graphics;
  private readonly isWalkable: (pos: GridPosition) => boolean;
  private readonly cellToWorld: (pos: GridPosition) => { x: number; y: number };
  private readonly timer: IntervalTimer;

  constructor(container: Container, spawn: GridPosition, options: EnemyOptions) {
    this.position = { ...spawn };
    this.health = options.health ?? 1;
    this.isWalkable = options.isWalkable;
    this.cellToWorld = options.cellToWorld;

    this.sprite = new Graphics().circle(0, 0, options.radius).fill(options.color ?? 0xff0000);
    const { x, y } = this.cellToWorld(spawn);
    this.sprite.position.set(x, y);
    container.addChild(this.sprite);

    this.timer = new IntervalTimer(options.ticker, options.tickMs, () => this.tick());
  }

  get worldPosition(): { x: number; y: number } {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  /** Applies `amount` damage. Returns whether the enemy died from this hit. */
  takeDamage(amount: number): boolean {
    this.health -= amount;
    return this.health <= 0;
  }

  private tick(): void {
    const delta = pickRandom(DIRECTIONS);
    const target: GridPosition = {
      row: this.position.row + delta.row,
      col: this.position.col + delta.col,
    };

    if (!this.isWalkable(target)) return;

    this.position = target;
    const { x, y } = this.cellToWorld(target);
    this.sprite.position.set(x, y);
  }

  destroy(): void {
    this.isDestroyed = true;
    this.timer.destroy();
    this.sprite.destroy();
  }
}
