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
			<p className="muted-text">Wähle ein Spiel:</p>
			<div className="game-grid">
				{games.map((game) => (
					<Link key={game.path} to={game.path} className="surface-card">
						<div style={{ fontSize: "2rem" }}>{game.emoji}</div>
						<h2 style={{ margin: "0.5rem 0", color: "var(--text-primary)" }}>
							{game.name}
						</h2>
						<p className="muted-text" style={{ margin: 0 }}>
							{game.description}
						</p>
						{game.status === "coming soon" && (
							<span className="status-badge">
								Coming Soon
							</span>
						)}
					</Link>
				))}
			</div>
		</div>
	);
}

