import { useState } from "react";
import { GameDefinition, Profile } from "./api";
import { BoardControlBar } from "./components/BoardControlBar";
import { GameHubScreen } from "./screens/GameHubScreen";
import { GameSetupScreen } from "./screens/GameSetupScreen";
import { GameScreen } from "./screens/GameScreen";
import "./App.css";

type View =
  | { screen: "hub" }
  | { screen: "setup"; gameId: string }
  | { screen: "game"; game: GameDefinition; players: Profile[]; settings: Record<string, unknown> };

export default function App() {
  const [view, setView] = useState<View>({ screen: "hub" });

  return (
    <div className="app-shell">
      {view.screen !== "game" && (
        <header className="app-header">
          <div className="app-title">DARTS TRAINING PLATFORM</div>
          <BoardControlBar />
        </header>
      )}
      <main className="app-main">
        {view.screen === "hub" && (
          <GameHubScreen onSelectGame={(gameId) => setView({ screen: "setup", gameId })} />
        )}
        {view.screen === "setup" && (
          <GameSetupScreen
            gameId={view.gameId}
            onBack={() => setView({ screen: "hub" })}
            onStart={(game, players, settings) => setView({ screen: "game", game, players, settings })}
          />
        )}
        {view.screen === "game" && (
          <GameScreen game={view.game} players={view.players} onExit={() => setView({ screen: "hub" })} />
        )}
      </main>
    </div>
  );
}
