import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getOfflineStatus, syncAllOfflineData, type OfflineStatus } from "./offlineManager";

const games = [
	{
		name: "Imposter",
		path: "/imposter",
		emoji: "🕵️",
		description: "Wer ist der Imposter? Finde es heraus!",
		status: "ready",
		offlineKey: "imposter",
	},
	{
		name: "Piccolo",
		path: "/piccolo",
		emoji: "🎉",
		description: "Party-Challenges für die ganze Gruppe.",
		status: "ready",
		offlineKey: "piccolo",
	},
	{
		name: "Wer wird Elite-Hater?",
		path: "/quiz",
		emoji: "🧠",
		description: "Quiz mit ELO-System. Wie gut kennst du die Lore?",
		status: "ready",
		offlineKey: "quiz",
	},
	{
		name: "Schach",
		path: "/chess",
		emoji: "♟️",
		description: "Lokales 1v1 Standard-Schach.",
		status: "ready",
		offlineKey: null,
	},
];

function formatSyncTime(isoString: string | null): string {
	if (!isoString) return "Nie";
	const d = new Date(isoString);
	const now = new Date();
	const diffMs = now.getTime() - d.getTime();
	const diffMin = Math.floor(diffMs / 60000);
	if (diffMin < 1) return "Gerade eben";
	if (diffMin < 60) return `Vor ${diffMin} Min.`;
	const diffH = Math.floor(diffMin / 60);
	if (diffH < 24) return `Vor ${diffH} Std.`;
	return `Vor ${Math.floor(diffH / 24)} Tagen`;
}

export function Home() {
	const [offlineStatuses, setOfflineStatuses] = useState<OfflineStatus[]>([]);
	const [syncing, setSyncing] = useState(false);

	useEffect(() => {
		getOfflineStatus().then(setOfflineStatuses).catch(() => {});
	}, []);

	const handleSync = async () => {
		setSyncing(true);
		try {
			await syncAllOfflineData();
			const updated = await getOfflineStatus();
			setOfflineStatuses(updated);
		} catch { /* ignore */ }
		setSyncing(false);
	};

	const getStatusForGame = (key: string | null): OfflineStatus | undefined =>
		key ? offlineStatuses.find((s) => s.game === key) : undefined;

	return (
		<div>
			<h1>🎮 PlayBox</h1>
			<p className="muted-text">Wähle ein Spiel:</p>
			<div className="game-grid">
				{games.map((game) => {
					const offline = getStatusForGame(game.offlineKey);
					return (
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
							{offline && offline.available && (
								<span className="offline-badge" title={`${offline.itemCount} Items — ${formatSyncTime(offline.syncedAt)}`}>
									📴 Offline bereit
								</span>
							)}
						</Link>
					);
				})}
			</div>

			<div style={{ marginTop: "1.5rem", textAlign: "center" }}>
				<button
					type="button"
					className="button button--ghost"
					onClick={() => void handleSync()}
					disabled={syncing}
					style={{ fontSize: "0.85rem" }}
				>
					{syncing ? "⏳ Synchronisiere..." : "🔄 Offline-Daten aktualisieren"}
				</button>
				{offlineStatuses.length > 0 && (
					<p className="muted-text" style={{ fontSize: "0.75rem", marginTop: "0.5rem" }}>
						{offlineStatuses
							.filter((s) => s.available)
							.map((s) => `${s.game}: ${s.itemCount} Items`)
							.join(" · ") || "Noch keine Offline-Daten"}
					</p>
				)}
			</div>
		</div>
	);
}

