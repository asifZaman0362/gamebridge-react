import { GridLevel, CELL_SIZE, type GridLevelConfig } from "./GridLevel";
import type { SceneContext } from "../Scene";

// 1 = walkable (grey), 0 = water (blue). Rows must all be the same length.
// The walkable area forms a wide "P": a full-height stem on the left with a
// hollow loop at the top, all corridors at least 3 cells wide.
const LAYOUT = [
  "0000000000000",
  "0111111111110",
  "0111000000110",
  "0111000000110",
  "0111000000110",
  "0111111111110",
  "0111000000000",
  "0111000000000",
  "0111000000000",
  "0111000000000",
  "0000000000000",
];

const CONFIG: GridLevelConfig = {
  sceneKey: "LevelWater",
  layout: LAYOUT,
  walkableColor: 0x8a8a8a,
  hazardColor: 0x1976d2,
  enemyTypes: [
    { health: 1, color: 0xff0000, radius: CELL_SIZE / 6, tickMs: 600, weight: 1 },
    // Tankier enemy: takes 3 bullets to kill, spawns just as often as the basic one.
    { health: 3, color: 0x9c27b0, radius: CELL_SIZE / 5, tickMs: 600, weight: 1 },
  ],
  initialEnemyCount: 6,
  maxEnemies: 60,
  enemySpawnIntervalMs: 700,
};

export default class LevelWater extends GridLevel {
  constructor(ctx: SceneContext) {
    super(ctx, CONFIG);
  }
}
