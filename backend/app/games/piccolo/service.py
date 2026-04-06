"""Piccolo — Game service / business logic."""

import random
import uuid
from datetime import datetime, timezone

from app.core.errors import AppError
from app.games.piccolo.schemas import (
    ChallengeOut,
    ChallengeTemplateOut,
    ChallengeFeedbackIn,
    ChallengeFeedbackOut,
    SessionOut,
    FEEDBACK_TYPES,
    REPORT_CATEGORIES,
)

# In-memory session storage
_sessions: dict[uuid.UUID, dict] = {}

# In-memory feedback storage (no persistence — resets on restart, like sessions)
_feedback: list[dict] = []

# Challenge templates — {player} is replaced with a random player name
_CHALLENGES: list[dict] = [
    # Dare — mild
    {"text": "{player}, nimm einen Schluck!", "category": "dare", "intensity": "mild", "target_count": 1},
    {"text": "{player}, mach 5 Kniebeugen!", "category": "dare", "intensity": "mild", "target_count": 1},
    {"text": "{player}, sag etwas Nettes über {player2}!", "category": "dare", "intensity": "mild", "target_count": 2},
    {"text": "Alle trinken!", "category": "group", "intensity": "mild", "target_count": 0},
    {"text": "{player}, erzähl einen Witz!", "category": "dare", "intensity": "mild", "target_count": 1},
    # Dare — medium
    {"text": "{player}, imitiere {player2} — die Gruppe bewertet!", "category": "dare", "intensity": "medium", "target_count": 2},
    {"text": "{player}, zeig dein letztes Foto in der Galerie!", "category": "dare", "intensity": "medium", "target_count": 1},
    {"text": "{player}, tausche ein Kleidungsstück mit {player2}!", "category": "dare", "intensity": "medium", "target_count": 2},
    {"text": "{player}, sing 10 Sekunden lang!", "category": "dare", "intensity": "medium", "target_count": 1},
    # Dare — spicy
    {"text": "{player}, ruf die letzte Person in deiner Anrufliste an und sag 'Ich liebe dich'!", "category": "dare", "intensity": "spicy", "target_count": 1},
    {"text": "{player}, lass {player2} eine Nachricht von deinem Handy schreiben!", "category": "dare", "intensity": "spicy", "target_count": 2},
    # Question — mild
    {"text": "{player}, was ist dein Guilty Pleasure?", "category": "question", "intensity": "mild", "target_count": 1},
    {"text": "{player}, was war dein peinlichster Moment?", "category": "question", "intensity": "mild", "target_count": 1},
    # Question — medium
    {"text": "{player}, wer in der Runde wäre der schlechteste Mitbewohner?", "category": "question", "intensity": "medium", "target_count": 1},
    {"text": "Abstimmung: Wer ist am ehesten dazu fähig, bei einer Castingshow mitzumachen?", "category": "vote", "intensity": "medium", "target_count": 0},
    # Versus
    {"text": "Staring Contest: {player} vs. {player2} — wer zuerst blinzelt, trinkt!", "category": "versus", "intensity": "medium", "target_count": 2},
    {"text": "Schnick-Schnack-Schnuck: {player} vs. {player2} — Verlierer trinkt!", "category": "versus", "intensity": "mild", "target_count": 2},
    # Automarken
    {"text": "Automarken: Nennt reihum Automarken. {player} beginnt.", "category": "automarken", "intensity": "mild", "target_count": 1},
    {"text": "Automarken: {player} nennt eine Marke, {player2} muss sofort eine andere ergänzen.", "category": "automarken", "intensity": "medium", "target_count": 2},
    {"text": "Automarken-Finale: Wer als Nächstes keine Marke mehr weiß, trinkt doppelt.", "category": "automarken", "intensity": "spicy", "target_count": 0},
    # Koffer packen
    {"text": "Koffer packen: {player} startet mit dem ersten Gegenstand.", "category": "koffer packen", "intensity": "mild", "target_count": 1},
    {"text": "Koffer packen: {player} und {player2} wiederholen die Liste gemeinsam — der erste Fehler verliert.", "category": "koffer packen", "intensity": "medium", "target_count": 2},
    {"text": "Koffer packen Extrem: Die Runde baut die Liste weiter aus. Wer stockt, trinkt.", "category": "koffer packen", "intensity": "spicy", "target_count": 0},
    # Ich habe schon mal
    {"text": "Ich habe schon mal: Alle, auf die die Aussage von {player} zutrifft, zeigen kurz auf.", "category": "ich habe schon mal", "intensity": "mild", "target_count": 1},
    {"text": "Ich habe schon mal: {player} sagt etwas Mutiges. Wer es auch getan hat, trinkt einen Schluck.", "category": "ich habe schon mal", "intensity": "medium", "target_count": 1},
    {"text": "Ich habe schon mal: Die Runde geht all in — wer die Aussage auch erlebt hat, trinkt doppelt.", "category": "ich habe schon mal", "intensity": "spicy", "target_count": 0},
    # Trinkregeln
    {"text": "Trinkregel: Ab jetzt darf niemand mehr Vornamen benutzen. Wer es doch tut, trinkt.", "category": "trinkregeln", "intensity": "mild", "target_count": 0},
    {"text": "Trinkregel: Immer wenn {player} lacht, müssen alle einen Schluck nehmen.", "category": "trinkregeln", "intensity": "medium", "target_count": 1},
    {"text": "Trinkregel: Für die nächsten drei Runden darf nur flüsternd gesprochen werden. Wer es vergisst, trinkt doppelt.", "category": "trinkregeln", "intensity": "spicy", "target_count": 0},
    # More question / vote / group coverage
    {"text": "{player}, was war dein schlimmster Fehlkauf?", "category": "question", "intensity": "mild", "target_count": 1},
    {"text": "{player}, mit wem aus der Runde würdest du spontan einen Roadtrip machen?", "category": "question", "intensity": "medium", "target_count": 1},
    {"text": "{player}, welche rote Flagge ignorierst du viel zu oft?", "category": "question", "intensity": "spicy", "target_count": 1},
    {"text": "Gruppenregel: Alle, die heute schon zu spät waren, trinken einen Schluck.", "category": "group", "intensity": "mild", "target_count": 0},
    {"text": "Gruppenaufgabe: Alle zeigen gleichzeitig ihr peinlichstes Selfie-Gesicht.", "category": "group", "intensity": "medium", "target_count": 0},
    {"text": "Gruppenduell: Die Runde entscheidet, wer die gefährlichste Party-Idee hätte. Diese Person trinkt doppelt.", "category": "group", "intensity": "spicy", "target_count": 0},
    {"text": "Abstimmung: Wer würde in einer Zombie-Apokalypse als Erstes ausflippen?", "category": "vote", "intensity": "mild", "target_count": 0},
    {"text": "Abstimmung: Wer aus der Runde wäre am ehesten heimlich berühmt auf TikTok?", "category": "vote", "intensity": "medium", "target_count": 0},
    {"text": "Abstimmung: Wer würde am ehesten mit dem Ex einer Freundin oder eines Freundes schreiben?", "category": "vote", "intensity": "spicy", "target_count": 0},
    {"text": "Mini-Duell: {player} und {player2} erklären gleichzeitig denselben Film in drei Wörtern.", "category": "versus", "intensity": "medium", "target_count": 2},
    {"text": "Reflex-Duell: {player} gegen {player2} — wer zuletzt auf den Tisch tippt, trinkt.", "category": "versus", "intensity": "spicy", "target_count": 2},
    # More Automarken
    {"text": "Automarken: {player} darf eine Kategorie festlegen — Luxus, Kleinwagen oder Oldtimer.", "category": "automarken", "intensity": "mild", "target_count": 1},
    {"text": "Automarken: {player} nennt eine Marke, {player2} muss sofort das passende Logo beschreiben.", "category": "automarken", "intensity": "medium", "target_count": 2},
    {"text": "Automarken: Die Runde nennt nur noch deutsche Marken. Wer scheitert, trinkt doppelt.", "category": "automarken", "intensity": "spicy", "target_count": 0},
    # More Koffer packen
    {"text": "Koffer packen: {player} beginnt mit einem unnötigen Luxusgegenstand.", "category": "koffer packen", "intensity": "mild", "target_count": 1},
    {"text": "Koffer packen: Die Runde packt für einen Horrorurlaub. {player} beginnt.", "category": "koffer packen", "intensity": "medium", "target_count": 1},
    {"text": "Koffer packen: Nur peinliche Gegenstände sind erlaubt. Wer sich wiederholt, trinkt doppelt.", "category": "koffer packen", "intensity": "spicy", "target_count": 0},
    # More Ich habe schon mal
    {"text": "Ich habe schon mal: {player} nennt eine harmlose Jugendsünde.", "category": "ich habe schon mal", "intensity": "mild", "target_count": 1},
    {"text": "Ich habe schon mal: Wer die Aussage von {player} kennt, nimmt einen Schluck.", "category": "ich habe schon mal", "intensity": "medium", "target_count": 1},
    {"text": "Ich habe schon mal: Nur richtig wilde Geschichten zählen — alle Betroffenen trinken doppelt.", "category": "ich habe schon mal", "intensity": "spicy", "target_count": 0},
    # More Trinkregeln
    {"text": "Trinkregel: Wer auf sein Handy schaut, nimmt sofort einen Schluck.", "category": "trinkregeln", "intensity": "mild", "target_count": 0},
    {"text": "Trinkregel: Immer wenn {player} spricht, muss die Runde am Ende des Satzes applaudieren.", "category": "trinkregeln", "intensity": "medium", "target_count": 1},
    {"text": "Trinkregel: Für die nächsten drei Karten darf niemand mehr das Wort 'ich' sagen. Wer es vergisst, trinkt doppelt.", "category": "trinkregeln", "intensity": "spicy", "target_count": 0},
]


class PiccoloService:
    """Business logic for the Piccolo game."""

    def _build_balanced_challenge_order(self, challenges: list[dict]) -> list[dict]:
        """Interleave categories so one overrepresented category does not dominate the session."""
        buckets: dict[str, list[dict]] = {}
        for challenge in challenges:
            buckets.setdefault(challenge["category"], []).append(challenge)

        for bucket in buckets.values():
            random.shuffle(bucket)  # noqa: S311

        category_order = list(buckets.keys())
        random.shuffle(category_order)  # noqa: S311

        balanced: list[dict] = []
        while any(buckets.values()):
            for category in category_order:
                bucket = buckets[category]
                if bucket:
                    balanced.append(bucket.pop())

        return balanced

    def get_categories(self) -> list[str]:
        """Return unique challenge categories."""
        return sorted({c["category"] for c in _CHALLENGES})

    def get_challenges(
        self,
        category: str | None = None,
        intensity: str | None = None,
    ) -> list[ChallengeTemplateOut]:
        """Return challenge templates, optionally filtered by category and/or intensity."""
        result = _CHALLENGES
        if category:
            result = [c for c in result if c["category"].lower() == category.lower()]
        if intensity:
            result = [c for c in result if c["intensity"].lower() == intensity.lower()]
        return [
            ChallengeTemplateOut(
                text=c["text"],
                category=c["category"],
                intensity=c["intensity"],
                target_count=c["target_count"],
            )
            for c in result
        ]

    def create_session(
        self,
        player_names: list[str],
        intensity: str = "medium",
        categories: list[str] | None = None,
    ) -> SessionOut:
        """Create a new game session."""
        # Filter challenges by intensity and categories
        allowed_intensities = {"mild": ["mild"], "medium": ["mild", "medium"], "spicy": ["mild", "medium", "spicy"]}
        available = [
            c for c in _CHALLENGES
            if c["intensity"] in allowed_intensities.get(intensity, ["mild", "medium"])
            and (categories is None or c["category"] in categories)
        ]

        session_id = uuid.uuid4()
        available = self._build_balanced_challenge_order(available)

        _sessions[session_id] = {
            "id": session_id,
            "player_names": player_names,
            "intensity": intensity,
            "challenges": available,
            "index": 0,
        }

        return SessionOut(
            id=session_id,
            player_names=player_names,
            intensity=intensity,
            total_challenges=len(available),
        )

    def next_challenge(self, session_id: uuid.UUID) -> ChallengeOut:
        """Get the next challenge, cycling through the list."""
        session = _sessions.get(session_id)
        if not session:
            return ChallengeOut(text="Session not found", category="error", intensity="mild", targets=[])

        challenges = session["challenges"]
        if not challenges:
            return ChallengeOut(text="No challenges available", category="error", intensity="mild", targets=[])

        # Cycle through challenges
        idx = session["index"] % len(challenges)
        session["index"] = idx + 1

        template = challenges[idx]
        players = session["player_names"]

        # Pick random players for this challenge
        targets: list[str] = []
        text = template["text"]
        if template["target_count"] >= 1:
            p1 = random.choice(players)  # noqa: S311
            text = text.replace("{player}", p1, 1)
            targets.append(p1)
        if template["target_count"] >= 2:
            remaining = [p for p in players if p != targets[0]] or players
            p2 = random.choice(remaining)  # noqa: S311
            text = text.replace("{player2}", p2, 1)
            targets.append(p2)

        return ChallengeOut(
            text=text,
            category=template["category"],
            intensity=template["intensity"],
            targets=targets,
        )

    # --- Challenge Feedback ---

    def submit_feedback(self, data: ChallengeFeedbackIn) -> ChallengeFeedbackOut:
        """Submit feedback on a challenge template."""
        ft = data.feedback_type.upper()
        if ft not in FEEDBACK_TYPES:
            raise AppError(422, f"Invalid feedback_type '{data.feedback_type}'. Must be one of: {', '.join(sorted(FEEDBACK_TYPES))}", "INVALID_FEEDBACK_TYPE")

        # Validate category rules per feedback type
        if ft == "REPORT":
            if not data.category:
                raise AppError(422, "category is required for REPORT feedback.", "CATEGORY_REQUIRED")
            # Validate each category in comma-separated set
            cats = {c.strip() for c in data.category.split(",") if c.strip()}
            invalid = cats - REPORT_CATEGORIES
            if invalid:
                raise AppError(422, f"Invalid report categories: {', '.join(sorted(invalid))}. Valid: {', '.join(sorted(REPORT_CATEGORIES))}", "INVALID_CATEGORY")
        elif ft == "THUMBS_UP" and data.category:
            raise AppError(422, "category is not allowed for THUMBS_UP feedback.", "CATEGORY_NOT_ALLOWED")

        entry = {
            "id": uuid.uuid4(),
            "challenge_text": data.challenge_text,
            "feedback_type": ft,
            "category": data.category,
            "comment": data.comment,
            "created_at": datetime.now(timezone.utc),
        }
        _feedback.append(entry)

        return ChallengeFeedbackOut(**entry)

    def list_feedback(
        self,
        challenge_text: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[ChallengeFeedbackOut]:
        """List feedback entries, optionally filtered by challenge_text. Newest first."""
        items = _feedback
        if challenge_text:
            items = [f for f in items if f["challenge_text"] == challenge_text]
        # Reverse gives newest-first (items are appended chronologically)
        items = list(reversed(items))
        return [ChallengeFeedbackOut(**f) for f in items[offset:offset + limit]]
