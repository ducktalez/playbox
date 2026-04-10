export function normalizePlayerNames(playerNames: string[], prefix = "Spieler"): string[] {
  return playerNames.map((playerName, index) => {
    const trimmed = playerName.trim();
    return trimmed || `${prefix} ${index + 1}`;
  });
}

export function countEnteredPlayerNames(playerNames: string[]): number {
  return playerNames.filter((playerName) => playerName.trim().length > 0).length;
}
