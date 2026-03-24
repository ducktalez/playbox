export function normalizePlayerNames(playerNames: string[]): string[] {
  return playerNames.map((playerName, index) => {
    const trimmed = playerName.trim();
    return trimmed || `Player ${index + 1}`;
  });
}

export function countEnteredPlayerNames(playerNames: string[]): number {
  return playerNames.filter((playerName) => playerName.trim().length > 0).length;
}

