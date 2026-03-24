type GamePlaceholderProps = {
  emoji: string;
  title: string;
  description: string;
  details?: string[];
  phaseLabel: string;
};

export function GamePlaceholder({
  emoji,
  title,
  description,
  details = [],
  phaseLabel,
}: GamePlaceholderProps) {
  return (
    <section className="placeholder-page">
      <p className="placeholder-kicker">{phaseLabel}</p>
      <h1>
        {emoji} {title}
      </h1>
      <p>{description}</p>

      <div className="placeholder-panel">
        {details.map((detail) => (
          <p key={detail} className="muted-text">
            {detail}
          </p>
        ))}
      </div>
    </section>
  );
}

