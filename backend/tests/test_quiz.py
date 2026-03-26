"""Tests for the Quiz game API (uses in-memory SQLite via quiz_client fixture)."""

import uuid
from pathlib import Path

from sqlalchemy import select

from app.games.quiz.models import Category, Question, Tag
from app.games.quiz.seed import QuizSeedFile, load_seed_file, seed_quiz_dataset


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
    """GET /api/v1/quiz/players/{id} should return 404 with error code."""
    resp = quiz_client.get(f"/api/v1/quiz/players/{uuid.uuid4()}")
    assert resp.status_code == 404
    data = resp.json()
    assert "detail" in data
    assert data["code"] == "PLAYER_NOT_FOUND"


# --- Question endpoints ---


def _create_question_payload(category_id: str | None = None, note: str | None = None) -> dict:
    """Helper: build a valid question creation payload."""
    payload: dict = {
        "text": "Wie heißt der Drachenlord mit bürgerlichem Namen?",
        "answers": [
            {"text": "Rainer Winkler", "is_correct": True},
            {"text": "Max Mustermann", "is_correct": False},
            {"text": "Hans Meier", "is_correct": False},
            {"text": "Otto Normalverbraucher", "is_correct": False},
        ],
        "tags": ["drachenlord", "basics"],
    }
    if category_id:
        payload["category_id"] = category_id
    if note:
        payload["note"] = note
    return payload


def _create_question_and_get_displayed(quiz_client) -> tuple[str, list[str]]:
    """Helper: create a question and fetch it with 4 displayed answers, return (qid, answer_ids)."""
    q_resp = quiz_client.post("/api/v1/quiz/questions", json=_create_question_payload())
    qid = q_resp.json()["id"]
    get_resp = quiz_client.get(f"/api/v1/quiz/questions/{qid}?num_answers=4")
    answer_ids = [a["id"] for a in get_resp.json()["answers"]]
    return qid, answer_ids


def test_create_question(quiz_client) -> None:
    """POST /api/v1/quiz/questions should create a question with answers."""
    resp = quiz_client.post("/api/v1/quiz/questions", json=_create_question_payload())
    assert resp.status_code == 200
    data = resp.json()
    assert data["text"].startswith("Wie heißt")
    assert len(data["answers"]) == 4
    assert data["elo_score"] == 1200.0


def test_create_question_needs_at_least_one_correct(quiz_client) -> None:
    """Should reject questions with zero correct answers."""
    # Zero correct — rejected
    payload = {
        "text": "Bad question",
        "answers": [
            {"text": "A", "is_correct": False},
            {"text": "B", "is_correct": False},
        ],
    }
    resp = quiz_client.post("/api/v1/quiz/questions", json=payload)
    assert resp.status_code == 422

    # Two correct — now allowed (multiple correct answers supported in data model)
    payload["answers"] = [
        {"text": "A", "is_correct": True},
        {"text": "B", "is_correct": True},
    ]
    resp = quiz_client.post("/api/v1/quiz/questions", json=payload)
    assert resp.status_code == 200


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
    """GET /api/v1/quiz/questions/{id} should return 404 with error code."""
    resp = quiz_client.get(f"/api/v1/quiz/questions/{uuid.uuid4()}")
    assert resp.status_code == 404
    data = resp.json()
    assert data["code"] == "QUESTION_NOT_FOUND"


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


def test_list_questions_order_by_elo_asc(quiz_client) -> None:
    """GET /api/v1/quiz/questions?order_by_elo=asc should return questions sorted by ascending ELO."""
    # Create questions with different ELO scores (by submitting attempts to change ELOs)
    player_resp = quiz_client.post("/api/v1/quiz/players", json={"name": "Sorter"})
    player_id = player_resp.json()["id"]

    q_ids = []
    for i in range(3):
        payload = _create_question_payload()
        payload["text"] = f"ELO Sort Question {i}"
        payload["tags"] = [f"elo-sort-{i}"]
        resp = quiz_client.post("/api/v1/quiz/questions", json=payload)
        q_ids.append(resp.json()["id"])

    # Submit a correct attempt on the first question to lower its ELO
    get_resp = quiz_client.get(f"/api/v1/quiz/questions/{q_ids[0]}?num_answers=4")
    answers = get_resp.json()["answers"]
    # We need the correct answer, so create a session and attempt
    session = quiz_client.post(
        "/api/v1/quiz/sessions", json={"mode": "speed", "player_id": player_id}
    ).json()

    # Just submit with the first answer (may or may not be correct, but changes ELO)
    quiz_client.post(
        f"/api/v1/quiz/questions/{q_ids[0]}/attempt",
        json={"answer_id": answers[0]["id"], "player_id": player_id, "session_id": session["id"]},
    )

    # Request with ascending ELO ordering
    resp = quiz_client.get("/api/v1/quiz/questions?order_by_elo=asc&limit=10")
    assert resp.status_code == 200
    items = resp.json()["items"]
    elo_scores = [item["elo_score"] for item in items]
    assert elo_scores == sorted(elo_scores), "Questions should be sorted by ascending ELO"


def test_list_questions_order_by_elo_desc(quiz_client) -> None:
    """GET /api/v1/quiz/questions?order_by_elo=desc should return questions sorted by descending ELO."""
    for i in range(3):
        payload = _create_question_payload()
        payload["text"] = f"Desc Sort Question {i}"
        payload["tags"] = [f"desc-sort-{i}"]
        quiz_client.post("/api/v1/quiz/questions", json=payload)

    resp = quiz_client.get("/api/v1/quiz/questions?order_by_elo=desc&limit=10")
    assert resp.status_code == 200
    items = resp.json()["items"]
    elo_scores = [item["elo_score"] for item in items]
    assert elo_scores == sorted(elo_scores, reverse=True), "Questions should be sorted by descending ELO"


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
    assert resp.json()["code"] == "INVALID_ANSWER"


# --- note ---


def test_create_question_with_note(quiz_client) -> None:
    """POST /api/v1/quiz/questions with note should store it."""
    payload = _create_question_payload(note="Rainer Winkler ist der bürgerliche Name des Drachenlords.")
    resp = quiz_client.post("/api/v1/quiz/questions", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["note"] == "Rainer Winkler ist der bürgerliche Name des Drachenlords."


def test_create_question_without_note(quiz_client) -> None:
    """POST /api/v1/quiz/questions without note should default to None."""
    resp = quiz_client.post("/api/v1/quiz/questions", json=_create_question_payload())
    assert resp.status_code == 200
    assert resp.json()["note"] is None


def test_get_question_hides_note(quiz_client) -> None:
    """GET /api/v1/quiz/questions/{id} should hide note during gameplay."""
    payload = _create_question_payload(note="This should be hidden.")
    create_resp = quiz_client.post("/api/v1/quiz/questions", json=payload)
    qid = create_resp.json()["id"]
    resp = quiz_client.get(f"/api/v1/quiz/questions/{qid}")
    assert resp.status_code == 200
    assert resp.json()["note"] is None


def test_submit_attempt_returns_note(quiz_client) -> None:
    """POST attempt should include the question note in the response."""
    player_resp = quiz_client.post("/api/v1/quiz/players", json={"name": "NoteTester"})
    player_id = player_resp.json()["id"]
    sess_resp = quiz_client.post(
        "/api/v1/quiz/sessions",
        json={"mode": "speed", "player_id": player_id},
    )
    session_id = sess_resp.json()["id"]

    payload = _create_question_payload(note="Das ist die Anmerkung.")
    q_resp = quiz_client.post("/api/v1/quiz/questions", json=payload)
    q_data = q_resp.json()
    qid = q_data["id"]
    correct_answer_id = next(a["id"] for a in q_data["answers"] if a["is_correct"])

    resp = quiz_client.post(
        f"/api/v1/quiz/questions/{qid}/attempt",
        json={"answer_id": correct_answer_id, "player_id": player_id, "session_id": session_id},
    )
    assert resp.status_code == 200
    assert resp.json()["note"] == "Das ist die Anmerkung."


def test_submit_attempt_returns_null_note_when_absent(quiz_client) -> None:
    """POST attempt without question note should return null."""
    player_resp = quiz_client.post("/api/v1/quiz/players", json={"name": "NoNote"})
    player_id = player_resp.json()["id"]
    sess_resp = quiz_client.post(
        "/api/v1/quiz/sessions",
        json={"mode": "speed", "player_id": player_id},
    )
    session_id = sess_resp.json()["id"]

    q_resp = quiz_client.post("/api/v1/quiz/questions", json=_create_question_payload())
    q_data = q_resp.json()
    qid = q_data["id"]
    correct_answer_id = next(a["id"] for a in q_data["answers"] if a["is_correct"])

    resp = quiz_client.post(
        f"/api/v1/quiz/questions/{qid}/attempt",
        json={"answer_id": correct_answer_id, "player_id": player_id, "session_id": session_id},
    )
    assert resp.status_code == 200
    assert resp.json()["note"] is None


# --- Jokers ---


def test_fifty_fifty_returns_two_wrong_answers(quiz_client) -> None:
    """POST fifty-fifty should return 2 wrong answer IDs from the displayed set."""
    qid, answer_ids = _create_question_and_get_displayed(quiz_client)
    resp = quiz_client.post(
        f"/api/v1/quiz/questions/{qid}/fifty-fifty",
        json={"displayed_answer_ids": answer_ids},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["remove"]) == 2
    # All removed IDs should be from the displayed set
    assert all(rid in answer_ids for rid in data["remove"])


def test_fifty_fifty_not_found(quiz_client) -> None:
    """POST fifty-fifty for unknown question should return 404 with error code."""
    resp = quiz_client.post(
        f"/api/v1/quiz/questions/{uuid.uuid4()}/fifty-fifty",
        json={"displayed_answer_ids": [str(uuid.uuid4())] * 4},
    )
    assert resp.status_code == 404
    assert resp.json()["code"] == "QUESTION_NOT_FOUND"


def test_audience_poll_returns_percentages(quiz_client) -> None:
    """POST audience-poll should return percentages summing to ~100."""
    qid, answer_ids = _create_question_and_get_displayed(quiz_client)
    resp = quiz_client.post(
        f"/api/v1/quiz/questions/{qid}/audience-poll",
        json={"displayed_answer_ids": answer_ids},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["results"]) == len(answer_ids)
    total = sum(r["percentage"] for r in data["results"])
    assert total == 100


def test_audience_poll_not_found(quiz_client) -> None:
    """POST audience-poll for unknown question should return 404 with error code."""
    resp = quiz_client.post(
        f"/api/v1/quiz/questions/{uuid.uuid4()}/audience-poll",
        json={"displayed_answer_ids": [str(uuid.uuid4())] * 4},
    )
    assert resp.status_code == 404
    assert resp.json()["code"] == "QUESTION_NOT_FOUND"


def test_phone_joker_returns_hint(quiz_client) -> None:
    """POST phone-joker should return a hint with confidence and message."""
    qid, answer_ids = _create_question_and_get_displayed(quiz_client)
    resp = quiz_client.post(
        f"/api/v1/quiz/questions/{qid}/phone-joker",
        json={"displayed_answer_ids": answer_ids},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["hint_answer_id"] in answer_ids
    assert 0 <= data["confidence"] <= 100
    assert len(data["message"]) > 0


def test_phone_joker_not_found(quiz_client) -> None:
    """POST phone-joker for unknown question should return 404 with error code."""
    resp = quiz_client.post(
        f"/api/v1/quiz/questions/{uuid.uuid4()}/phone-joker",
        json={"displayed_answer_ids": [str(uuid.uuid4())] * 4},
    )
    assert resp.status_code == 404
    assert resp.json()["code"] == "QUESTION_NOT_FOUND"


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
    """POST /api/v1/quiz/sessions/{id}/finish should return 404 with error code."""
    resp = quiz_client.post(f"/api/v1/quiz/sessions/{uuid.uuid4()}/finish")
    assert resp.status_code == 404
    assert resp.json()["code"] == "SESSION_NOT_FOUND"


def test_get_session_not_found(quiz_client) -> None:
    """GET /api/v1/quiz/sessions/{id} should return 404 with error code."""
    resp = quiz_client.get(f"/api/v1/quiz/sessions/{uuid.uuid4()}")
    assert resp.status_code == 404
    assert resp.json()["code"] == "SESSION_NOT_FOUND"


def test_create_session_millionaire_mode(quiz_client) -> None:
    """POST session with mode 'millionaire' should work."""
    player_resp = quiz_client.post("/api/v1/quiz/players", json={"name": "Millionär Player"})
    player_id = player_resp.json()["id"]
    resp = quiz_client.post(
        "/api/v1/quiz/sessions",
        json={"mode": "millionaire", "player_id": player_id},
    )
    assert resp.status_code == 200
    assert resp.json()["mode"] == "millionaire"


def test_create_session_duel_mode(quiz_client) -> None:
    """POST session with mode 'duel' (1v1) should work."""
    player_resp = quiz_client.post("/api/v1/quiz/players", json={"name": "Duel Player"})
    player_id = player_resp.json()["id"]
    resp = quiz_client.post(
        "/api/v1/quiz/sessions",
        json={"mode": "duel", "player_id": player_id},
    )
    assert resp.status_code == 200
    assert resp.json()["mode"] == "duel"


def test_create_session_speed_mode(quiz_client) -> None:
    """POST session with mode 'speed' (20-second timer) should work."""
    player_resp = quiz_client.post("/api/v1/quiz/players", json={"name": "Speed Player"})
    player_id = player_resp.json()["id"]
    resp = quiz_client.post(
        "/api/v1/quiz/sessions",
        json={"mode": "speed", "player_id": player_id},
    )
    assert resp.status_code == 200
    assert resp.json()["mode"] == "speed"


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


# --- Seed import ---


def _build_seed_dataset() -> QuizSeedFile:
    """Helper: build a small validated quiz seed dataset."""
    return QuizSeedFile(
        categories=[
            {"name": "Starter", "description": "Starter questions for tests."},
            {"name": "Bonus", "description": "Additional category for tests."},
        ],
        questions=[
            {
                "text": "What does PWA stand for?",
                "category": "Starter",
                "tier": 1,
                "tags": ["starter", "frontend"],
                "created_at": "",
                "answers": ["Progressive Web App", ["Portable Web API", "Primary Window Application"]],
            },
            {
                "text": "Which game currently uses PostgreSQL in PlayBox?",
                "category": "Bonus",
                "tier": 1,
                "tags": ["starter", "database"],
                "created_at": "",
                "answers": ["Quiz", ["Imposter", "Piccolo"]],
            },
        ],
    )


def test_load_seed_file_supports_yaml_compact_answers(tmp_path: Path) -> None:
    """The loader should accept YAML and normalize compact answer lists."""
    seed_file = tmp_path / "quiz_seed.yaml"
    seed_file.write_text(
        """
categories:
  - name: Starter
    description: Starter questions
questions:
  - text: Under which alias did Rainer Winkler become widely known?
    category: Starter
    tier: 1
    tags: [drachenlord, alias]
    created_by: Test seed
    created_at: ""
    answers: [Drachenlord, [Drachenmeister, Drachenkönig, Drachenritter]]
""".strip(),
        encoding="utf-8",
    )

    dataset = load_seed_file(seed_file)

    assert len(dataset.categories) == 1
    assert len(dataset.questions) == 1
    question = dataset.questions[0]
    assert question.tier == 1
    assert question.created_at == ""
    assert question.answers[0].text == "Drachenlord"
    assert question.answers[0].is_correct is True
    assert [answer.text for answer in question.answers[1:]] == [
        "Drachenmeister",
        "Drachenkönig",
        "Drachenritter",
    ]
    assert all(answer.is_correct is False for answer in question.answers[1:])


def test_quiz_seed_file_rejects_invalid_compact_answers() -> None:
    """Compact answer lists must contain a correct answer and at least one wrong answer."""
    try:
        QuizSeedFile(
            questions=[
                {
                    "text": "Broken seed question",
                    "answers": ["Correct answer", []],
                }
            ]
        )
    except ValueError as exc:
        assert "wrong answers" in str(exc)
    else:
        raise AssertionError("Expected compact answer validation to fail.")


def test_seed_quiz_dataset_creates_categories_questions_and_tags(db_session) -> None:
    """The quiz seed importer should create categories, tags, and questions from the dataset."""
    result = seed_quiz_dataset(db=db_session, dataset=_build_seed_dataset())

    categories = db_session.execute(select(Category)).scalars().all()
    questions = db_session.execute(select(Question)).scalars().all()
    tags = db_session.execute(select(Tag)).scalars().all()

    assert result.created_categories == 2
    assert result.created_questions == 2
    assert result.created_tags == 3
    assert result.skipped_questions == 0
    assert {category.name for category in categories} == {"Starter", "Bonus"}
    assert {question.text for question in questions} == {
        "What does PWA stand for?",
        "Which game currently uses PostgreSQL in PlayBox?",
    }
    assert {tag.name for tag in tags} == {"starter", "frontend", "database"}


def test_seed_quiz_dataset_is_idempotent(db_session) -> None:
    """Running the quiz seed importer twice should skip already imported questions."""
    dataset = _build_seed_dataset()

    first = seed_quiz_dataset(db=db_session, dataset=dataset)
    second = seed_quiz_dataset(db=db_session, dataset=dataset)

    question_count = len(db_session.execute(select(Question)).scalars().all())
    category_count = len(db_session.execute(select(Category)).scalars().all())
    tag_count = len(db_session.execute(select(Tag)).scalars().all())

    assert first.created_questions == 2
    assert second.created_questions == 0
    assert second.skipped_questions == 2
    assert question_count == 2
    assert category_count == 2
    assert tag_count == 3


def test_seed_quiz_dataset_maps_tier_to_elo(db_session) -> None:
    """Seeded questions should get ELO scores based on their tier."""
    dataset = QuizSeedFile(
        categories=[{"name": "Tiered", "description": "Tier test"}],
        questions=[
            {
                "text": "Easy question?",
                "category": "Tiered",
                "tier": 1,
                "tags": ["tier-test"],
                "answers": ["Yes", ["No", "Maybe"]],
            },
            {
                "text": "Medium question?",
                "category": "Tiered",
                "tier": 2,
                "tags": ["tier-test"],
                "answers": ["Yes", ["No", "Maybe"]],
            },
            {
                "text": "Hard question?",
                "category": "Tiered",
                "tier": 3,
                "tags": ["tier-test"],
                "answers": ["Yes", ["No", "Maybe"]],
            },
        ],
    )
    seed_quiz_dataset(db=db_session, dataset=dataset)

    questions = db_session.execute(
        select(Question).order_by(Question.elo_score.asc())
    ).scalars().all()

    assert len(questions) == 3
    # All tiers now start at 1200 — ELO calibrates naturally through gameplay
    assert questions[0].elo_score == 1200.0  # tier 1
    assert questions[1].elo_score == 1200.0  # tier 2
    assert questions[2].elo_score == 1200.0  # tier 3


# --- Health check ---


def test_health(client) -> None:
    """GET /health should return ok."""
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}

