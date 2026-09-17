import { PhaserGame } from "./components/PhaserGame";
import AchievementsDrawer from "./components/AchievementsDrawer";
import ControlPanel from "./components/ControlPanel";
import DebugConsole from "./components/DebugConsole";
import Hud from "./components/Hud";

const colors = {
  background: "#14161b",
  panel: "#1c1f26",
  border: "#2c3038",
  text: "#e6e8ec",
};

function App() {
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
      <div style={{ height: "90%", display: "flex", flexDirection: "row" }}>
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
