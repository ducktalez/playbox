"""Tests for the Piccolo game API and service."""

from app.games.piccolo.service import PiccoloService


# --- Service-level tests ---


def test_get_categories() -> None:
    """Should return unique challenge categories."""
    service = PiccoloService()
    categories = service.get_categories()
    assert len(categories) > 0
    assert len(categories) == len(set(categories))


def test_get_challenges_all() -> None:
    """Should return all challenge templates when no filters are applied."""
    service = PiccoloService()
    challenges = service.get_challenges()
    assert len(challenges) > 0


def test_get_challenges_filter_by_category() -> None:
    """Should filter challenges by category."""
    service = PiccoloService()
    challenges = service.get_challenges(category="dare")
    assert len(challenges) > 0
    assert all(c.category == "dare" for c in challenges)


def test_get_challenges_filter_by_intensity() -> None:
    """Should filter challenges by intensity."""
    service = PiccoloService()
    challenges = service.get_challenges(intensity="mild")
    assert len(challenges) > 0
    assert all(c.intensity == "mild" for c in challenges)


def test_get_challenges_filter_combined() -> None:
    """Should filter by category AND intensity simultaneously."""
    service = PiccoloService()
    challenges = service.get_challenges(category="dare", intensity="mild")
    assert len(challenges) > 0
    assert all(c.category == "dare" and c.intensity == "mild" for c in challenges)


def test_get_challenges_no_results() -> None:
    """Should return empty list for non-existent category."""
    service = PiccoloService()
    challenges = service.get_challenges(category="nonexistent")
    assert challenges == []


def test_create_session() -> None:
    """Should create a session with valid data."""
    service = PiccoloService()
    session = service.create_session(player_names=["Alice", "Bob"])
    assert len(session.player_names) == 2
    assert session.intensity == "medium"
    assert session.total_challenges > 0


def test_create_session_with_intensity() -> None:
    """Should respect intensity setting and include lower intensities."""
    service = PiccoloService()
    mild = service.create_session(player_names=["A", "B"], intensity="mild")
    spicy = service.create_session(player_names=["A", "B"], intensity="spicy")
    assert spicy.total_challenges >= mild.total_challenges


def test_create_session_with_category_filter() -> None:
    """Should filter challenges by selected categories."""
    service = PiccoloService()
    session = service.create_session(player_names=["A", "B"], categories=["dare"])
    assert session.total_challenges > 0


def test_next_challenge() -> None:
    """Should return a valid challenge for the session."""
    service = PiccoloService()
    session = service.create_session(player_names=["Alice", "Bob", "Charlie"])
    challenge = service.next_challenge(session_id=session.id)
    assert challenge.text != ""
    assert challenge.category != "error"


def test_next_challenge_cycles() -> None:
    """Should cycle through challenges without crashing."""
    service = PiccoloService()
    session = service.create_session(player_names=["A", "B"])
    texts = set()
    for _ in range(session.total_challenges + 2):
        c = service.next_challenge(session_id=session.id)
        texts.add(c.text)
    # Should have returned at least some unique challenges
    assert len(texts) > 1


def test_next_challenge_invalid_session() -> None:
    """Should return error for unknown session."""
    import uuid

    service = PiccoloService()
    challenge = service.next_challenge(session_id=uuid.uuid4())
    assert challenge.category == "error"


def test_next_challenge_inserts_player_names() -> None:
    """Challenge text should contain actual player names, not {player} placeholders."""
    service = PiccoloService()
    session = service.create_session(player_names=["Alice", "Bob", "Charlie"])
    # Get several challenges to increase odds of getting one with player substitution
    for _ in range(10):
        c = service.next_challenge(session_id=session.id)
        assert "{player}" not in c.text
        assert "{player2}" not in c.text


# --- API-level tests ---


def test_api_get_categories(client) -> None:
    """GET /api/v1/piccolo/categories should return a list."""
    resp = client.get("/api/v1/piccolo/categories")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) > 0


def test_api_get_challenges(client) -> None:
    """GET /api/v1/piccolo/challenges should return all templates."""
    resp = client.get("/api/v1/piccolo/challenges")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert "text" in data[0]
    assert "category" in data[0]
    assert "intensity" in data[0]
    assert "target_count" in data[0]


def test_api_get_challenges_filter(client) -> None:
    """GET /api/v1/piccolo/challenges?category=dare&intensity=mild should filter."""
    resp = client.get("/api/v1/piccolo/challenges?category=dare&intensity=mild")
    assert resp.status_code == 200
    data = resp.json()
    assert all(c["category"] == "dare" and c["intensity"] == "mild" for c in data)


def test_api_create_session(client) -> None:
    """POST /api/v1/piccolo/session should create a session."""
    resp = client.post(
        "/api/v1/piccolo/session",
        json={"player_names": ["Alice", "Bob"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["player_names"] == ["Alice", "Bob"]
    assert data["total_challenges"] > 0


def test_api_next_challenge(client) -> None:
    """GET /api/v1/piccolo/session/{id}/next should return a challenge."""
    resp = client.post(
        "/api/v1/piccolo/session",
        json={"player_names": ["A", "B", "C"]},
    )
    session_id = resp.json()["id"]
    resp = client.get(f"/api/v1/piccolo/session/{session_id}/next")
    assert resp.status_code == 200
    data = resp.json()
    assert "text" in data
    assert data["category"] != "error"

