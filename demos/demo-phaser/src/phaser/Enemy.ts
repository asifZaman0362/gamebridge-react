import Phaser from "phaser";
import type { GridPosition } from "./Player";

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

  private readonly sprite: Phaser.GameObjects.Arc;
  private readonly isWalkable: (pos: GridPosition) => boolean;
  private readonly cellToWorld: (pos: GridPosition) => { x: number; y: number };
  private readonly timer: Phaser.Time.TimerEvent;

  constructor(scene: Phaser.Scene, spawn: GridPosition, options: EnemyOptions) {
    this.position = { ...spawn };
    this.health = options.health ?? 1;
    this.isWalkable = options.isWalkable;
    this.cellToWorld = options.cellToWorld;

    const { x, y } = this.cellToWorld(spawn);
    this.sprite = scene.add.circle(x, y, options.radius, options.color ?? 0xff0000);

    this.timer = scene.time.addEvent({
      delay: options.tickMs,
      loop: true,
      callback: () => this.tick(),
    });
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
    const delta = Phaser.Utils.Array.GetRandom(DIRECTIONS);
    const target: GridPosition = {
      row: this.position.row + delta.row,
      col: this.position.col + delta.col,
    };

    if (!this.isWalkable(target)) return;

    this.position = target;
    const { x, y } = this.cellToWorld(target);
    this.sprite.setPosition(x, y);
  }

  destroy(): void {
    this.isDestroyed = true;
    this.timer.remove();
    this.sprite.destroy();
  }
}
