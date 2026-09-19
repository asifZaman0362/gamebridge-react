import { useEffect, useState } from "react";
import { PhaserGame } from "./components/PhaserGame";
import AchievementsDrawer from "./components/AchievementsDrawer";
import ControlPanel from "./components/ControlPanel";
import DebugConsole from "./components/DebugConsole";
import Hud from "./components/Hud";
import { sceneEvents } from "./phaser/SceneEvents";
import { playerStatsToApp } from "./phaser/PlayerStatsBridge";

const colors = {
  background: "#14161b",
  panel: "#1c1f26",
  border: "#2c3038",
  text: "#e6e8ec",
};

/**
 * Everything that exists only while the game is on screen: the engine, its
 * HUD, the control panel and the achievements drawer.
 *
 * Leaving the screen is the moment for `dispose()`: every subscription and
 * every buffer on the scene bridges goes, in one call, so nothing from this
 * visit — a queued command, a retained scene, a handler for an engine that no
 * longer exists — can leak into the next. Compare `clear()` in `PhaserGame`,
 * which runs when only the engine is rebuilt and the subscribers stay valid.
 *
 * The achievements bridge is deliberately left alone: its retained status is
 * app-lifetime state, primed at module load, that the drawer should still
 * see the next time it mounts.
 */
function GameScreen() {
  useEffect(
    () => () => {
      sceneEvents.dispose();
      playerStatsToApp.dispose();
    },
    [],
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "row" }}>
      <div style={{ width: "70%", display: "flex", flexDirection: "column" }}>
        <div style={{ height: "90%", overflow: "hidden", position: "relative" }}>
          <PhaserGame />
          <Hud />
        </div>
        <div
          style={{
            height: "10%",
            background: colors.panel,
            borderTop: `1px solid ${colors.border}`,
          }}
        >
          <ControlPanel />
        </div>
      </div>
      <div
        style={{
          width: "30%",
          background: colors.panel,
          borderLeft: `1px solid ${colors.border}`,
        }}
      >
        <AchievementsDrawer />
      </div>
    </div>
  );
}

function App() {
  const [gameMounted, setGameMounted] = useState(true);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: colors.background,
        color: colors.text,
      }}
    >
      <div style={{ height: "90%", position: "relative" }}>
        {gameMounted ? (
          <GameScreen />
        ) : (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0.6,
            }}
          >
            Game unmounted — the bridges have been disposed.
          </div>
        )}
        {/* Mount/unmount the whole game screen: the Debug Console below stays
            put, so the `unsubscribe` and `clear` records from `dispose()` are
            visible as they happen. */}
        <button
          onClick={() => setGameMounted((mounted) => !mounted)}
          style={{ position: "absolute", top: 8, right: 8 }}
        >
          {gameMounted ? "Unmount game" : "Mount game"}
        </button>
      </div>
      <div
        style={{
          height: "10%",
          background: colors.panel,
          borderTop: `1px solid ${colors.border}`,
        }}
      >
        <DebugConsole />
      </div>
    </div>
  );
}

export default App;
