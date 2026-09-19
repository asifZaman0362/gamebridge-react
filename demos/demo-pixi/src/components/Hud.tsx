import { useState } from "react";
import { useBridgeEvent } from "@gamebridge-react/react";
import { playerStatsToApp, type PlayerStatsSnapshot } from "../pixi/PlayerStatsBridge";
import { GAME_WIDTH } from "../pixi/main";

const INITIAL_STATS: PlayerStatsSnapshot = { health: 100, score: 0, steps: 0 };

/** Overlays the player's live stats on top of the Pixi canvas, fed entirely over the bridge. */
export default function Hud() {
  const [stats, setStats] = useState<PlayerStatsSnapshot>(INITIAL_STATS);

  useBridgeEvent(playerStatsToApp, "statsChanged", setStats);

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: GAME_WIDTH,
        display: "flex",
        justifyContent: "space-between",
        padding: "10px 16px",
        boxSizing: "border-box",
        fontFamily: "Arial, sans-serif",
        fontSize: 16,
        fontWeight: "bold",
        color: "#ffffff",
        textShadow: "0 1px 3px rgba(0,0,0,0.85)",
        pointerEvents: "none",
      }}
    >
      <span>HP: {stats.health}</span>
      <span>Score: {stats.score}</span>
      <span>Steps: {stats.steps}</span>
    </div>
  );
}
