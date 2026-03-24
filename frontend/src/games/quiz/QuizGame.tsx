import { GamePlaceholder } from "../../core/GamePlaceholder";

export default function QuizGame() {
  return (
    <GamePlaceholder
      emoji="🧠"
      title="Wer wird Elite-Hater?"
      description="Quiz mit ELO-System — teste dein Wissen über die Lore."
      phaseLabel="Phase 3"
      details={[
        "Modi: Wer wird Millionär · Quizduell",
        "Die UI folgt nach den priorisierten Backend-Schritten.",
      ]}
    />
  );
}
