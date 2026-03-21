"""Piccolo — Game service / business logic."""

import random
import uuid

from app.games.piccolo.schemas import ChallengeOut, SessionOut

# In-memory session storage
_sessions: dict[uuid.UUID, dict] = {}

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
]


class PiccoloService:
    """Business logic for the Piccolo game."""

    def get_categories(self) -> list[str]:
        """Return unique challenge categories."""
        return sorted({c["category"] for c in _CHALLENGES})

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
        random.shuffle(available)  # noqa: S311

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

