export type AchievementStat = "steps" | "score" | "kills";

export type AchievementCriteria = Partial<Record<AchievementStat, number>>;

export const ACHIEVEMENTS = {
  "First Steps": { steps: 10 },
  Marathon: { steps: 1000 },
  "High Scorer": { score: 100 },
  "Score Legend": { score: 1000 },
  "First Blood": { kills: 1 },
  Exterminator: { kills: 25 },
} satisfies Record<string, AchievementCriteria>;

export type AchievementName = keyof typeof ACHIEVEMENTS;

const STAT_LABELS: Record<AchievementStat, string> = {
  steps: "steps",
  score: "score",
  kills: "kills",
};

/** Human-readable summary of what unlocks an achievement, e.g. "1000 steps". */
export function describeCriteria(criteria: AchievementCriteria): string {
  return (Object.entries(criteria) as [AchievementStat, number][])
    .map(([stat, value]) => `${value} ${STAT_LABELS[stat]}`)
    .join(" · ");
}
