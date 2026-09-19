import { Container, Graphics } from "pixi.js";
import type { Enemy } from "./Enemy";
import { pickRandom } from "./util/random";

export type ProjectileOptions = {
  /** Pixels per second. */
  speed: number;
  radius: number;
  /** Distance, in pixels, at which the projectile counts as having reached its target. */
  hitDistance: number;
};

export type ProjectileOutcome =
  | { kind: "flying" }
  | { kind: "hit"; target: Enemy }
  | { kind: "no-target" };

/** A shot that locks onto an `Enemy` at creation and homes toward its current position each frame, retargeting if that enemy is destroyed before impact. */
export class Projectile {
  private readonly sprite: Graphics;
  private readonly speed: number;
  private readonly hitDistance: number;
  private readonly getLiveEnemies: () => readonly Enemy[];
  private target: Enemy | null;

  constructor(
    container: Container,
    spawn: { x: number; y: number },
    target: Enemy,
    getLiveEnemies: () => readonly Enemy[],
    options: ProjectileOptions,
  ) {
    this.speed = options.speed;
    this.hitDistance = options.hitDistance;
    this.getLiveEnemies = getLiveEnemies;
    this.target = target;

    this.sprite = new Graphics().circle(0, 0, options.radius).fill(0xffff00);
    this.sprite.position.set(spawn.x, spawn.y);
    container.addChild(this.sprite);
  }

  /** Advances the projectile by `deltaMs` and reports what happened this frame. */
  update(deltaMs: number): ProjectileOutcome {
    if (this.target?.isDestroyed) this.target = this.pickTarget();
    if (this.target === null) return { kind: "no-target" };

    const { x: targetX, y: targetY } = this.target.worldPosition;
    const dx = targetX - this.sprite.x;
    const dy = targetY - this.sprite.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= this.hitDistance) return { kind: "hit", target: this.target };

    const step = this.speed * (deltaMs / 1000);
    this.sprite.x += (dx / distance) * step;
    this.sprite.y += (dy / distance) * step;
    return { kind: "flying" };
  }

  private pickTarget(): Enemy | null {
    const alive = this.getLiveEnemies();
    return alive.length > 0 ? pickRandom([...alive]) : null;
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
