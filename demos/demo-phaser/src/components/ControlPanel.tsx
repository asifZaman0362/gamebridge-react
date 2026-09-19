import { useState } from "react";
import {
  LEVEL_SCENES,
  MAIN_MENU_SCENE,
  notifyEngine,
  type LevelSceneKey,
} from "../phaser/SceneEvents";

export default function ControlPanel() {
  const [paused, setPaused] = useState(false);
  const [volume, setVolume] = useState(1);
  const [level, setLevel] = useState<LevelSceneKey>(LEVEL_SCENES[0]);

  // `notifyEngine` is `notifiers(sceneEvents.toEngine)`: `notifyEngine.SetPaused(x)`
  // is `toEngine.emit("SetPaused", x)`. Nothing here checks whether the engine
  // is up. `LoadScene` is queued until its handler attaches, and `SetPaused` /
  // `SetVolume` are replayed to it, so a fresh engine always gets current values.
  const togglePaused = () => {
    const next = !paused;
    setPaused(next);
    notifyEngine.SetPaused(next);
  };

  const goToMainMenu = () => {
    setPaused(false);
    // `UnloadScene` is `'none'`: with no engine there is nothing to unload, so
    // dropping it is correct. The `LoadScene` after it is what gets queued.
    notifyEngine.UnloadScene();
    notifyEngine.LoadScene({ key: MAIN_MENU_SCENE });
  };

  const loadSelectedLevel = () => {
    setPaused(false);
    notifyEngine.UnloadScene();
    notifyEngine.LoadScene({ key: level });
  };

  const changeVolume = (value: number) => {
    setVolume(value);
    notifyEngine.SetVolume(value);
  };

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 16px",
        boxSizing: "border-box",
      }}
    >
      <button onClick={togglePaused}>{paused ? "Play" : "Pause"}</button>
      <button onClick={goToMainMenu}>Main Menu</button>
      <select
        value={level}
        onChange={(event) => setLevel(event.target.value as LevelSceneKey)}
      >
        {LEVEL_SCENES.map((key) => (
          <option key={key} value={key}>
            {key.replace(/^Level/, "")}
          </option>
        ))}
      </select>
      <button onClick={loadSelectedLevel}>Load</button>
      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
        Volume
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(event) => changeVolume(Number(event.target.value))}
        />
      </label>
    </div>
  );
}
