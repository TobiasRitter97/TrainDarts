import { BoardStatusBadge } from "./components/BoardStatusBadge";
import { PlayerSelectionScreen } from "./screens/PlayerSelectionScreen";
import "./App.css";

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-title">DARTS TRAINING PLATFORM</div>
        <BoardStatusBadge />
      </header>
      <main className="app-main">
        <PlayerSelectionScreen />
      </main>
    </div>
  );
}
