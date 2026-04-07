"""Tests for the Chess game API (uses in-memory storage, no DB needed)."""

import uuid

from app.games.chess.engine import StandardEngine

# --- Engine unit tests ---


def test_standard_engine_initial_state() -> None:
    """StandardEngine should start with a valid initial FEN and white to move."""
    engine = StandardEngine()
    assert "rnbqkbnr/pppppppp" in engine.get_fen()
    assert engine.turn() == "WHITE"
    assert not engine.is_check()
    assert not engine.is_checkmate()
    assert not engine.is_game_over()


def test_standard_engine_legal_moves() -> None:
    """Initial position should have 20 legal moves for white."""
    engine = StandardEngine()
    moves = engine.legal_moves()
    assert len(moves) == 20  # 16 pawn + 4 knight moves


def test_standard_engine_push_move() -> None:
    """Pushing e2e4 should change the turn and update legal moves."""
    engine = StandardEngine()
    captured = engine.push_move("e2e4")
    assert captured is None
    assert engine.turn() == "BLACK"
    assert "e2e4" not in engine.legal_moves()  # no longer valid


def test_standard_engine_illegal_move() -> None:
    """Pushing an illegal move should raise ValueError."""
    import pytest

    engine = StandardEngine()
    with pytest.raises(ValueError):
        engine.push_move("e2e5")  # not a legal pawn move


def test_standard_engine_capture() -> None:
    """A capture should return the captured piece symbol."""
    engine = StandardEngine()
    engine.push_move("e2e4")  # white
    engine.push_move("d7d5")  # black
    captured = engine.push_move("e4d5")  # white captures black pawn
    assert captured == "♟"  # black pawn symbol


def test_standard_engine_scholars_mate() -> None:
    """Scholar's mate should result in checkmate."""
    engine = StandardEngine()
    engine.push_move("e2e4")
    engine.push_move("e7e5")
    engine.push_move("d1h5")
    engine.push_move("b8c6")
    engine.push_move("f1c4")
    engine.push_move("g8f6")
    engine.push_move("h5f7")  # checkmate!
    assert engine.is_checkmate()
    assert engine.is_game_over()


# --- API endpoint tests ---


def test_create_game(client) -> None:
    """POST /api/v1/chess/games should create a standard game."""
    resp = client.post("/api/v1/chess/games", json={})
    assert resp.status_code == 200
    data = resp.json()
    assert data["variant"] == "STANDARD"
    assert data["status"] == "ACTIVE"
    assert data["turn"] == "WHITE"
    assert data["player_white"] == "Player 1"
    assert data["player_black"] == "Player 2"
    assert len(data["legal_moves"]) == 20


def test_create_game_with_names(client) -> None:
    """POST with player names should use them."""
    resp = client.post(
        "/api/v1/chess/games",
        json={
            "player_white": "Alice",
            "player_black": "Bob",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["player_white"] == "Alice"
    assert resp.json()["player_black"] == "Bob"


def test_create_game_variant_not_implemented(client) -> None:
    """POST with MINI_6X8 should return 501 (not yet implemented)."""
    resp = client.post("/api/v1/chess/games", json={"variant": "MINI_6X8"})
    assert resp.status_code == 501
    assert resp.json()["code"] == "VARIANT_NOT_IMPLEMENTED"


def test_create_game_invalid_variant(client) -> None:
    """POST with unknown variant should return 422."""
    resp = client.post("/api/v1/chess/games", json={"variant": "MEGA_12X12"})
    assert resp.status_code == 422
    assert resp.json()["code"] == "INVALID_VARIANT"


def test_get_game(client) -> None:
    """GET /api/v1/chess/games/{id} should return the game state."""
    create_resp = client.post("/api/v1/chess/games", json={})
    game_id = create_resp.json()["id"]
    resp = client.get(f"/api/v1/chess/games/{game_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == game_id
    assert resp.json()["status"] == "ACTIVE"


def test_get_game_not_found(client) -> None:
    """GET with unknown ID should return 404."""
    resp = client.get(f"/api/v1/chess/games/{uuid.uuid4()}")
    assert resp.status_code == 404
    assert resp.json()["code"] == "GAME_NOT_FOUND"


def test_make_move(client) -> None:
    """POST /games/{id}/move should apply the move and switch turns."""
    game = client.post("/api/v1/chess/games", json={}).json()
    resp = client.post(f"/api/v1/chess/games/{game['id']}/move", json={"uci": "e2e4"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["game"]["turn"] == "BLACK"
    assert data["captured"] is None
    assert "e2e4" in data["game"]["move_history"]


def test_make_move_capture(client) -> None:
    """A capture move should return the captured piece."""
    game = client.post("/api/v1/chess/games", json={}).json()
    gid = game["id"]
    client.post(f"/api/v1/chess/games/{gid}/move", json={"uci": "e2e4"})
    client.post(f"/api/v1/chess/games/{gid}/move", json={"uci": "d7d5"})
    resp = client.post(f"/api/v1/chess/games/{gid}/move", json={"uci": "e4d5"})
    assert resp.status_code == 200
    assert resp.json()["captured"] is not None


def test_make_invalid_move(client) -> None:
    """An illegal move should return 422 with INVALID_MOVE code."""
    game = client.post("/api/v1/chess/games", json={}).json()
    resp = client.post(f"/api/v1/chess/games/{game['id']}/move", json={"uci": "e2e5"})
    assert resp.status_code == 422
    assert resp.json()["code"] == "INVALID_MOVE"


def test_make_move_game_not_found(client) -> None:
    """Move on nonexistent game should return 404."""
    resp = client.post(f"/api/v1/chess/games/{uuid.uuid4()}/move", json={"uci": "e2e4"})
    assert resp.status_code == 404


def test_scholars_mate_via_api(client) -> None:
    """Full Scholar's Mate game should end in CHECKMATE."""
    game = client.post("/api/v1/chess/games", json={}).json()
    gid = game["id"]
    client.post(f"/api/v1/chess/games/{gid}/move", json={"uci": "e2e4"})
    client.post(f"/api/v1/chess/games/{gid}/move", json={"uci": "e7e5"})
    client.post(f"/api/v1/chess/games/{gid}/move", json={"uci": "d1h5"})
    client.post(f"/api/v1/chess/games/{gid}/move", json={"uci": "b8c6"})
    client.post(f"/api/v1/chess/games/{gid}/move", json={"uci": "f1c4"})
    client.post(f"/api/v1/chess/games/{gid}/move", json={"uci": "g8f6"})
    resp = client.post(f"/api/v1/chess/games/{gid}/move", json={"uci": "h5f7"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_checkmate"] is True
    assert data["game"]["status"] == "CHECKMATE"
    assert data["game"]["legal_moves"] == []


def test_move_after_checkmate(client) -> None:
    """Attempting a move after checkmate should return 400 GAME_ALREADY_OVER."""
    game = client.post("/api/v1/chess/games", json={}).json()
    gid = game["id"]
    for uci in ["e2e4", "e7e5", "d1h5", "b8c6", "f1c4", "g8f6", "h5f7"]:
        client.post(f"/api/v1/chess/games/{gid}/move", json={"uci": uci})
    resp = client.post(f"/api/v1/chess/games/{gid}/move", json={"uci": "a2a3"})
    assert resp.status_code == 400
    assert resp.json()["code"] == "GAME_ALREADY_OVER"


def test_resign(client) -> None:
    """POST /games/{id}/resign should mark the game as RESIGNED."""
    game = client.post("/api/v1/chess/games", json={}).json()
    resp = client.post(
        f"/api/v1/chess/games/{game['id']}/resign",
        json={"color": "WHITE"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "RESIGNED"
    assert resp.json()["legal_moves"] == []


def test_resign_invalid_color(client) -> None:
    """Resign with invalid color should return 422."""
    game = client.post("/api/v1/chess/games", json={}).json()
    resp = client.post(
        f"/api/v1/chess/games/{game['id']}/resign",
        json={"color": "RED"},
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "INVALID_COLOR"


def test_resign_after_game_over(client) -> None:
    """Resigning an already-finished game should return 400."""
    game = client.post("/api/v1/chess/games", json={}).json()
    client.post(f"/api/v1/chess/games/{game['id']}/resign", json={"color": "BLACK"})
    resp = client.post(f"/api/v1/chess/games/{game['id']}/resign", json={"color": "WHITE"})
    assert resp.status_code == 400
    assert resp.json()["code"] == "GAME_ALREADY_OVER"


def test_list_games(client) -> None:
    """GET /api/v1/chess/games should list created games."""
    client.post("/api/v1/chess/games", json={})
    client.post("/api/v1/chess/games", json={})
    resp = client.get("/api/v1/chess/games")
    assert resp.status_code == 200
    assert len(resp.json()) >= 2


def test_status_endpoint(client) -> None:
    """GET /api/v1/chess/status should return active status."""
    resp = client.get("/api/v1/chess/status")
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"


def test_check_status(client) -> None:
    """A move that gives check should set status to CHECK."""
    game = client.post("/api/v1/chess/games", json={}).json()
    gid = game["id"]
    # Set up a position where white gives check
    client.post(f"/api/v1/chess/games/{gid}/move", json={"uci": "e2e4"})
    client.post(f"/api/v1/chess/games/{gid}/move", json={"uci": "f7f6"})
    client.post(f"/api/v1/chess/games/{gid}/move", json={"uci": "d1h5"})  # check!
    resp = client.get(f"/api/v1/chess/games/{gid}")
    data = resp.json()
    assert data["status"] == "CHECK"
