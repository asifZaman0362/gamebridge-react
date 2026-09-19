import Phaser from "phaser";

const TITLES = [
  "Byte Quest",
  "Pixel Rush",
  "Grid Runner",
  "Neon Drift",
  "Void Jumper",
  "Star Chaser",
  "Glitch Storm",
  "Circuit Break",
];

const HIGH_SCORE_KEY = "demo-phaser-highscore";

export default class MainMenu extends Phaser.Scene {
  constructor() {
    super({ key: "MainMenu" });
  }

  create() {
    const { width, height } = this.cameras.main;

    this.createDriftingGrid(width, height);
    this.createTitle(width, height);
    this.createHighScore(width, height);
    this.createStartPrompt(width, height);

    this.input.once("pointerdown", () => this.scene.start("LevelLava"));
  }

  private createDriftingGrid(width: number, height: number) {
    const gridWidth = width * 2;
    const gridHeight = height * 2;
    const gap = 24;
    const maxCells = 50;

    // Pick a rows/cols split that roughly matches the grid's aspect ratio
    // while keeping the total cell count under maxCells.
    const ratio = gridWidth / gridHeight;
    const rows = Math.max(1, Math.round(Math.sqrt(maxCells / ratio)));
    const cols = Math.max(1, Math.floor(maxCells / rows));

    const cellWidth = (gridWidth - gap * (cols + 1)) / cols;
    const cellHeight = (gridHeight - gap * (rows + 1)) / rows;

    // The grid is 2x the viewport, so its top-left corner can only drift
    // between -viewport and 0 on each axis without exposing an edge.
    const minX = width - gridWidth;
    const minY = height - gridHeight;

    const grid = this.add.container(
      Phaser.Math.Between(minX, 0),
      Phaser.Math.Between(minY, 0),
    );

    const background = new Phaser.GameObjects.Rectangle(
      this,
      0,
      0,
      gridWidth,
      gridHeight,
      0x000000,
    ).setOrigin(0, 0);
    grid.add(background);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = gap + cellWidth / 2 + col * (cellWidth + gap);
        const y = gap + cellHeight / 2 + row * (cellHeight + gap);

        const cell = new Phaser.GameObjects.Rectangle(
          this,
          x,
          y,
          cellWidth,
          cellHeight,
          0xffffff,
        )
          .setAlpha(0.3)
          .setScale(0.7);
        grid.add(cell);

        this.tweens.add({
          targets: cell,
          alpha: 0.8,
          scale: 1.3,
          duration: Phaser.Math.Between(1200, 2800),
          delay: Phaser.Math.Between(0, 2000),
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }
    }

    const driftToRandomPoint = () => {
      this.tweens.add({
        targets: grid,
        x: Phaser.Math.Between(minX, 0),
        y: Phaser.Math.Between(minY, 0),
        duration: Phaser.Math.Between(4000, 9000),
        ease: "Sine.easeInOut",
        onComplete: driftToRandomPoint,
      });
    };
    driftToRandomPoint();
  }

  private createTitle(width: number, height: number) {
    const title = Phaser.Utils.Array.GetRandom(TITLES);

    this.add
      .text(width / 2, height * 0.3, title, {
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: "64px",
        fontStyle: "bold",
        color: "#ffff00",
        stroke: "#000000",
        strokeThickness: 8,
      })
      .setOrigin(0.5);
  }

  private createHighScore(width: number, height: number) {
    const highScore = Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;

    this.add
      .text(width / 2, height * 0.45, `High Score: ${highScore}`, {
        fontFamily: "Arial, sans-serif",
        fontSize: "28px",
        color: "#ffffff",
      })
      .setOrigin(0.5);
  }

  private createStartPrompt(width: number, height: number) {
    const prompt = this.add
      .text(width / 2, height * 0.75, "Click to Start", {
        fontFamily: "Arial, sans-serif",
        fontSize: "32px",
        fontStyle: "bold",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: prompt,
      alpha: 0.3,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  init() {}

  destroy() {}
}
