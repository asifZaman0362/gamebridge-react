import { createBridge } from "@gamebridge-react/core";

export type PlayerStatsSnapshot = {
  health: number;
  score: number;
  steps: number;
};

export type PlayerStatsEventsToApp = {
  statsChanged: PlayerStatsSnapshot;
};

/**
 * One-way bridge reporting the player's HUD-relevant stats to the app. Kept
 * separate from {@link "./AchievementTracker"} because it carries the current
 * value of every stat on each change, not per-stat deltas.
 */
const playerStats = createBridge<PlayerStatsEventsToApp>({
  name: "playerStats",
  // State, not a command: a HUD mounting mid-level needs the current values.
  buffer: { statsChanged: "replay" },
});

export const playerStatsToApp = playerStats;

export function publishPlayerStats(stats: PlayerStatsSnapshot): void {
  playerStats.emit("statsChanged", stats);
}
