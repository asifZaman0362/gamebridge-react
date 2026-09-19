import { createBridge } from "@gamebridge-react/core";
import { ACHIEVEMENTS, describeCriteria, type AchievementName, type AchievementStat } from "../achievements";

/**
 * The shape of a game-owned stats object. The tracker never holds one of
 * these itself — it only ever sees one stat at a time, via
 * {@link onStatUpdate} — so this exists purely as the contract for whatever
 * the game uses to track steps/score/kills.
 */
export type AchievementStats = Record<AchievementStat, number>;

/** A single achievement's current state, as shown to the app — no criteria, just the result. */
export type AchievementStatusEntry = {
  name: AchievementName;
  unlocked: boolean;
  description: string;
};

export type AchievementEventsToApp = {
  /** Fired once per achievement, the moment it unlocks. Drives a toast. */
  unlocked: { name: AchievementName; description: string };
  /** The full current picture. Drives the drawer's list. */
  statusChanged: { entries: AchievementStatusEntry[] };
};

/**
 * Engine-side owner of achievement state: the criteria table and the
 * decision of when something unlocks. It does not track stats itself — the
 * game reports changes via {@link onStatUpdate} — and nothing on the app
 * side can trigger an unlock; it only hears about the result, via
 * `achievementsToApp`.
 */
const achievements = createBridge<AchievementEventsToApp>({
  name: "achievements",
  buffer: { unlocked: "queue", statusChanged: "replay" },
});

/**
 * The app side's only handle onto achievement state. Only ever call `.on()`
 * / `.once()` on this from the app — it is conceptually read-only, the same
 * way `playerStatsToApp` in {@link "./PlayerStatsBridge"} is.
 */
export const achievementsToApp = achievements;

const STORAGE_KEY = "gamebridge-demo:unlockedAchievements";

function readUnlocked(): Set<AchievementName> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const names: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(names)) return new Set();
    return new Set(names.filter((name): name is AchievementName => name in ACHIEVEMENTS));
  } catch {
    return new Set();
  }
}

function saveUnlocked(unlocked: Set<AchievementName>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...unlocked]));
  } catch {
    // Storage unavailable (private browsing, quota exceeded) — progress just
    // won't persist across reloads.
  }
}

const unlockedNames = readUnlocked();

function buildStatusEntries(): AchievementStatusEntry[] {
  return (Object.keys(ACHIEVEMENTS) as AchievementName[]).map((name) => ({
    name,
    unlocked: unlockedNames.has(name),
    description: describeCriteria(ACHIEVEMENTS[name]),
  }));
}

function publishStatus(): void {
  achievements.emit("statusChanged", { entries: buildStatusEntries() });
}

function unlock(name: AchievementName): void {
  if (unlockedNames.has(name)) return;
  unlockedNames.add(name);
  saveUnlocked(unlockedNames);
  achievements.emit("unlocked", { name, description: describeCriteria(ACHIEVEMENTS[name]) });
  publishStatus();
}

/**
 * Report that one stat changed to `value`. Unlocks any still-locked
 * achievement whose criteria this update, on its own, now satisfies.
 *
 * An achievement whose criteria names more than one stat can't be confirmed
 * from a single `{ key, value }` update — the tracker has no memory of the
 * others — so it stays locked until every stat it needs is reported at a
 * sufficient value in one call. Today's achievements are all single-stat, so
 * this doesn't come up in practice.
 *
 * ```ts
 * onStatUpdate({ key: "score", value: this.score });
 * ```
 */
export function onStatUpdate({ key, value }: { key: AchievementStat; value: number }): void {
  for (const name of Object.keys(ACHIEVEMENTS) as AchievementName[]) {
    if (unlockedNames.has(name)) continue;
    const criteria = Object.entries(ACHIEVEMENTS[name]) as [AchievementStat, number][];
    const satisfied = criteria.every(([stat, required]) => stat === key && value >= required);
    if (satisfied) unlock(name);
  }
}

// Populate the replay slot immediately, so a drawer mounting before any
// scene reports stats still sees the full (locked, or previously-persisted)
// picture rather than an empty list.
publishStatus();
