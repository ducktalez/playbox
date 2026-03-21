"""Imposter — Game service / business logic."""

import random
import uuid
from datetime import datetime, timezone

from app.games.imposter.schemas import SessionOut, WordReportOut


# In-memory storage for sessions (no persistence needed)
_sessions: dict[uuid.UUID, dict] = {}

# In-memory word reports (to be synced to SQLite or backend later)
_reports: list[dict] = []

# Bundled word list — replace with SQLite or JSON file in production
_WORDS: list[dict] = [
    # Animals
    {"id": str(uuid.uuid4()), "text": "Elefant", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Pinguin", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Krokodil", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Flamingo", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Chamäleon", "category": "Tiere"},
    # Food
    {"id": str(uuid.uuid4()), "text": "Pizza", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Sushi", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Döner", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Schnitzel", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Mettbrötchen", "category": "Essen"},
    # Places
    {"id": str(uuid.uuid4()), "text": "Strand", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Bibliothek", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Freizeitpark", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Flughafen", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Supermarkt", "category": "Orte"},
    # Activities
    {"id": str(uuid.uuid4()), "text": "Schwimmen", "category": "Aktivitäten"},
    {"id": str(uuid.uuid4()), "text": "Kochen", "category": "Aktivitäten"},
    {"id": str(uuid.uuid4()), "text": "Tanzen", "category": "Aktivitäten"},
    {"id": str(uuid.uuid4()), "text": "Joggen", "category": "Aktivitäten"},
    {"id": str(uuid.uuid4()), "text": "Karaoke", "category": "Aktivitäten"},
    # Objects
    {"id": str(uuid.uuid4()), "text": "Regenschirm", "category": "Gegenstände"},
    {"id": str(uuid.uuid4()), "text": "Taschenlampe", "category": "Gegenstände"},
    {"id": str(uuid.uuid4()), "text": "Schaukelstuhl", "category": "Gegenstände"},
    {"id": str(uuid.uuid4()), "text": "Lautsprecher", "category": "Gegenstände"},
    {"id": str(uuid.uuid4()), "text": "Globus", "category": "Gegenstände"},
]


class ImposterService:
    """Business logic for the Imposter game."""

    def get_words(self, category: str | None = None) -> list[dict]:
        """Return words, optionally filtered by category."""
        if category:
            return [w for w in _WORDS if w["category"].lower() == category.lower()]
        return _WORDS

    def get_categories(self) -> list[str]:
        """Return unique categories."""
        return sorted({w["category"] for w in _WORDS})

    def report_word(self, word_id: uuid.UUID, reason: str) -> WordReportOut:
        """Report a word as inappropriate."""
        report_id = uuid.uuid4()
        report = {
            "id": report_id,
            "word_id": word_id,
            "reason": reason,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        _reports.append(report)
        return WordReportOut(id=report_id, word_id=word_id, reason=reason)

    def create_session(
        self,
        player_names: list[str],
        category: str | None = None,
        timer_seconds: int = 300,
    ) -> SessionOut:
        """Create a new game session with a random word and imposter."""
        available_words = self.get_words(category=category)
        if not available_words:
            available_words = _WORDS

        word = random.choice(available_words)  # noqa: S311
        imposter_index = random.randint(0, len(player_names) - 1)  # noqa: S311
        session_id = uuid.uuid4()

        session_data = {
            "id": session_id,
            "player_names": player_names,
            "word": word["text"],
            "imposter_index": imposter_index,
            "timer_seconds": timer_seconds,
        }
        _sessions[session_id] = session_data

        return SessionOut(**session_data)

    def reveal_player(self, session_id: uuid.UUID, player_index: int) -> dict:
        """Reveal what a player sees — word or IMPOSTER."""
        session = _sessions.get(session_id)
        if not session:
            return {"error": "Session not found"}

        if player_index < 0 or player_index >= len(session["player_names"]):
            return {"error": "Invalid player index"}

        is_imposter = player_index == session["imposter_index"]
        return {
            "player_name": session["player_names"][player_index],
            "display": "🕵️ IMPOSTER" if is_imposter else session["word"],
        }

