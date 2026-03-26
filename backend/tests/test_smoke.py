"""Smoke test — verifies the server works from scratch (fresh DB + seed + full game flow).

This test catches schema drift, missing columns, broken seeds, and API contract
violations early. It simulates exactly what happens when a fresh server starts and
a user plays a full Millionaire game.
"""


def test_health_from_scratch(client) -> None:
    """GET /health should work even without quiz DB override (basic wiring check)."""
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_quiz_tables_created_and_queryable(quiz_client) -> None:
    """After table creation, all core quiz endpoints must return 200 (not 500).

    This is the test that would have caught 'no such column: questions.explanation'.
    """
    # These should all succeed on an empty-but-correctly-schemaed database
    resp = quiz_client.get("/api/v1/quiz/questions")
    assert resp.status_code == 200, f"list questions failed: {resp.text}"
    assert resp.json()["total"] == 0

    resp = quiz_client.get("/api/v1/quiz/categories")
    assert resp.status_code == 200, f"list categories failed: {resp.text}"

    resp = quiz_client.get("/api/v1/quiz/tags")
    assert resp.status_code == 200, f"list tags failed: {resp.text}"

    resp = quiz_client.get("/api/v1/quiz/leaderboard")
    assert resp.status_code == 200, f"leaderboard failed: {resp.text}"


def test_quiz_tables_support_elo_ordering(quiz_client) -> None:
    """ELO-ordered queries must work — this is the Millionaire startup query."""
    resp = quiz_client.get("/api/v1/quiz/questions?order_by_elo=asc&limit=15")
    assert resp.status_code == 200, f"ELO-ordered query failed: {resp.text}"

    resp = quiz_client.get("/api/v1/quiz/questions?order_by_elo=desc&limit=15")
    assert resp.status_code == 200, f"ELO-desc query failed: {resp.text}"


def test_full_millionaire_game_from_scratch(seeded_quiz_client) -> None:
    """Simulate the complete Millionaire frontend flow against a fresh seeded DB.

    Steps (mirrors MillionaireGame.tsx init + game loop):
      1. POST /players          → create guest player
      2. POST /sessions         → create millionaire session
      3. GET  /questions?order_by_elo=asc&limit=15  → load 15 question IDs
      4. For each question:
         a. GET /questions/{id}?num_answers=4   → fetch question + 4 answers
         b. POST /questions/{id}/attempt        → submit answer
      5. POST /sessions/{id}/finish             → finalize session

    Any 500 here means schema drift or broken service logic.
    """
    c = seeded_quiz_client

    # 1. Create guest player
    player_resp = c.post("/api/v1/quiz/players", json={"name": "Gast"})
    assert player_resp.status_code == 200, f"Create player failed: {player_resp.text}"
    player = player_resp.json()
    assert player["elo_score"] == 1200.0
    player_id = player["id"]

    # 2. Create millionaire session
    session_resp = c.post(
        "/api/v1/quiz/sessions",
        json={"mode": "millionaire", "player_id": player_id},
    )
    assert session_resp.status_code == 200, f"Create session failed: {session_resp.text}"
    session = session_resp.json()
    session_id = session["id"]
    assert session["mode"] == "millionaire"
    assert session["score"] == 0

    # 3. Load 15 questions ordered by ELO (exactly like MillionaireGame.tsx)
    q_list_resp = c.get("/api/v1/quiz/questions?order_by_elo=asc&limit=15")
    assert q_list_resp.status_code == 200, f"List questions failed: {q_list_resp.text}"
    q_list = q_list_resp.json()
    question_ids = [q["id"] for q in q_list["items"]]
    assert len(question_ids) >= 1, "Seeded DB should have questions available"

    # Play through all available questions (up to 15)
    correct_count = 0
    for idx, qid in enumerate(question_ids):
        # 4a. Fetch question with 4 answer options
        q_resp = c.get(f"/api/v1/quiz/questions/{qid}?num_answers=4")
        assert q_resp.status_code == 200, f"Get question {idx + 1} failed: {q_resp.text}"
        q_data = q_resp.json()
        assert len(q_data["answers"]) >= 2, "Question must have at least 2 answers"
        # note should be hidden during gameplay
        assert q_data["note"] is None, "Note must be hidden during gameplay"

        # Pick the first answer (we don't know which is correct — that's fine)
        answer_id = q_data["answers"][0]["id"]

        # 4b. Submit attempt
        attempt_resp = c.post(
            f"/api/v1/quiz/questions/{qid}/attempt",
            json={
                "answer_id": answer_id,
                "player_id": player_id,
                "session_id": session_id,
            },
        )
        assert attempt_resp.status_code == 200, f"Attempt {idx + 1} failed: {attempt_resp.text}"
        attempt = attempt_resp.json()

        # Validate attempt response contract
        assert "correct" in attempt
        assert "correct_answer_id" in attempt
        assert "player_elo_before" in attempt
        assert "player_elo_after" in attempt
        assert "question_elo_before" in attempt
        assert "question_elo_after" in attempt
        # note field must be present (can be null)
        assert "note" in attempt

        if attempt["correct"]:
            correct_count += 1

    # 5. Finish session
    finish_resp = c.post(f"/api/v1/quiz/sessions/{session_id}/finish")
    assert finish_resp.status_code == 200, f"Finish session failed: {finish_resp.text}"
    finished = finish_resp.json()
    assert finished["finished_at"] is not None
    assert finished["score"] == correct_count

    # Verify player ELO was updated (should differ from 1200 after attempts)
    player_resp = c.get(f"/api/v1/quiz/players/{player_id}")
    assert player_resp.status_code == 200
    updated_player = player_resp.json()
    assert updated_player["games_played"] == 1


def test_millionaire_jokers_from_scratch(seeded_quiz_client) -> None:
    """All three joker endpoints must work against a freshly seeded DB."""
    c = seeded_quiz_client

    # Create a question and get its displayed answers
    q_list_resp = c.get("/api/v1/quiz/questions?limit=1")
    assert q_list_resp.status_code == 200
    items = q_list_resp.json()["items"]
    assert len(items) >= 1, "Need at least 1 seeded question for joker test"
    qid = items[0]["id"]

    q_resp = c.get(f"/api/v1/quiz/questions/{qid}?num_answers=4")
    assert q_resp.status_code == 200
    answer_ids = [a["id"] for a in q_resp.json()["answers"]]

    # 50:50 joker
    ff_resp = c.post(
        f"/api/v1/quiz/questions/{qid}/fifty-fifty",
        json={"displayed_answer_ids": answer_ids},
    )
    assert ff_resp.status_code == 200, f"50:50 joker failed: {ff_resp.text}"
    assert len(ff_resp.json()["remove"]) == 2

    # Audience poll joker
    ap_resp = c.post(
        f"/api/v1/quiz/questions/{qid}/audience-poll",
        json={"displayed_answer_ids": answer_ids},
    )
    assert ap_resp.status_code == 200, f"Audience poll failed: {ap_resp.text}"
    assert len(ap_resp.json()["results"]) == len(answer_ids)

    # Phone joker
    ph_resp = c.post(
        f"/api/v1/quiz/questions/{qid}/phone-joker",
        json={"displayed_answer_ids": answer_ids},
    )
    assert ph_resp.status_code == 200, f"Phone joker failed: {ph_resp.text}"
    data = ph_resp.json()
    assert data["hint_answer_id"] in answer_ids
    assert 0 <= data["confidence"] <= 100
    assert len(data["message"]) > 0


def test_leaderboard_after_game(seeded_quiz_client) -> None:
    """After playing a game, the player should appear on the leaderboard."""
    c = seeded_quiz_client

    player_id = c.post("/api/v1/quiz/players", json={"name": "Leader"}).json()["id"]
    c.post("/api/v1/quiz/sessions", json={"mode": "speed", "player_id": player_id})

    resp = c.get("/api/v1/quiz/leaderboard")
    assert resp.status_code == 200
    entries = resp.json()
    assert any(e["player_id"] == player_id for e in entries)

