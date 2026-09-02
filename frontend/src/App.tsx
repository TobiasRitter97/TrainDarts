import { useState } from "react";
import { BoardControlBar } from "./components/BoardControlBar";
import { GameHubScreen } from "./screens/GameHubScreen";
import { GameSetupScreen } from "./screens/GameSetupScreen";
import "./App.css";

type View = { screen: "hub" } | { screen: "setup"; gameId: string };

export default function App() {
  const [view, setView] = useState<View>({ screen: "hub" });

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-title">DARTS TRAINING PLATFORM</div>
        <BoardControlBar />
      </header>
      <main className="app-main">
        {view.screen === "hub" && (
          <GameHubScreen onSelectGame={(gameId) => setView({ screen: "setup", gameId })} />
        )}
        {view.screen === "setup" && (
          <GameSetupScreen gameId={view.gameId} onBack={() => setView({ screen: "hub" })} />
        )}
      </main>
    </div>
  );
}
