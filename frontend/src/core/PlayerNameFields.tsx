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
  return (
    <>
      <div className="stack-md">
        {playerNames.map((playerName, index) => (
          <div key={index} className="player-row">
            <input
              className="text-input"
              type="text"
              value={playerName}
              placeholder={`Player ${index + 1}`}
              onChange={(event) => onUpdatePlayerName(index, event.target.value)}
            />
            <button
              type="button"
              className="button button--secondary"
              onClick={() => onRemovePlayerField(index)}
              disabled={playerNames.length <= minPlayers}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="button-row">
        <button
          type="button"
          className="button button--secondary"
          onClick={onAddPlayerField}
          disabled={playerNames.length >= maxPlayers}
        >
          Add player
        </button>
        <span className="helper-text">{helperText}</span>
      </div>
    </>
  );
}

