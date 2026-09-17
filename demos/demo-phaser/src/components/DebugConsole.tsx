import { useEffect, useState } from "react";
import type Phaser from "phaser";
import { attachLogger, safeStringify, type LogRecord } from "@gamebridge-react/core";
import { sceneEventsToEngine, sceneEventsToApp } from "../phaser/SceneEvents";
import { achievementsToApp } from "../phaser/AchievementTracker";
import { playerStatsToApp } from "../phaser/PlayerStatsBridge";

const MAX_RECORDS = 50;

/**
 * `SceneCreated`'s payload carries a live `Phaser.Scene` — which holds the
 * whole `Game` (renderer, every texture, every other scene...). Logging that
 * verbatim tries to serialize the entire engine and can exceed the JS string
 * length limit, so it's swapped for just the scene's key before logging.
 */
function formatPayload(payload: unknown): unknown {
  if (payload !== null && typeof payload === "object" && "scene" in payload) {
    const { scene, ...rest } = payload as { scene: Phaser.Scene };
    return { ...rest, scene: scene.sys.settings.key };
  }
  return payload;
}

/** Live view of every bridge in the app, via a single `attachLogger` call. */
export default function DebugConsole() {
  const [records, setRecords] = useState<LogRecord[]>([]);

  useEffect(() => {
    const logger = {
      debug(record: object) {
        setRecords((current) => [...current.slice(-(MAX_RECORDS - 1)), record as LogRecord]);
      },
    };

    return attachLogger([sceneEventsToEngine, sceneEventsToApp, achievementsToApp, playerStatsToApp], logger, {
      verbose: true,
      formatPayload,
    });
  }, []);

  return (
    <div
      style={{
        fontFamily: "monospace",
        fontSize: 12,
        overflowY: "auto",
        height: "100%",
        padding: 8,
        boxSizing: "border-box",
      }}
    >
      {records.map((record, index) => (
        <pre key={index} style={{ margin: 0 }}>
          {safeStringify(record)}
        </pre>
      ))}
    </div>
  );
}
