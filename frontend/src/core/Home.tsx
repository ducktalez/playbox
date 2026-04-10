import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getOfflineStatus, syncAllOfflineData, type OfflineStatus } from "./offlineManager";
import { useTranslation } from "./i18n";
import { coreTranslations } from "./translations";

const games = [
	{
		nameKey: "home.imposter.name",
		path: "/imposter",
		emoji: "🕵️",
		descKey: "home.imposter.desc",
		status: "ready",
		offlineKey: "imposter",
	},
	{
		nameKey: "home.piccolo.name",
		path: "/piccolo",
		emoji: "🎉",
		descKey: "home.piccolo.desc",
		status: "ready",
		offlineKey: "piccolo",
	},
	{
		nameKey: "home.quiz.name",
		path: "/quiz",
		emoji: "🧠",
		descKey: "home.quiz.desc",
		status: "ready",
		offlineKey: "quiz",
	},
	{
		nameKey: "home.chess.name",
		path: "/chess",
		emoji: "♟️",
		descKey: "home.chess.desc",
		status: "ready",
		offlineKey: null,
	},
];

export function Home() {
	const { t } = useTranslation(coreTranslations);
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

	function formatSyncTime(isoString: string | null): string {
		if (!isoString) return t("time.never");
		const d = new Date(isoString);
		const now = new Date();
		const diffMs = now.getTime() - d.getTime();
		const diffMin = Math.floor(diffMs / 60000);
		if (diffMin < 1) return t("time.justNow");
		if (diffMin < 60) return t("time.minutesAgo", { min: diffMin });
		const diffH = Math.floor(diffMin / 60);
		if (diffH < 24) return t("time.hoursAgo", { hours: diffH });
		return t("time.daysAgo", { days: Math.floor(diffH / 24) });
	}

	const getStatusForGame = (key: string | null): OfflineStatus | undefined =>
		key ? offlineStatuses.find((s) => s.game === key) : undefined;

	return (
		<div>
			<h1>{t("home.title")}</h1>
			<p className="muted-text">{t("home.subtitle")}</p>
			<div className="game-grid">
				{games.map((game) => {
					const offline = getStatusForGame(game.offlineKey);
					return (
						<Link key={game.path} to={game.path} className="surface-card">
							<div style={{ fontSize: "2rem" }}>{game.emoji}</div>
							<h2 style={{ margin: "0.5rem 0", color: "var(--text-primary)" }}>
								{t(game.nameKey)}
							</h2>
							<p className="muted-text" style={{ margin: 0 }}>
								{t(game.descKey)}
							</p>
							{game.status === "coming soon" && (
								<span className="status-badge">
									{t("home.comingSoon")}
								</span>
							)}
							{offline && offline.available && (
								<span className="offline-badge" title={`${offline.itemCount} Items — ${formatSyncTime(offline.syncedAt)}`}>
									{t("home.offlineReady")}
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
					{syncing ? t("home.syncing") : t("home.sync")}
				</button>
				{offlineStatuses.length > 0 && (
					<p className="muted-text" style={{ fontSize: "0.75rem", marginTop: "0.5rem" }}>
						{offlineStatuses
							.filter((s) => s.available)
							.map((s) => `${s.game}: ${s.itemCount} Items`)
							.join(" · ") || t("home.noOfflineData")}
					</p>
				)}
			</div>
		</div>
	);
}

