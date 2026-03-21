import { Link } from "react-router-dom";

const games = [
  {
    name: "Imposter",
    path: "/imposter",
    emoji: "🕵️",
    description: "Wer ist der Imposter? Finde es heraus!",
    status: "ready",
  },
  {
    name: "Piccolo",
    path: "/piccolo",
    emoji: "🎉",
    description: "Party-Challenges für die ganze Gruppe.",
    status: "ready",
  },
  {
    name: "Wer wird Elite-Hater?",
    path: "/quiz",
    emoji: "🧠",
    description: "Quiz mit ELO-System. Wie gut kennst du die Lore?",
    status: "ready",
  },
  {
    name: "Chess Variants",
    path: "/chess",
    emoji: "♟️",
    description: "Schach mit weniger Reihen und mehr Chaos.",
    status: "coming soon",
  },
];

export function Home() {
  return (
    <div>
      <h1>🎮 PlayBox</h1>
      <p>Wähle ein Spiel:</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1.5rem", marginTop: "1.5rem" }}>
        {games.map((game) => (
          <Link
            key={game.path}
            to={game.path}
            style={{
              display: "block",
              padding: "1.5rem",
              borderRadius: "12px",
              background: "#1a1a2e",
              color: "#fff",
              textDecoration: "none",
              transition: "transform 0.2s",
            }}
          >
            <div style={{ fontSize: "2rem" }}>{game.emoji}</div>
            <h2 style={{ margin: "0.5rem 0" }}>{game.name}</h2>
            <p style={{ color: "#aaa", margin: 0 }}>{game.description}</p>
            {game.status === "coming soon" && (
              <span style={{ color: "#f0a500", fontSize: "0.8rem", marginTop: "0.5rem", display: "inline-block" }}>
                Coming Soon
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

