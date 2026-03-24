"""Tests for the Imposter game service."""

from app.games.imposter.service import ImposterService


def test_get_words_returns_list() -> None:
    """Should return a non-empty list of words."""
    service = ImposterService()
    words = service.get_words()
    assert len(words) > 0


def test_get_words_filter_by_category() -> None:
    """Should filter words by category."""
    service = ImposterService()
    words = service.get_words(category="Tiere")
    assert all(w["category"] == "Tiere" for w in words)


def test_get_categories() -> None:
    """Should return unique categories."""
    service = ImposterService()
    categories = service.get_categories()
    assert len(categories) > 0
    assert len(categories) == len(set(categories))


def test_create_session() -> None:
    """Should create a session with valid data."""
    service = ImposterService()
    session = service.create_session(player_names=["Alice", "Bob", "Charlie"])
    assert len(session.player_names) == 3
    assert 0 <= session.imposter_index < 3
    assert session.word != ""
    assert session.word_details.text == session.word
    assert session.word_details.source == "BUNDLED"
    assert session.word_details.description is not None
    assert session.timer_seconds == 300


def test_create_session_custom_timer() -> None:
    """Should respect custom timer."""
    service = ImposterService()
    session = service.create_session(player_names=["A", "B", "C"], timer_seconds=120)
    assert session.timer_seconds == 120


def test_create_session_category_filter_is_reflected_in_word_details() -> None:
    """Selected category should match the returned word details."""
    service = ImposterService()
    session = service.create_session(
        player_names=["Alice", "Bob", "Charlie"],
        category="Tiere",
    )
    assert session.word_details.category == "Tiere"


def test_get_words_includes_metadata() -> None:
    """Bundled words should expose metadata required by the frontend."""
    service = ImposterService()
    word = service.get_words()[0]
    assert word["source"] == "BUNDLED"
    assert word["uploaded_by"] == "PlayBox seed list"
    assert word["description"]


def test_reveal_player_word() -> None:
    """Non-imposter should see the word."""
    service = ImposterService()
    session = service.create_session(player_names=["Alice", "Bob", "Charlie"])

    for i in range(3):
        result = service.reveal_player(session_id=session.id, player_index=i)
        if i == session.imposter_index:
            assert "IMPOSTER" in result["display"]
        else:
            assert result["display"] == session.word_details.text


def test_report_word() -> None:
    """Should create a report."""
    service = ImposterService()
    words = service.get_words()
    import uuid
    report = service.report_word(word_id=uuid.UUID(words[0]["id"]), reason="test reason")
    assert report.reason == "test reason"

