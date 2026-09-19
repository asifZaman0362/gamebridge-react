import { Container, Graphics, type Ticker } from "pixi.js";
import { Scene, type SceneContext } from "../Scene";
import { Player, type GridPosition, type MoveDirection } from "../Player";
import { Enemy } from "../Enemy";
import { Projectile } from "../Projectile";
import { notifyApp } from "../SceneEvents";
import { IntervalTimer } from "../util/Timer";
import { Keyboard } from "../util/Keyboard";
import { pickRandom } from "../util/random";

export const CELL_SIZE = 64;
const GRID_ORIGIN_X = 64;
const GRID_ORIGIN_Y = 64;

const ENEMY_DAMAGE = 15;
const HIT_COOLDOWN_MS = 600;

const PROJECTILE_SPEED = 480;
const PROJECTILE_RADIUS = 6;
const PROJECTILE_HIT_DISTANCE = 18;
const PROJECTILE_DAMAGE = 1;
const SCORE_PER_KILL = 10;

export type EnemyTypeConfig = {
  /** Number of bullets needed to kill this enemy type. */
  health: number;
  color: number;
  radius: number;
  tickMs: number;
  /** Relative likelihood of this type being picked when spawning a new enemy. */
  weight: number;
};

export type GridLevelConfig = {
  sceneKey: string;
  /** "1" = walkable, "0" = hazard. Rows must all be the same length. */
  layout: string[];
  walkableColor: number;
  hazardColor: number;
  enemyTypes: EnemyTypeConfig[];
  initialEnemyCount: number;
  maxEnemies: number;
  enemySpawnIntervalMs: number;
};

/** Shared grid-walking, shooting, and enemy-wave logic for a hazard-terrain level; concrete levels supply layout, colors, and enemy mix via {@link GridLevelConfig}. */
export abstract class GridLevel extends Scene {
  readonly view = new Container();

  private readonly config: GridLevelConfig;
  private readonly keyboard = new Keyboard();
  private player!: Player;
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private spawnTimer!: IntervalTimer;
  private elapsedMs = 0;
  private lastHitAt = 0;

  constructor(ctx: SceneContext, config: GridLevelConfig) {
    super(ctx, config.sceneKey);
    this.config = config;
  }

  create(): void {
    notifyApp.SceneCreated({ scene: this });
    this.buildGrid();
    this.spawnPlayer();
    this.spawnInitialEnemies();
    this.setupEnemySpawning();
    this.setupInput();
  }

  update(ticker: Ticker): void {
    this.elapsedMs += ticker.deltaMS;
    this.checkCollisions();
    this.updateProjectiles(ticker.deltaMS);
  }

  private isWalkable(pos: GridPosition): boolean {
    const row = this.config.layout[pos.row];
    return row?.[pos.col] === "1";
  }

  private cellToWorld(pos: GridPosition): { x: number; y: number } {
    return {
      x: GRID_ORIGIN_X + pos.col * CELL_SIZE + CELL_SIZE / 2,
      y: GRID_ORIGIN_Y + pos.row * CELL_SIZE + CELL_SIZE / 2,
    };
  }

  private buildGrid(): void {
    const { layout, walkableColor, hazardColor } = this.config;
    const size = CELL_SIZE - 4;

    for (let row = 0; row < layout.length; row++) {
      for (let col = 0; col < layout[row].length; col++) {
        const walkable = this.isWalkable({ row, col });
        const { x, y } = this.cellToWorld({ row, col });
        const cell = new Graphics()
          .rect(-size / 2, -size / 2, size, size)
          .fill(walkable ? walkableColor : hazardColor)
          .stroke({ width: 1, color: 0x000000, alpha: 0.3 });
        cell.position.set(x, y);
        this.view.addChild(cell);
      }
    }
  }

  private getWalkableCells(): GridPosition[] {
    const walkableCells: GridPosition[] = [];
    const { layout } = this.config;
    for (let row = 0; row < layout.length; row++) {
      for (let col = 0; col < layout[row].length; col++) {
        if (this.isWalkable({ row, col })) walkableCells.push({ row, col });
      }
    }
    return walkableCells;
  }

  private spawnPlayer(): void {
    const spawn = pickRandom(this.getWalkableCells());

    this.player = new Player(this.view, spawn, {
      isWalkable: (pos) => this.isWalkable(pos),
      cellToWorld: (pos) => this.cellToWorld(pos),
      radius: CELL_SIZE / 3,
    });
  }

  /** Picks an enemy type at random, weighted by each type's `weight`. */
  private pickEnemyType(): EnemyTypeConfig {
    const { enemyTypes } = this.config;
    const totalWeight = enemyTypes.reduce((sum, type) => sum + type.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const type of enemyTypes) {
      roll -= type.weight;
      if (roll < 0) return type;
    }
    return enemyTypes[enemyTypes.length - 1];
  }

  private spawnEnemy(): void {
    const spawn = pickRandom(this.getWalkableCells());
    const type = this.pickEnemyType();
    this.enemies.push(
      new Enemy(this.view, spawn, {
        isWalkable: (pos) => this.isWalkable(pos),
        cellToWorld: (pos) => this.cellToWorld(pos),
        radius: type.radius,
        tickMs: type.tickMs,
        health: type.health,
        color: type.color,
        ticker: this.app.ticker,
      }),
    );
  }

  private spawnInitialEnemies(): void {
    for (let i = 0; i < this.config.initialEnemyCount; i++) this.spawnEnemy();
  }

  private setupEnemySpawning(): void {
    this.spawnTimer = new IntervalTimer(this.app.ticker, this.config.enemySpawnIntervalMs, () => {
      if (this.enemies.length < this.config.maxEnemies) this.spawnEnemy();
    });
  }

  private killEnemy(enemy: Enemy): void {
    enemy.destroy();
    this.enemies = this.enemies.filter((candidate) => candidate !== enemy);
    this.player.registerKill(SCORE_PER_KILL);
  }

  private checkCollisions(): void {
    const now = this.elapsedMs;
    if (now - this.lastHitAt < HIT_COOLDOWN_MS) return;

    const playerPos = this.player.stats.position;
    const touching = this.enemies.some(
      (enemy) => enemy.position.row === playerPos.row && enemy.position.col === playerPos.col,
    );
    if (!touching) return;

    this.lastHitAt = now;
    this.player.takeDamage(ENEMY_DAMAGE);

    if (this.player.stats.health <= 0) this.respawnPlayer();
  }

  private respawnPlayer(): void {
    const spawn = pickRandom(this.getWalkableCells());
    this.player.teleportTo(spawn);
    this.player.resetHealth();
  }

  /** Fires a shot at the nearest enemy, if one exists. */
  private fireProjectile(): void {
    const target = this.nearestEnemy();
    if (!target) return;

    this.projectiles.push(
      new Projectile(this.view, this.player.worldPosition, target, () => this.enemies, {
        speed: PROJECTILE_SPEED,
        radius: PROJECTILE_RADIUS,
        hitDistance: PROJECTILE_HIT_DISTANCE,
      }),
    );
  }

  private nearestEnemy(): Enemy | null {
    const playerPos = this.player.stats.position;
    const gridDistance = (enemy: Enemy) =>
      Math.abs(enemy.position.row - playerPos.row) + Math.abs(enemy.position.col - playerPos.col);

    return this.enemies.reduce<Enemy | null>(
      (closest, enemy) => (closest === null || gridDistance(enemy) < gridDistance(closest) ? enemy : closest),
      null,
    );
  }

  private updateProjectiles(delta: number): void {
    this.projectiles = this.projectiles.filter((projectile) => {
      const outcome = projectile.update(delta);
      if (outcome.kind === "flying") return true;

      if (outcome.kind === "hit" && outcome.target.takeDamage(PROJECTILE_DAMAGE)) {
        this.killEnemy(outcome.target);
      }
      projectile.destroy();
      return false;
    });
  }

  private setupInput(): void {
    const bind = (codes: string[], direction: MoveDirection) => {
      codes.forEach((code) => this.keyboard.onKeyPress(code, () => this.player.move(direction)));
    };

    bind(["ArrowUp", "KeyW"], "up");
    bind(["ArrowDown", "KeyS"], "down");
    bind(["ArrowLeft", "KeyA"], "left");
    bind(["ArrowRight", "KeyD"], "right");

    this.keyboard.onKeyPress("Space", () => this.fireProjectile());
  }

  destroy(): void {
    this.keyboard.destroy();
    this.spawnTimer.destroy();
    this.player?.destroy();
    this.enemies.forEach((enemy) => enemy.destroy());
    this.projectiles.forEach((projectile) => projectile.destroy());
  }
}
