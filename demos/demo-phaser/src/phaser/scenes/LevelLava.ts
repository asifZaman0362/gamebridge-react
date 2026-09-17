import Phaser from "phaser";
import { LevelBase } from "../LevelBase";
import { Player, type GridPosition, type MoveDirection } from "../Player";
import { Enemy } from "../Enemy";
import { Projectile } from "../Projectile";
import { notifyApp } from "../SceneEvents";

// 1 = walkable (grey), 0 = lava (orange). Rows must all be the same length.
const LAYOUT = [
  "0000000000000",
  "0111111111110",
  "0111011101110",
  "0111111111110",
  "0111011101110",
  "0111111111110",
  "0111011101110",
  "0111111111110",
  "0000000000000",
];

const CELL_SIZE = 64;
const GRID_ORIGIN_X = 64;
const GRID_ORIGIN_Y = 64;

const WALKABLE_COLOR = 0x8a8a8a;
const LAVA_COLOR = 0xff6a00;

const INITIAL_ENEMY_COUNT = 3;
const MAX_ENEMIES = 30;
const ENEMY_SPAWN_INTERVAL_MS = 1500;
const ENEMY_TICK_MS = 600;
const ENEMY_DAMAGE = 15;
const HIT_COOLDOWN_MS = 600;

const PROJECTILE_SPEED = 480;
const PROJECTILE_RADIUS = 6;
const PROJECTILE_HIT_DISTANCE = 18;
const SCORE_PER_KILL = 10;

type Wasd = Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;

export default class LevelLava extends LevelBase {
  private player!: Player;
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private lastHitAt = 0;

  constructor() {
    super("LevelLava");
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
    const row = LAYOUT[pos.row];
    return row?.[pos.col] === "1";
  }

  private cellToWorld(pos: GridPosition): { x: number; y: number } {
    return {
      x: GRID_ORIGIN_X + pos.col * CELL_SIZE + CELL_SIZE / 2,
      y: GRID_ORIGIN_Y + pos.row * CELL_SIZE + CELL_SIZE / 2,
    };
  }

  private buildGrid(): void {
    for (let row = 0; row < LAYOUT.length; row++) {
      for (let col = 0; col < LAYOUT[row].length; col++) {
        const walkable = this.isWalkable({ row, col });
        const { x, y } = this.cellToWorld({ row, col });
        this.add
          .rectangle(
            x,
            y,
            CELL_SIZE - 4,
            CELL_SIZE - 4,
            walkable ? WALKABLE_COLOR : LAVA_COLOR,
          )
          .setStrokeStyle(1, 0x000000, 0.3);
      }
    }
  }

  private getWalkableCells(): GridPosition[] {
    const walkableCells: GridPosition[] = [];
    for (let row = 0; row < LAYOUT.length; row++) {
      for (let col = 0; col < LAYOUT[row].length; col++) {
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

  private spawnEnemy(): void {
    const spawn = Phaser.Utils.Array.GetRandom(this.getWalkableCells());
    this.enemies.push(
      new Enemy(this, spawn, {
        isWalkable: (pos) => this.isWalkable(pos),
        cellToWorld: (pos) => this.cellToWorld(pos),
        radius: CELL_SIZE / 6,
        tickMs: ENEMY_TICK_MS,
      }),
    );
  }

  private spawnInitialEnemies(): void {
    for (let i = 0; i < INITIAL_ENEMY_COUNT; i++) this.spawnEnemy();
  }

  private setupEnemySpawning(): void {
    this.time.addEvent({
      delay: ENEMY_SPAWN_INTERVAL_MS,
      loop: true,
      callback: () => {
        if (this.enemies.length < MAX_ENEMIES) this.spawnEnemy();
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

      if (outcome.kind === "hit") this.killEnemy(outcome.target);
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
