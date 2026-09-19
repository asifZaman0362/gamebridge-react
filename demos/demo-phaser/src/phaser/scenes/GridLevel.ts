import Phaser from "phaser";
import { LevelBase } from "../LevelBase";
import { Player, type GridPosition, type MoveDirection } from "../Player";
import { Enemy } from "../Enemy";
import { Projectile } from "../Projectile";
import { notifyApp } from "../SceneEvents";

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

type Wasd = Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;

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
export abstract class GridLevel extends LevelBase {
  private readonly config: GridLevelConfig;
  private player!: Player;
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private lastHitAt = 0;

  constructor(config: GridLevelConfig) {
    super(config.sceneKey);
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

  update(_time: number, delta: number): void {
    this.checkCollisions();
    this.updateProjectiles(delta);
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
    for (let row = 0; row < layout.length; row++) {
      for (let col = 0; col < layout[row].length; col++) {
        const walkable = this.isWalkable({ row, col });
        const { x, y } = this.cellToWorld({ row, col });
        this.add
          .rectangle(
            x,
            y,
            CELL_SIZE - 4,
            CELL_SIZE - 4,
            walkable ? walkableColor : hazardColor,
          )
          .setStrokeStyle(1, 0x000000, 0.3);
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
    const spawn = Phaser.Utils.Array.GetRandom(this.getWalkableCells());

    this.player = new Player(this, spawn, {
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
    const spawn = Phaser.Utils.Array.GetRandom(this.getWalkableCells());
    const type = this.pickEnemyType();
    this.enemies.push(
      new Enemy(this, spawn, {
        isWalkable: (pos) => this.isWalkable(pos),
        cellToWorld: (pos) => this.cellToWorld(pos),
        radius: type.radius,
        tickMs: type.tickMs,
        health: type.health,
        color: type.color,
      }),
    );
  }

  private spawnInitialEnemies(): void {
    for (let i = 0; i < this.config.initialEnemyCount; i++) this.spawnEnemy();
  }

  private setupEnemySpawning(): void {
    this.time.addEvent({
      delay: this.config.enemySpawnIntervalMs,
      loop: true,
      callback: () => {
        if (this.enemies.length < this.config.maxEnemies) this.spawnEnemy();
      },
    });
  }

  private killEnemy(enemy: Enemy): void {
    enemy.destroy();
    this.enemies = this.enemies.filter((candidate) => candidate !== enemy);
    this.player.registerKill(SCORE_PER_KILL);
  }

  private checkCollisions(): void {
    const now = this.time.now;
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
    const spawn = Phaser.Utils.Array.GetRandom(this.getWalkableCells());
    this.player.teleportTo(spawn);
    this.player.resetHealth();
  }

  /** Fires a shot at the nearest enemy, if one exists. */
  private fireProjectile(): void {
    const target = this.nearestEnemy();
    if (!target) return;

    this.projectiles.push(
      new Projectile(this, this.player.worldPosition, target, () => this.enemies, {
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
    const cursors = this.input.keyboard!.createCursorKeys();
    const wasd = this.input.keyboard!.addKeys("W,A,S,D") as Wasd;
    const spacebar = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    const bind = (
      keys: Phaser.Input.Keyboard.Key[],
      direction: MoveDirection,
    ) => {
      keys.forEach((key) => key.on("down", () => this.player.move(direction)));
    };

    bind([cursors.up, wasd.W], "up");
    bind([cursors.down, wasd.S], "down");
    bind([cursors.left, wasd.A], "left");
    bind([cursors.right, wasd.D], "right");

    spacebar.on("down", () => this.fireProjectile());
  }

  destroy(): void {
    this.player?.destroy();
    this.enemies.forEach((enemy) => enemy.destroy());
    this.projectiles.forEach((projectile) => projectile.destroy());
  }
}
