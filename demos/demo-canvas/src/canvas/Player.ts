import { Container, Graphics } from "./engine";
import { onStatUpdate, type AchievementStats } from "./AchievementTracker";
import { publishPlayerStats } from "./PlayerStatsBridge";

export type GridPosition = { row: number; col: number };

export type MoveDirection = "up" | "down" | "left" | "right";

/** The player's tracked stats. Extends {@link AchievementStats} (steps/score/kills) so it can be reported straight to the achievement tracker. */
export interface PlayerStats extends AchievementStats {
  health: number;
  position: GridPosition;
}

const DIRECTION_DELTAS: Record<MoveDirection, GridPosition> = {
  up: { row: -1, col: 0 },
  down: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
  right: { row: 0, col: 1 },
};

export type PlayerOptions = {
  isWalkable: (pos: GridPosition) => boolean;
  cellToWorld: (pos: GridPosition) => { x: number; y: number };
  radius: number;
};

export class Player {
  readonly stats: PlayerStats;

  private readonly sprite: Graphics;
  private readonly isWalkable: (pos: GridPosition) => boolean;
  private readonly cellToWorld: (pos: GridPosition) => { x: number; y: number };

  constructor(container: Container, spawn: GridPosition, options: PlayerOptions) {
    this.isWalkable = options.isWalkable;
    this.cellToWorld = options.cellToWorld;
    this.stats = {
      health: 100,
      kills: 0,
      score: 0,
      steps: 0,
      position: { ...spawn },
    };

    this.sprite = new Graphics()
      .circle(0, 0, options.radius)
      .fill(0x3399ff)
      .stroke({ width: 3, color: 0xffffff });

    const { x, y } = this.cellToWorld(spawn);
    this.sprite.position.set(x, y);
    container.addChild(this.sprite);

    this.publishStats();
  }

  get worldPosition(): { x: number; y: number } {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  /** Attempts to move one grid cell in `direction`. Returns whether the move succeeded, and increments `steps` only when it does. */
  move(direction: MoveDirection): boolean {
    const delta = DIRECTION_DELTAS[direction];
    const target: GridPosition = {
      row: this.stats.position.row + delta.row,
      col: this.stats.position.col + delta.col,
    };

    if (!this.isWalkable(target)) return false;

    this.stats.position = target;
    this.stats.steps += 1;

    const { x, y } = this.cellToWorld(target);
    this.sprite.position.set(x, y);

    onStatUpdate({ key: "steps", value: this.stats.steps });
    this.publishStats();

    return true;
  }

  /** Lowers health by `amount`, floored at 0. */
  takeDamage(amount: number): void {
    this.stats.health = Math.max(0, this.stats.health - amount);
    this.publishStats();
  }

  resetHealth(): void {
    this.stats.health = 100;
    this.publishStats();
  }

  /** Records a kill worth `scoreValue` points. */
  registerKill(scoreValue: number): void {
    this.stats.kills += 1;
    this.stats.score += scoreValue;
    onStatUpdate({ key: "kills", value: this.stats.kills });
    onStatUpdate({ key: "score", value: this.stats.score });
    this.publishStats();
  }

  /** Teleports to `pos` without going through {@link move}'s walkability check or `steps` count — used to respawn. */
  teleportTo(pos: GridPosition): void {
    this.stats.position = { ...pos };
    const { x, y } = this.cellToWorld(pos);
    this.sprite.position.set(x, y);
  }

  private publishStats(): void {
    // Always the whole snapshot: `statsChanged` is `'replay'`, which keeps only
    // the latest payload, so a partial update would leave a late HUD with stale fields.
    publishPlayerStats({
      health: this.stats.health,
      score: this.stats.score,
      steps: this.stats.steps,
    });
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
