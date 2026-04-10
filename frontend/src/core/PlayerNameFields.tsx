type PlayerNameFieldsProps = {
  playerNames: string[];
  minPlayers: number;
  maxPlayers: number;
  helperText: string;
  onUpdatePlayerName: (index: number, value: string) => void;
  onAddPlayerField: () => void;
  onRemovePlayerField: (index: number) => void;
};

export function PlayerNameFields({
  playerNames,
  minPlayers,
  maxPlayers,
  helperText,
  onUpdatePlayerName,
  onAddPlayerField,
  onRemovePlayerField,
}: PlayerNameFieldsProps) {
  const canAdd = playerNames.length < maxPlayers;

  return (
    <div className="stack-md">
      {playerNames.map((playerName, index) => (
        <div key={index} className="player-row">
          <input
            className="text-input player-row__input"
            type="text"
            value={playerName}
            placeholder={`Player ${index + 1}`}
            onChange={(event) => onUpdatePlayerName(index, event.target.value)}
          />
          {playerNames.length > minPlayers && (
            <button
              type="button"
              className="player-row__remove"
              onClick={() => onRemovePlayerField(index)}
              aria-label={`Remove player ${index + 1}`}
            >
              ×
            </button>
          )}
        </div>
      ))}

      {canAdd && (
        <div
          className="player-row player-row--ghost"
          onClick={onAddPlayerField}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onAddPlayerField(); }}
        >
          <span className="text-input player-row__placeholder">
            Player {playerNames.length + 1}
          </span>
        </div>
      )}

      <span className="helper-text">{helperText}</span>
    </div>
  );
}

