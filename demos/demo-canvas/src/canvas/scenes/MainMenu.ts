import { Container, Graphics, Text } from "../engine";
import { Scene } from "../Scene";
import { animate } from "../util/animate";
import { pickRandom, randomBetween } from "../util/random";

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

const HIGH_SCORE_KEY = "demo-canvas-highscore";

export default class MainMenu extends Scene {
  readonly view = new Container();
  private readonly disposers: (() => void)[] = [];

  create(): void {
    const { width, height } = this.app.screen;

    this.createDriftingGrid(width, height);
    this.createTitle(width, height);
    this.createHighScore(width, height);
    this.createStartPrompt(width, height);

    this.setupInput();
  }

  /** Canvas has no scene-graph hit testing (unlike Pixi's `eventMode`/`hitArea`), so a click anywhere just listens on the canvas element directly. */
  private setupInput(): void {
    this.app.canvas.addEventListener("click", this.onClick, { once: true });
  }

  private readonly onClick = (): void => {
    this.manager.start("LevelLava");
  };

  private createDriftingGrid(width: number, height: number): void {
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

    const grid = new Container();
    grid.position.set(randomBetween(minX, 0), randomBetween(minY, 0));
    this.view.addChild(grid);

    const background = new Graphics().rect(0, 0, gridWidth, gridHeight).fill(0x000000);
    grid.addChild(background);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = gap + cellWidth / 2 + col * (cellWidth + gap);
        const y = gap + cellHeight / 2 + row * (cellHeight + gap);

        const cell = new Graphics().rect(-cellWidth / 2, -cellHeight / 2, cellWidth, cellHeight).fill(0xffffff);
        cell.position.set(x, y);
        cell.alpha = 0.3;
        cell.scale.set(0.7);
        grid.addChild(cell);

        this.disposers.push(
          animate(
            this.app.ticker,
            { alpha: 0.3, scale: 0.7 },
            { alpha: 0.8, scale: 1.3 },
            {
              duration: randomBetween(1200, 2800),
              delay: randomBetween(0, 2000),
              yoyo: true,
              repeat: -1,
              onUpdate: ({ alpha, scale }) => {
                cell.alpha = alpha;
                cell.scale.set(scale);
              },
            },
          ),
        );
      }
    }

    const driftToRandomPoint = (): void => {
      const from = { x: grid.x, y: grid.y };
      const to = { x: randomBetween(minX, 0), y: randomBetween(minY, 0) };
      this.disposers.push(
        animate(this.app.ticker, from, to, {
          duration: randomBetween(4000, 9000),
          onUpdate: ({ x, y }) => grid.position.set(x, y),
          onComplete: driftToRandomPoint,
        }),
      );
    };
    driftToRandomPoint();
  }

  private createTitle(width: number, height: number): void {
    const title = pickRandom(TITLES);

    const text = new Text({
      text: title,
      style: {
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: 64,
        fontWeight: "bold",
        fill: 0xffff00,
        stroke: { color: 0x000000, width: 8 },
      },
    });
    text.anchor.set(0.5);
    text.position.set(width / 2, height * 0.3);
    this.view.addChild(text);
  }

  private createHighScore(width: number, height: number): void {
    const highScore = Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;

    const text = new Text({
      text: `High Score: ${highScore}`,
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 28,
        fill: 0xffffff,
      },
    });
    text.anchor.set(0.5);
    text.position.set(width / 2, height * 0.45);
    this.view.addChild(text);
  }

  private createStartPrompt(width: number, height: number): void {
    const text = new Text({
      text: "Click to Start",
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 32,
        fontWeight: "bold",
        fill: 0xffffff,
      },
    });
    text.anchor.set(0.5);
    text.position.set(width / 2, height * 0.75);
    this.view.addChild(text);

    this.disposers.push(
      animate(
        this.app.ticker,
        { alpha: 1 },
        { alpha: 0.3 },
        {
          duration: 900,
          yoyo: true,
          repeat: -1,
          onUpdate: ({ alpha }) => {
            text.alpha = alpha;
          },
        },
      ),
    );
  }

  destroy(): void {
    this.app.canvas.removeEventListener("click", this.onClick);
    this.disposers.forEach((dispose) => dispose());
  }
}
