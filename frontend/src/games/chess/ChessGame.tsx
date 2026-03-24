import { GamePlaceholder } from "../../core/GamePlaceholder";

export default function ChessGame() {
  return (
    <GamePlaceholder
      emoji="♟️"
      title="Chess Variants"
      description="Schach mit weniger Reihen und anderen Varianten."
      phaseLabel="Low Priority"
      details={[
        "Dieser Bereich bleibt bewusst schlank, bis Imposter, Piccolo und Quiz weiter sind.",
      ]}
    />
  );
}

