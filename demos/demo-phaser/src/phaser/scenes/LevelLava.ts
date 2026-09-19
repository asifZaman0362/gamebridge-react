import { GridLevel, CELL_SIZE, type GridLevelConfig } from "./GridLevel";

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

const CONFIG: GridLevelConfig = {
  sceneKey: "LevelLava",
  layout: LAYOUT,
  walkableColor: 0x8a8a8a,
  hazardColor: 0xff6a00,
  enemyTypes: [{ health: 1, color: 0xff0000, radius: CELL_SIZE / 6, tickMs: 600, weight: 1 }],
  initialEnemyCount: 3,
  maxEnemies: 30,
  enemySpawnIntervalMs: 1500,
};

export default class LevelLava extends GridLevel {
  constructor() {
    super(CONFIG);
  }
}
