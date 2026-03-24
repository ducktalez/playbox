"""Tests for the Quiz game API (uses in-memory SQLite via quiz_client fixture)."""

import uuid


# --- Category endpoints ---


def test_create_category(quiz_client) -> None:
    """POST /api/v1/quiz/categories should create a category."""
    resp = quiz_client.post(
        "/api/v1/quiz/categories",
        json={"name": "Drachenlord", "description": "Fragen rund um den Lord"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Drachenlord"
    assert data["question_count"] == 0


def test_list_categories(quiz_client) -> None:
    """GET /api/v1/quiz/categories should return created categories."""
    quiz_client.post("/api/v1/quiz/categories", json={"name": "TestCat"})
    resp = quiz_client.get("/api/v1/quiz/categories")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert any(c["name"] == "TestCat" for c in data)


# --- Player endpoints ---


def test_create_player(quiz_client) -> None:
    """POST /api/v1/quiz/players should create a player with default ELO."""
    resp = quiz_client.post("/api/v1/quiz/players", json={"name": "TestPlayer"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "TestPlayer"
    assert data["elo_score"] == 1200.0
    assert data["games_played"] == 0


def test_get_player(quiz_client) -> None:
    """GET /api/v1/quiz/players/{id} should return the player."""
    resp = quiz_client.post("/api/v1/quiz/players", json={"name": "Alice"})
    player_id = resp.json()["id"]
    resp = quiz_client.get(f"/api/v1/quiz/players/{player_id}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Alice"


def test_get_player_not_found(quiz_client) -> None:
    """GET /api/v1/quiz/players/{id} should return 404 for unknown player."""
    resp = quiz_client.get(f"/api/v1/quiz/players/{uuid.uuid4()}")
    assert resp.status_code == 404


# --- Question endpoints ---


def _create_question_payload(category_id: str | None = None) -> dict:
    """Helper: build a valid question creation payload."""
    payload: dict = {
        "text": "Wie heißt der Drachenlord mit bürgerlichem Namen?",
        "answers": [
            {"text": "Rainer Winkler", "is_correct": True},
            {"text": "Max Mustermann", "is_correct": False},
            {"text": "Hans Meier", "is_correct": False},
        ],
        "tags": ["drachenlord", "basics"],
    }
    if category_id:
        payload["category_id"] = category_id
    return payload


def test_create_question(quiz_client) -> None:
    """POST /api/v1/quiz/questions should create a question with answers."""
    resp = quiz_client.post("/api/v1/quiz/questions", json=_create_question_payload())
    assert resp.status_code == 200
    data = resp.json()
    assert data["text"].startswith("Wie heißt")
    assert len(data["answers"]) == 3
    assert data["elo_score"] == 1200.0


def test_create_question_needs_exactly_one_correct(quiz_client) -> None:
    """Should reject questions with zero or multiple correct answers."""
    # Zero correct
    payload = {
        "text": "Bad question",
        "answers": [
            {"text": "A", "is_correct": False},
            {"text": "B", "is_correct": False},
        ],
    }
    resp = quiz_client.post("/api/v1/quiz/questions", json=payload)
    assert resp.status_code == 422

    # Two correct
    payload["answers"] = [
        {"text": "A", "is_correct": True},
        {"text": "B", "is_correct": True},
    ]
    resp = quiz_client.post("/api/v1/quiz/questions", json=payload)
    assert resp.status_code == 422


def test_get_question(quiz_client) -> None:
    """GET /api/v1/quiz/questions/{id} should return a random answer subset."""
    create_resp = quiz_client.post("/api/v1/quiz/questions", json=_create_question_payload())
    qid = create_resp.json()["id"]
    resp = quiz_client.get(f"/api/v1/quiz/questions/{qid}?num_answers=3")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["answers"]) == 3
    # is_correct should be hidden during gameplay
    assert all(a.get("is_correct") is None for a in data["answers"])


def test_get_question_not_found(quiz_client) -> None:
    """GET /api/v1/quiz/questions/{id} should return 404 for unknown question."""
    resp = quiz_client.get(f"/api/v1/quiz/questions/{uuid.uuid4()}")
    assert resp.status_code == 404


def test_list_questions(quiz_client) -> None:
    """GET /api/v1/quiz/questions should return paginated list."""
    quiz_client.post("/api/v1/quiz/questions", json=_create_question_payload())
    resp = quiz_client.get("/api/v1/quiz/questions")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert len(data["items"]) >= 1


def test_list_questions_balances_categories(quiz_client) -> None:
    """Balanced question listing should not let one large category crowd out the others."""
    cat_a = quiz_client.post("/api/v1/quiz/categories", json={"name": "Cat A"}).json()["id"]
    cat_b = quiz_client.post("/api/v1/quiz/categories", json={"name": "Cat B"}).json()["id"]

    for index in range(4):
        payload = _create_question_payload(category_id=cat_a)
        payload["text"] = f"Category A Question {index}"
        payload["tags"] = [f"cat-a-{index}"]
        quiz_client.post("/api/v1/quiz/questions", json=payload)

    payload = _create_question_payload(category_id=cat_b)
    payload["text"] = "Category B Question"
    payload["tags"] = ["cat-b"]
    quiz_client.post("/api/v1/quiz/questions", json=payload)

    resp = quiz_client.get("/api/v1/quiz/questions?balanced_categories=true&limit=2")
    assert resp.status_code == 200
    data = resp.json()
    categories = [item["category"] for item in data["items"]]
    assert len(categories) == 2
    assert set(categories) == {"Cat A", "Cat B"}


# --- Tags ---


def test_list_tags(quiz_client) -> None:
    """GET /api/v1/quiz/tags should return tags created with questions."""
    quiz_client.post("/api/v1/quiz/questions", json=_create_question_payload())
    resp = quiz_client.get("/api/v1/quiz/tags")
    assert resp.status_code == 200
    data = resp.json()
    tag_names = [t["name"] for t in data]
    assert "drachenlord" in tag_names
    assert "basics" in tag_names


# --- Attempt / ELO ---


def test_submit_attempt_correct(quiz_client) -> None:
    """POST attempt with correct answer should increase player ELO."""
    # Create player
    player_resp = quiz_client.post("/api/v1/quiz/players", json={"name": "Quizzer"})
    player_id = player_resp.json()["id"]

    # Create session
    sess_resp = quiz_client.post(
        "/api/v1/quiz/sessions",
        json={"mode": "millionaire", "player_id": player_id},
    )
    session_id = sess_resp.json()["id"]

    # Create question
    q_resp = quiz_client.post("/api/v1/quiz/questions", json=_create_question_payload())
    q_data = q_resp.json()
    qid = q_data["id"]
    correct_answer_id = next(a["id"] for a in q_data["answers"] if a["is_correct"])

    # Submit correct attempt
    resp = quiz_client.post(
        f"/api/v1/quiz/questions/{qid}/attempt",
        json={"answer_id": correct_answer_id, "player_id": player_id, "session_id": session_id},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["correct"] is True
    assert data["player_elo_after"] > data["player_elo_before"]
    assert data["question_elo_after"] < data["question_elo_before"]


def test_submit_attempt_wrong(quiz_client) -> None:
    """POST attempt with wrong answer should decrease player ELO."""
    player_resp = quiz_client.post("/api/v1/quiz/players", json={"name": "Noob"})
    player_id = player_resp.json()["id"]

    sess_resp = quiz_client.post(
        "/api/v1/quiz/sessions",
        json={"mode": "millionaire", "player_id": player_id},
    )
    session_id = sess_resp.json()["id"]

    q_resp = quiz_client.post("/api/v1/quiz/questions", json=_create_question_payload())
    q_data = q_resp.json()
    qid = q_data["id"]
    wrong_answer_id = next(a["id"] for a in q_data["answers"] if not a["is_correct"])

    resp = quiz_client.post(
        f"/api/v1/quiz/questions/{qid}/attempt",
        json={"answer_id": wrong_answer_id, "player_id": player_id, "session_id": session_id},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["correct"] is False
    assert data["player_elo_after"] < data["player_elo_before"]
    assert data["question_elo_after"] > data["question_elo_before"]


def test_submit_attempt_invalid_answer(quiz_client) -> None:
    """POST attempt with answer from another question should return 422."""
    player_resp = quiz_client.post("/api/v1/quiz/players", json={"name": "Hacker"})
    player_id = player_resp.json()["id"]

    sess_resp = quiz_client.post(
        "/api/v1/quiz/sessions",
        json={"mode": "millionaire", "player_id": player_id},
    )
    session_id = sess_resp.json()["id"]

    q_resp = quiz_client.post("/api/v1/quiz/questions", json=_create_question_payload())
    qid = q_resp.json()["id"]

    resp = quiz_client.post(
        f"/api/v1/quiz/questions/{qid}/attempt",
        json={"answer_id": str(uuid.uuid4()), "player_id": player_id, "session_id": session_id},
    )
    assert resp.status_code == 422


# --- Sessions ---


def test_create_session(quiz_client) -> None:
    """POST /api/v1/quiz/sessions should create a session and increment games_played."""
    player_resp = quiz_client.post("/api/v1/quiz/players", json={"name": "SessionTester"})
    player_id = player_resp.json()["id"]

    resp = quiz_client.post(
        "/api/v1/quiz/sessions",
        json={"mode": "millionaire", "player_id": player_id},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] == "millionaire"
    assert data["score"] == 0

    # Check games_played incremented
    p = quiz_client.get(f"/api/v1/quiz/players/{player_id}").json()
    assert p["games_played"] == 1


def test_get_session(quiz_client) -> None:
    """GET /api/v1/quiz/sessions/{id} should return the session."""
    player_resp = quiz_client.post("/api/v1/quiz/players", json={"name": "Getter"})
    player_id = player_resp.json()["id"]
    sess_resp = quiz_client.post(
        "/api/v1/quiz/sessions",
        json={"mode": "duel", "player_id": player_id},
    )
    sid = sess_resp.json()["id"]
    resp = quiz_client.get(f"/api/v1/quiz/sessions/{sid}")
    assert resp.status_code == 200
    assert resp.json()["mode"] == "duel"


def test_finish_session(quiz_client) -> None:
    """POST /api/v1/quiz/sessions/{id}/finish should set finished_at and final score."""
    player_resp = quiz_client.post("/api/v1/quiz/players", json={"name": "Finisher"})
    player_id = player_resp.json()["id"]
    sess_resp = quiz_client.post(
        "/api/v1/quiz/sessions",
        json={"mode": "millionaire", "player_id": player_id},
    )
    session_id = sess_resp.json()["id"]

    q_resp = quiz_client.post("/api/v1/quiz/questions", json=_create_question_payload())
    q_data = q_resp.json()
    qid = q_data["id"]
    correct_answer_id = next(a["id"] for a in q_data["answers"] if a["is_correct"])

    quiz_client.post(
        f"/api/v1/quiz/questions/{qid}/attempt",
        json={"answer_id": correct_answer_id, "player_id": player_id, "session_id": session_id},
    )

    resp = quiz_client.post(f"/api/v1/quiz/sessions/{session_id}/finish")
    assert resp.status_code == 200
    data = resp.json()
    assert data["score"] == 1
    assert data["finished_at"] is not None


def test_finish_session_is_idempotent(quiz_client) -> None:
    """Finishing the same session twice should keep the same finished_at timestamp."""
    player_resp = quiz_client.post("/api/v1/quiz/players", json={"name": "Again"})
    player_id = player_resp.json()["id"]
    sess_resp = quiz_client.post(
        "/api/v1/quiz/sessions",
        json={"mode": "duel", "player_id": player_id},
    )
    session_id = sess_resp.json()["id"]

    first = quiz_client.post(f"/api/v1/quiz/sessions/{session_id}/finish")
    second = quiz_client.post(f"/api/v1/quiz/sessions/{session_id}/finish")
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["finished_at"] == second.json()["finished_at"]


def test_finish_session_not_found(quiz_client) -> None:
    """POST /api/v1/quiz/sessions/{id}/finish should return 404 for unknown session."""
    resp = quiz_client.post(f"/api/v1/quiz/sessions/{uuid.uuid4()}/finish")
    assert resp.status_code == 404


def test_get_session_not_found(quiz_client) -> None:
    """GET /api/v1/quiz/sessions/{id} should return 404 for unknown session."""
    resp = quiz_client.get(f"/api/v1/quiz/sessions/{uuid.uuid4()}")
    assert resp.status_code == 404


def test_create_session_invalid_mode(quiz_client) -> None:
    """POST session with invalid mode should return 422."""
    player_resp = quiz_client.post("/api/v1/quiz/players", json={"name": "BadMode"})
    player_id = player_resp.json()["id"]
    resp = quiz_client.post(
        "/api/v1/quiz/sessions",
        json={"mode": "invalid", "player_id": player_id},
    )
    assert resp.status_code == 422


# --- Leaderboard ---


def test_leaderboard(quiz_client) -> None:
    """GET /api/v1/quiz/leaderboard should return ranked players."""
    quiz_client.post("/api/v1/quiz/players", json={"name": "Player1"})
    quiz_client.post("/api/v1/quiz/players", json={"name": "Player2"})
    resp = quiz_client.get("/api/v1/quiz/leaderboard")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 2
    # Ranks should be sequential
    for i, entry in enumerate(data):
        assert entry["rank"] == i + 1


# --- Health check ---


def test_health(client) -> None:
    """GET /health should return ok."""
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


