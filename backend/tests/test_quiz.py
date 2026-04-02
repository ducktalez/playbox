"""Tests for the Quiz game API (uses in-memory SQLite via quiz_client fixture)."""

import io
import uuid
from pathlib import Path
from unittest.mock import patch

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


def test_get_player_profile(quiz_client) -> None:
    """GET /api/v1/quiz/players/{id}/profile should return profile with accuracy and sessions."""
    # Create player
    player_resp = quiz_client.post("/api/v1/quiz/players", json={"name": "Profiler"})
    player_id = player_resp.json()["id"]

    # Create a session and play a question
    session_resp = quiz_client.post(
        "/api/v1/quiz/sessions", json={"mode": "speed", "player_id": player_id}
    )
    session_id = session_resp.json()["id"]

    # Create a question and submit a correct attempt
    q_payload = _create_question_payload()
    q_resp = quiz_client.post("/api/v1/quiz/questions", json=q_payload)
    q_data = q_resp.json()
    q_id = q_data["id"]

    # Get the correct answer from the POST response (which includes is_correct)
    correct_id = next(a["id"] for a in q_data["answers"] if a["is_correct"])

    quiz_client.post(
        f"/api/v1/quiz/questions/{q_id}/attempt",
        json={"player_id": player_id, "session_id": session_id, "answer_id": correct_id},
    )

    # Finish session
    quiz_client.post(f"/api/v1/quiz/sessions/{session_id}/finish")

    # Get profile
    resp = quiz_client.get(f"/api/v1/quiz/players/{player_id}/profile")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Profiler"
    assert data["games_played"] == 1
    assert data["correct_count"] == 1
    assert data["accuracy"] == 1.0
    assert len(data["recent_sessions"]) == 1
    assert data["recent_sessions"][0]["id"] == session_id


def test_get_player_profile_not_found(quiz_client) -> None:
    """GET /api/v1/quiz/players/{id}/profile should return 404 for unknown player."""
    resp = quiz_client.get(f"/api/v1/quiz/players/{uuid.uuid4()}/profile")
    assert resp.status_code == 404
    assert resp.json()["code"] == "PLAYER_NOT_FOUND"


def test_get_player_profile_zero_accuracy(quiz_client) -> None:
    """Player with no attempts should have accuracy 0.0."""
    player_resp = quiz_client.post("/api/v1/quiz/players", json={"name": "NewGuy"})
    player_id = player_resp.json()["id"]
    resp = quiz_client.get(f"/api/v1/quiz/players/{player_id}/profile")
    assert resp.status_code == 200
    assert resp.json()["accuracy"] == 0.0
    assert resp.json()["recent_sessions"] == []


def test_get_player_sessions(quiz_client) -> None:
    """GET /api/v1/quiz/players/{id}/sessions should list player's sessions."""
    player_resp = quiz_client.post("/api/v1/quiz/players", json={"name": "SessionPlayer"})
    player_id = player_resp.json()["id"]

    # Create 3 sessions
    for mode in ["speed", "millionaire", "speed"]:
        quiz_client.post(
            "/api/v1/quiz/sessions", json={"mode": mode, "player_id": player_id}
        )

    resp = quiz_client.get(f"/api/v1/quiz/players/{player_id}/sessions")
    assert resp.status_code == 200
    sessions = resp.json()
    assert len(sessions) == 3
    # Newest first
    assert sessions[0]["mode"] == "speed"


def test_get_player_sessions_not_found(quiz_client) -> None:
    """GET /api/v1/quiz/players/{id}/sessions should return 404 for unknown player."""
    resp = quiz_client.get(f"/api/v1/quiz/players/{uuid.uuid4()}/sessions")
    assert resp.status_code == 404
    assert resp.json()["code"] == "PLAYER_NOT_FOUND"


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


def test_list_questions_elo_asc_with_balanced_categories(quiz_client) -> None:
    """Combined order_by_elo=asc + balanced_categories should interleave categories within ELO bands."""
    # Create 2 categories
    cat_a = quiz_client.post("/api/v1/quiz/categories", json={"name": "Alpha"}).json()["id"]
    cat_b = quiz_client.post("/api/v1/quiz/categories", json={"name": "Beta"}).json()["id"]

    # Create 6 questions: 3 per category, all same ELO
    for i in range(3):
        payload = _create_question_payload(category_id=cat_a)
        payload["text"] = f"Alpha Q{i}"
        payload["tags"] = [f"alpha-{i}"]
        quiz_client.post("/api/v1/quiz/questions", json=payload)

    for i in range(3):
        payload = _create_question_payload(category_id=cat_b)
        payload["text"] = f"Beta Q{i}"
        payload["tags"] = [f"beta-{i}"]
        quiz_client.post("/api/v1/quiz/questions", json=payload)

    resp = quiz_client.get("/api/v1/quiz/questions?order_by_elo=asc&balanced_categories=true&limit=6")
    assert resp.status_code == 200
    items = resp.json()["items"]
    categories = [item["category"] for item in items]

    # With balancing, the first two items should not be from the same category
    # (categories should alternate: Alpha, Beta, Alpha, Beta, ...)
    assert len(items) == 6
    assert categories[0] != categories[1], "First two questions should be from different categories"


def test_list_questions_elo_balanced_preserves_difficulty_progression(quiz_client) -> None:
    """ELO bands should preserve overall ascending difficulty even with category interleaving.

    Creates 9 questions across 3 categories (all default ELO 1200).
    The balanced result must interleave categories within each 5-question band,
    and no 3 consecutive questions should be from the same category.
    """
    cats = {}
    for name in ["Lore", "Meme", "Alltag"]:
        resp = quiz_client.post("/api/v1/quiz/categories", json={"name": name})
        cats[name] = resp.json()["id"]

    for cat_name in ["Lore", "Meme", "Alltag"]:
        for i in range(3):
            payload = _create_question_payload(category_id=cats[cat_name])
            payload["text"] = f"{cat_name} Tier Question {i}"
            payload["tags"] = [f"{cat_name.lower()}-tier-{i}"]
            quiz_client.post("/api/v1/quiz/questions", json=payload)

    resp = quiz_client.get(
        "/api/v1/quiz/questions?order_by_elo=asc&balanced_categories=true&limit=9"
    )
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 9

    # Band 1 (positions 0-4): no 3 consecutive same-category questions
    categories_band1 = [item["category"] for item in items[:5]]
    for i in range(len(categories_band1) - 2):
        triplet = categories_band1[i : i + 3]
        assert len(set(triplet)) > 1, f"Three consecutive same-category in band 1: {triplet}"

    # Overall: all 3 categories should appear
    all_cats = {item["category"] for item in items}
    assert all_cats == {"Lore", "Meme", "Alltag"}

    # ELO should never decrease within the overall sequence (since all start at 1200)
    elo_scores = [item["elo_score"] for item in items]
    assert elo_scores == sorted(elo_scores), "Overall ELO order should be non-decreasing"


def test_list_questions_elo_balanced_single_category(quiz_client) -> None:
    """Balanced ELO ordering with a single category should still return all questions in ELO order."""
    cat_id = quiz_client.post("/api/v1/quiz/categories", json={"name": "Solo"}).json()["id"]

    for i in range(5):
        payload = _create_question_payload(category_id=cat_id)
        payload["text"] = f"Solo Question {i}"
        payload["tags"] = [f"solo-{i}"]
        quiz_client.post("/api/v1/quiz/questions", json=payload)

    resp = quiz_client.get("/api/v1/quiz/questions?order_by_elo=asc&balanced_categories=true&limit=5")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 5
    # All same category — should still return them (not break)
    assert all(item["category"] == "Solo" for item in items)
    # ELO order preserved (all same ELO, so order by id is fine)
    elo_scores = [item["elo_score"] for item in items]
    assert elo_scores == sorted(elo_scores)


def test_list_questions_elo_balanced_fewer_than_band_size(quiz_client) -> None:
    """Balanced ELO ordering with fewer questions than band_size should not crash."""
    cat_a = quiz_client.post("/api/v1/quiz/categories", json={"name": "FewA"}).json()["id"]
    cat_b = quiz_client.post("/api/v1/quiz/categories", json={"name": "FewB"}).json()["id"]

    payload_a = _create_question_payload(category_id=cat_a)
    payload_a["text"] = "Few A Q1"
    payload_a["tags"] = ["few-a"]
    quiz_client.post("/api/v1/quiz/questions", json=payload_a)

    payload_b = _create_question_payload(category_id=cat_b)
    payload_b["text"] = "Few B Q1"
    payload_b["tags"] = ["few-b"]
    quiz_client.post("/api/v1/quiz/questions", json=payload_b)

    resp = quiz_client.get("/api/v1/quiz/questions?order_by_elo=asc&balanced_categories=true&limit=2")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 2
    # Two different categories should be interleaved
    assert items[0]["category"] != items[1]["category"]


def test_list_questions_elo_balanced_empty_result(quiz_client) -> None:
    """Balanced ELO ordering on empty DB should return empty list, not crash."""
    resp = quiz_client.get("/api/v1/quiz/questions?order_by_elo=asc&balanced_categories=true&limit=15")
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0


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


# --- Update question ---


def test_update_question_text(quiz_client) -> None:
    """PATCH /api/v1/quiz/questions/{id} should update the text."""
    create_resp = quiz_client.post("/api/v1/quiz/questions", json=_create_question_payload())
    qid = create_resp.json()["id"]
    resp = quiz_client.patch(
        f"/api/v1/quiz/questions/{qid}",
        json={"text": "Updated question text?"},
    )
    assert resp.status_code == 200
    assert resp.json()["text"] == "Updated question text?"


def test_update_question_note(quiz_client) -> None:
    """PATCH /api/v1/quiz/questions/{id} should update the note."""
    create_resp = quiz_client.post("/api/v1/quiz/questions", json=_create_question_payload())
    qid = create_resp.json()["id"]
    resp = quiz_client.patch(
        f"/api/v1/quiz/questions/{qid}",
        json={"note": "New background info."},
    )
    assert resp.status_code == 200
    assert resp.json()["note"] == "New background info."


def test_update_question_not_found(quiz_client) -> None:
    """PATCH /api/v1/quiz/questions/{id} on unknown ID should return 404."""
    resp = quiz_client.patch(
        f"/api/v1/quiz/questions/{uuid.uuid4()}",
        json={"text": "Nope"},
    )
    assert resp.status_code == 404
    assert resp.json()["code"] == "QUESTION_NOT_FOUND"


# --- Delete question ---


def test_delete_question(quiz_client) -> None:
    """DELETE /api/v1/quiz/questions/{id} should soft-delete the question."""
    create_resp = quiz_client.post("/api/v1/quiz/questions", json=_create_question_payload())
    qid = create_resp.json()["id"]

    del_resp = quiz_client.delete(f"/api/v1/quiz/questions/{qid}")
    assert del_resp.status_code == 200

    # Should no longer appear in list
    list_resp = quiz_client.get("/api/v1/quiz/questions")
    assert all(item["id"] != qid for item in list_resp.json()["items"])

    # Should return 404 on direct GET
    get_resp = quiz_client.get(f"/api/v1/quiz/questions/{qid}")
    assert get_resp.status_code == 404


def test_delete_question_not_found(quiz_client) -> None:
    """DELETE /api/v1/quiz/questions/{id} on unknown ID should return 404."""
    resp = quiz_client.delete(f"/api/v1/quiz/questions/{uuid.uuid4()}")
    assert resp.status_code == 404
    assert resp.json()["code"] == "QUESTION_NOT_FOUND"


def test_delete_question_idempotent(quiz_client) -> None:
    """DELETE twice on the same question should return 404 on the second call."""
    create_resp = quiz_client.post("/api/v1/quiz/questions", json=_create_question_payload())
    qid = create_resp.json()["id"]

    first = quiz_client.delete(f"/api/v1/quiz/questions/{qid}")
    assert first.status_code == 200

    second = quiz_client.delete(f"/api/v1/quiz/questions/{qid}")
    assert second.status_code == 404


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


def test_list_questions_filter_by_tag(quiz_client) -> None:
    """GET /api/v1/quiz/questions?tag=X should return only questions tagged with X."""
    # Create two questions with different tags
    payload_a = _create_question_payload()
    payload_a["text"] = "Tagged A?"
    payload_a["tags"] = ["alpha-tag"]
    quiz_client.post("/api/v1/quiz/questions", json=payload_a)

    payload_b = _create_question_payload()
    payload_b["text"] = "Tagged B?"
    payload_b["tags"] = ["beta-tag"]
    quiz_client.post("/api/v1/quiz/questions", json=payload_b)

    resp = quiz_client.get("/api/v1/quiz/questions?tag=alpha-tag")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) >= 1
    assert all("alpha-tag" in item["tags"] for item in items)
    assert all("Tagged B?" != item["text"] for item in items)


def test_list_questions_filter_by_unknown_tag(quiz_client) -> None:
    """GET /api/v1/quiz/questions?tag=nonexistent should return empty list."""
    quiz_client.post("/api/v1/quiz/questions", json=_create_question_payload())
    resp = quiz_client.get("/api/v1/quiz/questions?tag=nonexistent-tag-xyz")
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0


def test_list_questions_filter_by_tag_with_balanced_categories(quiz_client) -> None:
    """Tag filter combined with balanced_categories should work without errors."""
    cat_a = quiz_client.post("/api/v1/quiz/categories", json={"name": "TagCatA"}).json()["id"]
    cat_b = quiz_client.post("/api/v1/quiz/categories", json={"name": "TagCatB"}).json()["id"]

    # Create 4 questions: 2 per category, all with same tag
    for i, cat_id in enumerate([cat_a, cat_a, cat_b, cat_b]):
        payload = _create_question_payload(category_id=cat_id)
        payload["text"] = f"Shared Tag Q{i}"
        payload["tags"] = ["shared-tag", f"unique-{i}"]
        quiz_client.post("/api/v1/quiz/questions", json=payload)

    # Extra question WITHOUT shared-tag — should not appear
    extra = _create_question_payload(category_id=cat_a)
    extra["text"] = "No shared tag"
    extra["tags"] = ["other-tag"]
    quiz_client.post("/api/v1/quiz/questions", json=extra)

    resp = quiz_client.get("/api/v1/quiz/questions?tag=shared-tag&balanced_categories=true&limit=4")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 4
    # All results should have the shared-tag
    assert all("shared-tag" in item["tags"] for item in items)
    # Balanced: first two should be from different categories
    categories = [item["category"] for item in items]
    assert categories[0] != categories[1], "Balanced tag filter should interleave categories"


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
    """POST audience-poll should return percentages summing to exactly 100, every time."""
    qid, answer_ids = _create_question_and_get_displayed(quiz_client)
    # Run multiple times to catch non-deterministic distribution bugs
    for _ in range(10):
        resp = quiz_client.post(
            f"/api/v1/quiz/questions/{qid}/audience-poll",
            json={"displayed_answer_ids": answer_ids},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["results"]) == len(answer_ids)
        total = sum(r["percentage"] for r in data["results"])
        assert total == 100, f"Audience poll percentages sum to {total}, expected 100"
        assert all(r["percentage"] >= 0 for r in data["results"])


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
    # Tiers get distinct starting ELOs for difficulty curve on fresh DBs
    assert questions[0].elo_score == 1000.0  # tier 1 (easy)
    assert questions[1].elo_score == 1200.0  # tier 2 (medium)
    assert questions[2].elo_score == 1400.0  # tier 3 (hard)


# --- Media upload/delete ---


def test_upload_media_image(quiz_client, tmp_path: Path) -> None:
    """POST /api/v1/quiz/questions/{id}/media should upload an image and set media_url/type."""
    q_resp = quiz_client.post("/api/v1/quiz/questions", json=_create_question_payload())
    qid = q_resp.json()["id"]

    # Create a fake PNG (1x1 pixel)
    png_bytes = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00"
        b"\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00"
        b"\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
    )

    with patch("app.games.quiz.service.settings") as mock_settings:
        mock_settings.media_dir = str(tmp_path / "media")
        mock_settings.max_media_size_mb = 50
        resp = quiz_client.post(
            f"/api/v1/quiz/questions/{qid}/media",
            files={"file": ("test.png", io.BytesIO(png_bytes), "image/png")},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["media_type"] == "image"
    assert data["media_url"].startswith("/media/quiz/")
    assert data["media_url"].endswith(".png")


def test_upload_media_unsupported_type(quiz_client, tmp_path: Path) -> None:
    """POST /api/v1/quiz/questions/{id}/media with unsupported type should return 422."""
    q_resp = quiz_client.post("/api/v1/quiz/questions", json=_create_question_payload())
    qid = q_resp.json()["id"]

    with patch("app.games.quiz.service.settings") as mock_settings:
        mock_settings.media_dir = str(tmp_path / "media")
        mock_settings.max_media_size_mb = 50
        resp = quiz_client.post(
            f"/api/v1/quiz/questions/{qid}/media",
            files={"file": ("test.exe", io.BytesIO(b"malware"), "application/x-msdownload")},
        )

    assert resp.status_code == 422
    assert resp.json()["code"] == "UNSUPPORTED_MEDIA_TYPE"


def test_upload_media_file_too_large(quiz_client, tmp_path: Path) -> None:
    """POST /api/v1/quiz/questions/{id}/media with oversized file should return 413."""
    q_resp = quiz_client.post("/api/v1/quiz/questions", json=_create_question_payload())
    qid = q_resp.json()["id"]

    # Set max to 0 MB to trigger size limit
    with patch("app.games.quiz.service.settings") as mock_settings:
        mock_settings.media_dir = str(tmp_path / "media")
        mock_settings.max_media_size_mb = 0
        resp = quiz_client.post(
            f"/api/v1/quiz/questions/{qid}/media",
            files={"file": ("big.png", io.BytesIO(b"\x89PNG" + b"\x00" * 100), "image/png")},
        )

    assert resp.status_code == 413
    assert resp.json()["code"] == "FILE_TOO_LARGE"


def test_upload_media_question_not_found(quiz_client, tmp_path: Path) -> None:
    """POST /api/v1/quiz/questions/{id}/media for unknown question should return 404."""
    with patch("app.games.quiz.service.settings") as mock_settings:
        mock_settings.media_dir = str(tmp_path / "media")
        mock_settings.max_media_size_mb = 50
        resp = quiz_client.post(
            f"/api/v1/quiz/questions/{uuid.uuid4()}/media",
            files={"file": ("test.png", io.BytesIO(b"\x89PNG"), "image/png")},
        )

    assert resp.status_code == 404
    assert resp.json()["code"] == "QUESTION_NOT_FOUND"


def test_upload_media_updates_question(quiz_client, tmp_path: Path) -> None:
    """After uploading media, GET /questions should include media_url and media_type."""
    q_resp = quiz_client.post("/api/v1/quiz/questions", json=_create_question_payload())
    qid = q_resp.json()["id"]
    assert q_resp.json()["media_url"] is None

    with patch("app.games.quiz.service.settings") as mock_settings:
        mock_settings.media_dir = str(tmp_path / "media")
        mock_settings.max_media_size_mb = 50
        quiz_client.post(
            f"/api/v1/quiz/questions/{qid}/media",
            files={"file": ("pic.jpg", io.BytesIO(b"\xff\xd8\xff\xe0"), "image/jpeg")},
        )

    # Verify via list endpoint
    list_resp = quiz_client.get("/api/v1/quiz/questions")
    question = next(q for q in list_resp.json()["items"] if q["id"] == qid)
    assert question["media_url"] is not None
    assert question["media_type"] == "image"


def test_delete_media(quiz_client, tmp_path: Path) -> None:
    """DELETE /api/v1/quiz/questions/{id}/media should clear media fields."""
    q_resp = quiz_client.post("/api/v1/quiz/questions", json=_create_question_payload())
    qid = q_resp.json()["id"]

    with patch("app.games.quiz.service.settings") as mock_settings:
        mock_settings.media_dir = str(tmp_path / "media")
        mock_settings.max_media_size_mb = 50

        # Upload first
        quiz_client.post(
            f"/api/v1/quiz/questions/{qid}/media",
            files={"file": ("pic.png", io.BytesIO(b"\x89PNG\r\n"), "image/png")},
        )

        # Delete
        resp = quiz_client.delete(f"/api/v1/quiz/questions/{qid}/media")

    assert resp.status_code == 200
    data = resp.json()
    assert data["media_url"] is None
    assert data["media_type"] is None


def test_delete_media_no_media_attached(quiz_client) -> None:
    """DELETE /api/v1/quiz/questions/{id}/media when no media exists should return 404."""
    q_resp = quiz_client.post("/api/v1/quiz/questions", json=_create_question_payload())
    qid = q_resp.json()["id"]

    resp = quiz_client.delete(f"/api/v1/quiz/questions/{qid}/media")
    assert resp.status_code == 404
    assert resp.json()["code"] == "NO_MEDIA"


def test_delete_media_question_not_found(quiz_client) -> None:
    """DELETE /api/v1/quiz/questions/{id}/media for unknown question should return 404."""
    resp = quiz_client.delete(f"/api/v1/quiz/questions/{uuid.uuid4()}/media")
    assert resp.status_code == 404
    assert resp.json()["code"] == "QUESTION_NOT_FOUND"


# --- Health check ---


def test_health(client) -> None:
    """GET /health should return ok."""
    resp = client.get("/health")
    assert resp.status_code == 200


# --- New fields: wwm_difficulty, language, is_pun ---


def _de_question_payload(**overrides) -> dict:
    """Minimal German question payload with new fields."""
    base = {
        "text": "Was ist die Hauptstadt von Deutschland?",
        "language": "de",
        "is_pun": False,
        "wwm_difficulty": 3,
        "answers": [
            {"text": "Berlin", "is_correct": True},
            {"text": "München", "is_correct": False},
        ],
    }
    base.update(overrides)
    return base


def test_create_question_with_wwm_difficulty(quiz_client) -> None:
    """POST /questions should persist and return wwm_difficulty."""
    resp = quiz_client.post("/api/v1/quiz/questions", json=_de_question_payload(wwm_difficulty=7))
    assert resp.status_code == 200
    data = resp.json()
    assert data["wwm_difficulty"] == 7


def test_create_question_wwm_difficulty_optional(quiz_client) -> None:
    """wwm_difficulty is optional — null by default."""
    payload = _de_question_payload()
    payload.pop("wwm_difficulty", None)
    resp = quiz_client.post("/api/v1/quiz/questions", json=payload)
    assert resp.status_code == 200
    assert resp.json()["wwm_difficulty"] is None


def test_create_question_wwm_difficulty_out_of_range(quiz_client) -> None:
    """wwm_difficulty must be 0–15; 16 should be rejected."""
    resp = quiz_client.post("/api/v1/quiz/questions", json=_de_question_payload(wwm_difficulty=16))
    assert resp.status_code == 422


def test_create_question_language_stored(quiz_client) -> None:
    """language field should be stored and returned."""
    resp = quiz_client.post("/api/v1/quiz/questions", json=_de_question_payload(language="de"))
    assert resp.status_code == 200
    assert resp.json()["language"] == "de"


def test_language_filter_excludes_other_languages(quiz_client) -> None:
    """GET /questions?language=de should not return questions with language=en."""
    # Create one German and one English question
    quiz_client.post("/api/v1/quiz/questions", json=_de_question_payload(text="Deutsche Frage", language="de"))
    quiz_client.post(
        "/api/v1/quiz/questions",
        json={
            "text": "English question",
            "language": "en",
            "answers": [{"text": "Yes", "is_correct": True}, {"text": "No", "is_correct": False}],
        },
    )

    resp = quiz_client.get("/api/v1/quiz/questions?language=de")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert all(q["language"] == "de" for q in items), "language=de filter must exclude 'en' questions"


def test_language_filter_en_returns_only_en(quiz_client) -> None:
    """GET /questions?language=en should return only English questions."""
    quiz_client.post("/api/v1/quiz/questions", json=_de_question_payload(text="Nur Deutsch", language="de"))
    quiz_client.post(
        "/api/v1/quiz/questions",
        json={
            "text": "Only English",
            "language": "en",
            "answers": [{"text": "Correct", "is_correct": True}, {"text": "Wrong", "is_correct": False}],
        },
    )

    resp = quiz_client.get("/api/v1/quiz/questions?language=en")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) >= 1
    assert all(q["language"] == "en" for q in items)


def test_create_pun_question(quiz_client) -> None:
    """is_pun=True should be stored and returned."""
    resp = quiz_client.post("/api/v1/quiz/questions", json=_de_question_payload(is_pun=True))
    assert resp.status_code == 200
    assert resp.json()["is_pun"] is True


def test_pun_first_puts_pun_at_position_zero(quiz_client) -> None:
    """GET /questions?pun_first=true&balanced_categories=true should put an is_pun question first."""
    # Create several non-pun questions and one pun question
    for i in range(5):
        quiz_client.post(
            "/api/v1/quiz/questions",
            json=_de_question_payload(text=f"Normale Frage {i}", is_pun=False),
        )
    quiz_client.post(
        "/api/v1/quiz/questions",
        json=_de_question_payload(text="Das Wortspiel-Frage", is_pun=True),
    )

    resp = quiz_client.get(
        "/api/v1/quiz/questions?pun_first=true&balanced_categories=true&order_by_elo=asc&limit=6"
    )
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) >= 1
    assert items[0]["is_pun"] is True, "First question must be the pun when pun_first=true"


def test_pun_first_no_pun_available(quiz_client) -> None:
    """pun_first=true without any pun questions should still return results normally."""
    for i in range(3):
        quiz_client.post(
            "/api/v1/quiz/questions",
            json=_de_question_payload(text=f"Frage ohne Pun {i}", is_pun=False),
        )

    resp = quiz_client.get(
        "/api/v1/quiz/questions?pun_first=true&balanced_categories=true&order_by_elo=asc&limit=3"
    )
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 3  # Results returned normally even without a pun


def test_randomize_returns_valid_questions(quiz_client) -> None:
    """GET /questions?randomize=true should still return valid question objects."""
    for i in range(10):
        quiz_client.post(
            "/api/v1/quiz/questions",
            json=_de_question_payload(text=f"Randomisier-Frage {i}", language="de"),
        )

    resp = quiz_client.get(
        "/api/v1/quiz/questions?order_by_elo=asc&balanced_categories=true&limit=5&randomize=true&language=de"
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) <= 5
    for q in data["items"]:
        assert "id" in q
        assert "text" in q
        assert q["language"] == "de"


def test_update_question_wwm_difficulty(quiz_client) -> None:
    """PATCH /questions/{id} should update wwm_difficulty."""
    create_resp = quiz_client.post("/api/v1/quiz/questions", json=_de_question_payload(wwm_difficulty=1))
    qid = create_resp.json()["id"]

    resp = quiz_client.patch(f"/api/v1/quiz/questions/{qid}", json={"wwm_difficulty": 14})
    assert resp.status_code == 200
    assert resp.json()["wwm_difficulty"] == 14


def test_default_language_is_de(quiz_client) -> None:
    """Questions without explicit language should default to 'de'."""
    payload = {
        "text": "Sprachlose Frage",
        "answers": [{"text": "Antwort", "is_correct": True}, {"text": "Falsch", "is_correct": False}],
    }
    resp = quiz_client.post("/api/v1/quiz/questions", json=payload)
    assert resp.status_code == 200
    assert resp.json()["language"] == "de"


# ===== Ordering Question (Kandidaten-Auswahlfrage) Tests =====


def _seed_ordering_question(quiz_client, text="Ordne richtig!", answers=None, language="de"):
    """Seed an ordering question directly via the DB session (no API for creation)."""
    import json
    from app.games.quiz.models import OrderingQuestion

    # Access the overridden DB session from the dependency
    from app.core.database import get_pg_session
    app = quiz_client.app
    override_fn = app.dependency_overrides.get(get_pg_session)
    if override_fn:
        gen = override_fn()
        db = next(gen)
    else:
        raise RuntimeError("No DB session override found")

    if answers is None:
        answers = ["Erster", "Zweiter", "Dritter", "Vierter"]

    oq = OrderingQuestion(
        text=text,
        ordered_answers_json=json.dumps(answers, ensure_ascii=False),
        language=language,
    )
    db.add(oq)
    db.flush()
    return str(oq.id), answers


def test_ordering_question_get_random(quiz_client) -> None:
    """GET /ordering-question should return a random ordering question with shuffled answers."""
    oq_id, correct_answers = _seed_ordering_question(quiz_client)

    resp = quiz_client.get("/api/v1/quiz/ordering-question")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == oq_id
    assert data["text"] == "Ordne richtig!"
    assert set(data["shuffled_answers"]) == set(correct_answers)
    assert len(data["shuffled_answers"]) == 4


def test_ordering_question_with_language_filter(quiz_client) -> None:
    """GET /ordering-question?language=de should filter by language."""
    _seed_ordering_question(quiz_client, text="Deutsche Frage", language="de")
    _seed_ordering_question(quiz_client, text="English Question", answers=["A", "B", "C", "D"], language="en")

    resp = quiz_client.get("/api/v1/quiz/ordering-question?language=en")
    assert resp.status_code == 200
    assert resp.json()["text"] == "English Question"


def test_ordering_question_404_when_empty(quiz_client) -> None:
    """GET /ordering-question should return 404 if no ordering questions exist."""
    resp = quiz_client.get("/api/v1/quiz/ordering-question")
    assert resp.status_code == 404
    assert resp.json()["code"] == "NO_ORDERING_QUESTIONS"


def test_ordering_check_correct(quiz_client) -> None:
    """POST /ordering-question/{id}/check with correct order should return correct=true."""
    oq_id, correct = _seed_ordering_question(quiz_client)

    resp = quiz_client.post(f"/api/v1/quiz/ordering-question/{oq_id}/check", json={
        "submitted_order": correct,
        "time_taken_ms": 5000,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["correct"] is True
    assert data["correct_order"] == correct
    assert data["time_taken_ms"] == 5000


def test_ordering_check_wrong(quiz_client) -> None:
    """POST /ordering-question/{id}/check with wrong order should return correct=false."""
    oq_id, correct = _seed_ordering_question(quiz_client)
    wrong = list(reversed(correct))

    resp = quiz_client.post(f"/api/v1/quiz/ordering-question/{oq_id}/check", json={
        "submitted_order": wrong,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["correct"] is False
    assert data["correct_order"] == correct


def test_ordering_check_404(quiz_client) -> None:
    """POST /ordering-question/{id}/check with invalid ID should return 404."""
    import uuid
    resp = quiz_client.post(f"/api/v1/quiz/ordering-question/{uuid.uuid4()}/check", json={
        "submitted_order": ["A", "B"],
    })
    assert resp.status_code == 404
    assert resp.json()["code"] == "ORDERING_QUESTION_NOT_FOUND"


def test_ordering_check_preserves_time(quiz_client) -> None:
    """Time taken should be echoed back in the response."""
    oq_id, correct = _seed_ordering_question(quiz_client)

    resp = quiz_client.post(f"/api/v1/quiz/ordering-question/{oq_id}/check", json={
        "submitted_order": correct,
        "time_taken_ms": 12345,
    })
    assert resp.status_code == 200
    assert resp.json()["time_taken_ms"] == 12345


# ===== Millionaire Game Init Flow (Integration Test) =====


def test_millionaire_init_flow_with_ordering(quiz_client) -> None:
    """Full WWM init sequence: ordering question → check → player → session → questions → load first question.

    This mirrors exactly what the frontend does when the user clicks
    "Wer wird Elite-Hater?". If any step fails the game shows a blank screen.
    """
    # 1. Seed an ordering question + a regular quiz question
    oq_id, correct = _seed_ordering_question(quiz_client)
    quiz_client.post("/api/v1/quiz/questions", json=_create_question_payload())

    # 2. Fetch ordering question (frontend does this first)
    resp = quiz_client.get("/api/v1/quiz/ordering-question?language=de")
    assert resp.status_code == 200
    oq = resp.json()
    assert "shuffled_answers" in oq
    assert len(oq["shuffled_answers"]) == 4

    # 3. Check ordering answer (correct submission)
    resp = quiz_client.post(f"/api/v1/quiz/ordering-question/{oq['id']}/check", json={
        "submitted_order": correct,
        "time_taken_ms": 3000,
    })
    assert resp.status_code == 200
    assert resp.json()["correct"] is True

    # 4. Create player
    resp = quiz_client.post("/api/v1/quiz/players", json={"name": "Gast"})
    assert resp.status_code == 200
    player = resp.json()
    assert "id" in player

    # 5. Create session
    resp = quiz_client.post("/api/v1/quiz/sessions", json={
        "mode": "millionaire",
        "player_id": player["id"],
    })
    assert resp.status_code == 200
    session = resp.json()
    assert session["mode"] == "millionaire"

    # 6. Fetch questions list
    resp = quiz_client.get(
        "/api/v1/quiz/questions?order_by_elo=asc&balanced_categories=true&limit=15&language=de&pun_first=true&randomize=true"
    )
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) >= 1

    # 7. Load first question with 4 answers
    qid = items[0]["id"]
    resp = quiz_client.get(f"/api/v1/quiz/questions/{qid}?num_answers=4")
    assert resp.status_code == 200
    q = resp.json()
    assert len(q["answers"]) >= 2  # at least 2 answers


def test_millionaire_init_flow_no_ordering(quiz_client) -> None:
    """WWM init when no ordering questions exist — should skip straight to main game."""
    # Seed a regular quiz question (no ordering question)
    quiz_client.post("/api/v1/quiz/questions", json=_create_question_payload())

    # 1. Ordering question returns 404 → frontend skips to main game
    resp = quiz_client.get("/api/v1/quiz/ordering-question?language=de")
    assert resp.status_code == 404

    # 2. Create player + session + fetch questions (main game init)
    resp = quiz_client.post("/api/v1/quiz/players", json={"name": "Gast"})
    assert resp.status_code == 200
    player = resp.json()

    resp = quiz_client.post("/api/v1/quiz/sessions", json={
        "mode": "millionaire",
        "player_id": player["id"],
    })
    assert resp.status_code == 200

    resp = quiz_client.get(
        "/api/v1/quiz/questions?order_by_elo=asc&balanced_categories=true&limit=15&language=de&pun_first=true&randomize=true"
    )
    assert resp.status_code == 200
    assert len(resp.json()["items"]) >= 1


def test_millionaire_answer_and_next(quiz_client) -> None:
    """WWM: answer a question correctly and advance to the next one."""
    # Seed two questions
    q1 = quiz_client.post("/api/v1/quiz/questions", json=_create_question_payload()).json()
    payload2 = _create_question_payload()
    payload2["text"] = "Zweite Frage?"
    q2 = quiz_client.post("/api/v1/quiz/questions", json=payload2).json()

    # Create player + session
    player = quiz_client.post("/api/v1/quiz/players", json={"name": "Gast"}).json()
    session = quiz_client.post("/api/v1/quiz/sessions", json={
        "mode": "millionaire", "player_id": player["id"],
    }).json()

    # Load first question with answers
    resp = quiz_client.get(f"/api/v1/quiz/questions/{q1['id']}?num_answers=4")
    assert resp.status_code == 200
    answers = resp.json()["answers"]
    correct_id = next(a["id"] for a in q1["answers"] if a["is_correct"])

    # Submit correct answer
    resp = quiz_client.post(f"/api/v1/quiz/questions/{q1['id']}/attempt", json={
        "answer_id": correct_id,
        "player_id": player["id"],
        "session_id": session["id"],
    })
    assert resp.status_code == 200
    att = resp.json()
    assert att["correct"] is True

    # Load next question
    resp = quiz_client.get(f"/api/v1/quiz/questions/{q2['id']}?num_answers=4")
    assert resp.status_code == 200
    assert resp.json()["text"] == "Zweite Frage?"
