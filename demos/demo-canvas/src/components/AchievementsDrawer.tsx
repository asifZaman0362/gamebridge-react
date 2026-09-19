import { useEffect, useState } from "react";
import { useBridgeEvent } from "@gamebridge-react/react";
import {
  achievementsToApp,
  type AchievementStatusEntry,
} from "../canvas/AchievementTracker";

const TOAST_DURATION_MS = 4000;

export default function AchievementsDrawer() {
  const [view, setView] = useState<AchievementStatusEntry[]>([]);
  const [toast, setToast] = useState<{
    name: string;
    description: string;
  } | null>(null);

  useBridgeEvent(
    achievementsToApp,
    "statusChanged",
    ({ entries }) => setView(entries),
    { label: "AchievementsDrawer" },
  );
  useBridgeEvent(
    achievementsToApp,
    "unlocked",
    ({ name, description }) => setToast({ name, description }),
    { label: "AchievementsDrawer:toast" },
  );

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <div style={{ height: "100%", padding: 16, boxSizing: "border-box", overflowY: "auto" }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Achievements</h2>
      {toast && (
        <div
          style={{
            background: "#20351f",
            border: "1px solid #4caf50",
            borderRadius: 6,
            padding: "8px 12px",
            marginBottom: 12,
          }}
        >
          🏆 {toast.name} — {toast.description}
        </div>
      )}
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {view.map(({ name, unlocked, description }) => (
          <li key={name} style={{ opacity: unlocked ? 1 : 0.5 }}>
            <span>{unlocked ? "🏆" : "🔒"}</span> {name} — {description}
          </li>
        ))}
      </ul>
    </div>
  );
}
