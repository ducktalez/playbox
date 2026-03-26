"""Imposter — Game service / business logic."""

import random
import uuid
from datetime import datetime, timezone

from app.core.errors import AppError
from app.games.imposter.schemas import SessionOut, WordOut, WordReportOut


# In-memory storage for sessions (no persistence needed)
_sessions: dict[uuid.UUID, dict] = {}

# In-memory word reports (to be synced to SQLite or backend later)
_reports: list[dict] = []

# Bundled word list — 200+ words across 10 categories
_WORDS: list[dict] = [
    # --- Tiere (25) ---
    {"id": str(uuid.uuid4()), "text": "Elefant", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Pinguin", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Krokodil", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Flamingo", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Chamäleon", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Delfin", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Papagei", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Schildkröte", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Gorilla", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Eichhörnchen", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Hai", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Faultier", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Kolibri", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Luchs", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Stinktier", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Seepferdchen", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Erdmännchen", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Waschbär", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Otter", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Qualle", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Igel", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Pfau", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Nashorn", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Zebra", "category": "Tiere"},
    {"id": str(uuid.uuid4()), "text": "Wombat", "category": "Tiere"},
    # --- Essen (25) ---
    {"id": str(uuid.uuid4()), "text": "Pizza", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Sushi", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Döner", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Schnitzel", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Mettbrötchen", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Lasagne", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Tacos", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Currywurst", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Ramen", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Crêpe", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Knödel", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Gulasch", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Falafel", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Dim Sum", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Churros", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Bratkartoffeln", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Käsespätzle", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Pancakes", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Pommes", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Risotto", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Brezel", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Pad Thai", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Brownie", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Flammkuchen", "category": "Essen"},
    {"id": str(uuid.uuid4()), "text": "Burrito", "category": "Essen"},
    # --- Orte (25) ---
    {"id": str(uuid.uuid4()), "text": "Strand", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Bibliothek", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Freizeitpark", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Flughafen", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Supermarkt", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Museum", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Friedhof", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Tankstelle", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Schwimmbad", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Kirche", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Zoo", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Kino", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Bahnhof", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Bauernhof", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Spielplatz", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Polizeistation", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Krankenhaus", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Fitnessstudio", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Waschsalon", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Leuchtturm", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Parkhaus", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Stadion", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Dachterrasse", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Campingplatz", "category": "Orte"},
    {"id": str(uuid.uuid4()), "text": "Kletterhalle", "category": "Orte"},
    # --- Aktivitäten (20) ---
    {"id": str(uuid.uuid4()), "text": "Schwimmen", "category": "Aktivitäten"},
    {"id": str(uuid.uuid4()), "text": "Kochen", "category": "Aktivitäten"},
    {"id": str(uuid.uuid4()), "text": "Tanzen", "category": "Aktivitäten"},
    {"id": str(uuid.uuid4()), "text": "Joggen", "category": "Aktivitäten"},
    {"id": str(uuid.uuid4()), "text": "Karaoke", "category": "Aktivitäten"},
    {"id": str(uuid.uuid4()), "text": "Angeln", "category": "Aktivitäten"},
    {"id": str(uuid.uuid4()), "text": "Bouldern", "category": "Aktivitäten"},
    {"id": str(uuid.uuid4()), "text": "Malen", "category": "Aktivitäten"},
    {"id": str(uuid.uuid4()), "text": "Geocaching", "category": "Aktivitäten"},
    {"id": str(uuid.uuid4()), "text": "Meditieren", "category": "Aktivitäten"},
    {"id": str(uuid.uuid4()), "text": "Segeln", "category": "Aktivitäten"},
    {"id": str(uuid.uuid4()), "text": "Reiten", "category": "Aktivitäten"},
    {"id": str(uuid.uuid4()), "text": "Snowboarden", "category": "Aktivitäten"},
    {"id": str(uuid.uuid4()), "text": "Stricken", "category": "Aktivitäten"},
    {"id": str(uuid.uuid4()), "text": "Zaubern", "category": "Aktivitäten"},
    {"id": str(uuid.uuid4()), "text": "Tauchen", "category": "Aktivitäten"},
    {"id": str(uuid.uuid4()), "text": "Wandern", "category": "Aktivitäten"},
    {"id": str(uuid.uuid4()), "text": "Skateboarden", "category": "Aktivitäten"},
    {"id": str(uuid.uuid4()), "text": "Yoga", "category": "Aktivitäten"},
    {"id": str(uuid.uuid4()), "text": "Fotografieren", "category": "Aktivitäten"},
    # --- Gegenstände (20) ---
    {"id": str(uuid.uuid4()), "text": "Regenschirm", "category": "Gegenstände"},
    {"id": str(uuid.uuid4()), "text": "Taschenlampe", "category": "Gegenstände"},
    {"id": str(uuid.uuid4()), "text": "Schaukelstuhl", "category": "Gegenstände"},
    {"id": str(uuid.uuid4()), "text": "Lautsprecher", "category": "Gegenstände"},
    {"id": str(uuid.uuid4()), "text": "Globus", "category": "Gegenstände"},
    {"id": str(uuid.uuid4()), "text": "Wecker", "category": "Gegenstände"},
    {"id": str(uuid.uuid4()), "text": "Fernglas", "category": "Gegenstände"},
    {"id": str(uuid.uuid4()), "text": "Kompass", "category": "Gegenstände"},
    {"id": str(uuid.uuid4()), "text": "Bügeleisen", "category": "Gegenstände"},
    {"id": str(uuid.uuid4()), "text": "Skateboard", "category": "Gegenstände"},
    {"id": str(uuid.uuid4()), "text": "Sanduhr", "category": "Gegenstände"},
    {"id": str(uuid.uuid4()), "text": "Nähmaschine", "category": "Gegenstände"},
    {"id": str(uuid.uuid4()), "text": "Drohne", "category": "Gegenstände"},
    {"id": str(uuid.uuid4()), "text": "Lupe", "category": "Gegenstände"},
    {"id": str(uuid.uuid4()), "text": "Thermoskanne", "category": "Gegenstände"},
    {"id": str(uuid.uuid4()), "text": "Fahrradschloss", "category": "Gegenstände"},
    {"id": str(uuid.uuid4()), "text": "Handventilator", "category": "Gegenstände"},
    {"id": str(uuid.uuid4()), "text": "Stoppuhr", "category": "Gegenstände"},
    {"id": str(uuid.uuid4()), "text": "Bilderrahmen", "category": "Gegenstände"},
    {"id": str(uuid.uuid4()), "text": "Kopfhörer", "category": "Gegenstände"},
    # --- Berufe (20) ---
    {"id": str(uuid.uuid4()), "text": "Astronaut", "category": "Berufe"},
    {"id": str(uuid.uuid4()), "text": "Feuerwehrmann", "category": "Berufe"},
    {"id": str(uuid.uuid4()), "text": "Pilot", "category": "Berufe"},
    {"id": str(uuid.uuid4()), "text": "Schiedsrichter", "category": "Berufe"},
    {"id": str(uuid.uuid4()), "text": "Detektiv", "category": "Berufe"},
    {"id": str(uuid.uuid4()), "text": "Bäcker", "category": "Berufe"},
    {"id": str(uuid.uuid4()), "text": "Tierarzt", "category": "Berufe"},
    {"id": str(uuid.uuid4()), "text": "Taucher", "category": "Berufe"},
    {"id": str(uuid.uuid4()), "text": "Archäologe", "category": "Berufe"},
    {"id": str(uuid.uuid4()), "text": "Zahnarzt", "category": "Berufe"},
    {"id": str(uuid.uuid4()), "text": "Schauspieler", "category": "Berufe"},
    {"id": str(uuid.uuid4()), "text": "Dirigent", "category": "Berufe"},
    {"id": str(uuid.uuid4()), "text": "Imker", "category": "Berufe"},
    {"id": str(uuid.uuid4()), "text": "Mechaniker", "category": "Berufe"},
    {"id": str(uuid.uuid4()), "text": "Schmied", "category": "Berufe"},
    {"id": str(uuid.uuid4()), "text": "Matrose", "category": "Berufe"},
    {"id": str(uuid.uuid4()), "text": "Taxifahrer", "category": "Berufe"},
    {"id": str(uuid.uuid4()), "text": "Gärtner", "category": "Berufe"},
    {"id": str(uuid.uuid4()), "text": "Koch", "category": "Berufe"},
    {"id": str(uuid.uuid4()), "text": "Bibliothekar", "category": "Berufe"},
    # --- Sport (20) ---
    {"id": str(uuid.uuid4()), "text": "Fußball", "category": "Sport"},
    {"id": str(uuid.uuid4()), "text": "Tennis", "category": "Sport"},
    {"id": str(uuid.uuid4()), "text": "Basketball", "category": "Sport"},
    {"id": str(uuid.uuid4()), "text": "Eishockey", "category": "Sport"},
    {"id": str(uuid.uuid4()), "text": "Bogenschießen", "category": "Sport"},
    {"id": str(uuid.uuid4()), "text": "Surfen", "category": "Sport"},
    {"id": str(uuid.uuid4()), "text": "Fechten", "category": "Sport"},
    {"id": str(uuid.uuid4()), "text": "Boxen", "category": "Sport"},
    {"id": str(uuid.uuid4()), "text": "Rugby", "category": "Sport"},
    {"id": str(uuid.uuid4()), "text": "Volleyball", "category": "Sport"},
    {"id": str(uuid.uuid4()), "text": "Tischtennis", "category": "Sport"},
    {"id": str(uuid.uuid4()), "text": "Handball", "category": "Sport"},
    {"id": str(uuid.uuid4()), "text": "Kricket", "category": "Sport"},
    {"id": str(uuid.uuid4()), "text": "Wasserball", "category": "Sport"},
    {"id": str(uuid.uuid4()), "text": "Badminton", "category": "Sport"},
    {"id": str(uuid.uuid4()), "text": "Turnen", "category": "Sport"},
    {"id": str(uuid.uuid4()), "text": "Ringen", "category": "Sport"},
    {"id": str(uuid.uuid4()), "text": "Polo", "category": "Sport"},
    {"id": str(uuid.uuid4()), "text": "Curling", "category": "Sport"},
    {"id": str(uuid.uuid4()), "text": "Biathlon", "category": "Sport"},
    # --- Filme & Serien (20) ---
    {"id": str(uuid.uuid4()), "text": "Titanic", "category": "Filme & Serien"},
    {"id": str(uuid.uuid4()), "text": "Matrix", "category": "Filme & Serien"},
    {"id": str(uuid.uuid4()), "text": "Jurassic Park", "category": "Filme & Serien"},
    {"id": str(uuid.uuid4()), "text": "Harry Potter", "category": "Filme & Serien"},
    {"id": str(uuid.uuid4()), "text": "Herr der Ringe", "category": "Filme & Serien"},
    {"id": str(uuid.uuid4()), "text": "Star Wars", "category": "Filme & Serien"},
    {"id": str(uuid.uuid4()), "text": "Breaking Bad", "category": "Filme & Serien"},
    {"id": str(uuid.uuid4()), "text": "Inception", "category": "Filme & Serien"},
    {"id": str(uuid.uuid4()), "text": "Shrek", "category": "Filme & Serien"},
    {"id": str(uuid.uuid4()), "text": "Ghostbusters", "category": "Filme & Serien"},
    {"id": str(uuid.uuid4()), "text": "Forrest Gump", "category": "Filme & Serien"},
    {"id": str(uuid.uuid4()), "text": "Fluch der Karibik", "category": "Filme & Serien"},
    {"id": str(uuid.uuid4()), "text": "Zurück in die Zukunft", "category": "Filme & Serien"},
    {"id": str(uuid.uuid4()), "text": "Die Simpsons", "category": "Filme & Serien"},
    {"id": str(uuid.uuid4()), "text": "Stranger Things", "category": "Filme & Serien"},
    {"id": str(uuid.uuid4()), "text": "Game of Thrones", "category": "Filme & Serien"},
    {"id": str(uuid.uuid4()), "text": "Findet Nemo", "category": "Filme & Serien"},
    {"id": str(uuid.uuid4()), "text": "Der Pate", "category": "Filme & Serien"},
    {"id": str(uuid.uuid4()), "text": "Avatar", "category": "Filme & Serien"},
    {"id": str(uuid.uuid4()), "text": "Pulp Fiction", "category": "Filme & Serien"},
    # --- Länder & Städte (25) ---
    {"id": str(uuid.uuid4()), "text": "Japan", "category": "Länder & Städte"},
    {"id": str(uuid.uuid4()), "text": "Brasilien", "category": "Länder & Städte"},
    {"id": str(uuid.uuid4()), "text": "Ägypten", "category": "Länder & Städte"},
    {"id": str(uuid.uuid4()), "text": "Australien", "category": "Länder & Städte"},
    {"id": str(uuid.uuid4()), "text": "Norwegen", "category": "Länder & Städte"},
    {"id": str(uuid.uuid4()), "text": "Mexiko", "category": "Länder & Städte"},
    {"id": str(uuid.uuid4()), "text": "Island", "category": "Länder & Städte"},
    {"id": str(uuid.uuid4()), "text": "Kanada", "category": "Länder & Städte"},
    {"id": str(uuid.uuid4()), "text": "Indien", "category": "Länder & Städte"},
    {"id": str(uuid.uuid4()), "text": "Südafrika", "category": "Länder & Städte"},
    {"id": str(uuid.uuid4()), "text": "Paris", "category": "Länder & Städte"},
    {"id": str(uuid.uuid4()), "text": "New York", "category": "Länder & Städte"},
    {"id": str(uuid.uuid4()), "text": "Tokio", "category": "Länder & Städte"},
    {"id": str(uuid.uuid4()), "text": "Istanbul", "category": "Länder & Städte"},
    {"id": str(uuid.uuid4()), "text": "Rom", "category": "Länder & Städte"},
    {"id": str(uuid.uuid4()), "text": "Bangkok", "category": "Länder & Städte"},
    {"id": str(uuid.uuid4()), "text": "Dubai", "category": "Länder & Städte"},
    {"id": str(uuid.uuid4()), "text": "London", "category": "Länder & Städte"},
    {"id": str(uuid.uuid4()), "text": "Wien", "category": "Länder & Städte"},
    {"id": str(uuid.uuid4()), "text": "Kapstadt", "category": "Länder & Städte"},
    {"id": str(uuid.uuid4()), "text": "Venedig", "category": "Länder & Städte"},
    {"id": str(uuid.uuid4()), "text": "Marrakesch", "category": "Länder & Städte"},
    {"id": str(uuid.uuid4()), "text": "Buenos Aires", "category": "Länder & Städte"},
    {"id": str(uuid.uuid4()), "text": "Lissabon", "category": "Länder & Städte"},
    {"id": str(uuid.uuid4()), "text": "Havanna", "category": "Länder & Städte"},
    # --- Musik (20) ---
    {"id": str(uuid.uuid4()), "text": "Gitarre", "category": "Musik"},
    {"id": str(uuid.uuid4()), "text": "Schlagzeug", "category": "Musik"},
    {"id": str(uuid.uuid4()), "text": "Klavier", "category": "Musik"},
    {"id": str(uuid.uuid4()), "text": "Geige", "category": "Musik"},
    {"id": str(uuid.uuid4()), "text": "Saxophon", "category": "Musik"},
    {"id": str(uuid.uuid4()), "text": "Trompete", "category": "Musik"},
    {"id": str(uuid.uuid4()), "text": "Harfe", "category": "Musik"},
    {"id": str(uuid.uuid4()), "text": "Akkordeon", "category": "Musik"},
    {"id": str(uuid.uuid4()), "text": "Querflöte", "category": "Musik"},
    {"id": str(uuid.uuid4()), "text": "Ukulele", "category": "Musik"},
    {"id": str(uuid.uuid4()), "text": "Rockkonzert", "category": "Musik"},
    {"id": str(uuid.uuid4()), "text": "Oper", "category": "Musik"},
    {"id": str(uuid.uuid4()), "text": "Festival", "category": "Musik"},
    {"id": str(uuid.uuid4()), "text": "Disco", "category": "Musik"},
    {"id": str(uuid.uuid4()), "text": "Chor", "category": "Musik"},
    {"id": str(uuid.uuid4()), "text": "DJ", "category": "Musik"},
    {"id": str(uuid.uuid4()), "text": "Beatbox", "category": "Musik"},
    {"id": str(uuid.uuid4()), "text": "Karaokebar", "category": "Musik"},
    {"id": str(uuid.uuid4()), "text": "Trommel", "category": "Musik"},
    {"id": str(uuid.uuid4()), "text": "Dudelsack", "category": "Musik"},
]


class ImposterService:
    """Business logic for the Imposter game."""

    def _default_description(self, word: dict) -> str:
        """Build a short bundled-word description for the info bubble."""
        category = word["category"]
        text = word["text"]

        category_templates = {
            "Tiere": f"A bundled animal prompt centred on '{text}', useful for everyday guessing rounds.",
            "Essen": f"A bundled food prompt about '{text}', chosen for quick and familiar party play.",
            "Orte": f"A bundled location prompt featuring '{text}', designed for easy discussion clues.",
            "Aktivitäten": f"A bundled activity prompt about '{text}', intended for expressive clue-giving.",
            "Gegenstände": f"A bundled object prompt focused on '{text}', simple enough for local party rounds.",
            "Berufe": f"A bundled profession prompt featuring '{text}', selected for broad recognisability.",
            "Sport": f"A bundled sports prompt about '{text}', intended for fast and playful hints.",
            "Filme & Serien": f"A bundled film or TV prompt built around '{text}', suitable for pop-culture rounds.",
            "Länder & Städte": f"A bundled geography prompt featuring '{text}', meant for familiar associations.",
            "Musik": f"A bundled music prompt about '{text}', chosen for accessible clue-based play.",
        }

        return category_templates.get(
            category,
            f"A bundled prompt about '{text}' from the '{category}' category.",
        )

    def _normalize_word(self, word: dict) -> dict:
        """Return a word payload with stable metadata fields."""
        return {
            "id": word["id"],
            "text": word["text"],
            "category": word["category"],
            "source": word.get("source", "BUNDLED"),
            "uploaded_by": word.get("uploaded_by", "PlayBox seed list"),
            "description": word.get("description") or self._default_description(word),
        }

    def get_words(self, category: str | None = None) -> list[dict]:
        """Return words, optionally filtered by category."""
        if category:
            return [
                self._normalize_word(w)
                for w in _WORDS
                if w["category"].lower() == category.lower()
            ]
        return [self._normalize_word(word) for word in _WORDS]

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
            "word_details": WordOut(**word),
            "imposter_index": imposter_index,
            "timer_seconds": timer_seconds,
        }
        _sessions[session_id] = session_data

        return SessionOut(**session_data)

    def reveal_player(self, session_id: uuid.UUID, player_index: int) -> dict:
        """Reveal what a player sees — word or IMPOSTER."""
        session = _sessions.get(session_id)
        if not session:
            raise AppError(404, "Session not found", "SESSION_NOT_FOUND")

        if player_index < 0 or player_index >= len(session["player_names"]):
            raise AppError(422, "Invalid player index", "INVALID_PLAYER_INDEX")

        is_imposter = player_index == session["imposter_index"]
        return {
            "player_name": session["player_names"][player_index],
            "display": "🕵️ IMPOSTER" if is_imposter else session["word"],
        }

