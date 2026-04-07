"""Tests for the ELO calculation engine."""

from app.games.quiz.elo import BASE_ELO, expected_score, update_elo


def test_expected_score_equal_elo() -> None:
    """Equal ELO should give 50% expected score."""
    result = expected_score(1200, 1200)
    assert abs(result - 0.5) < 0.001


def test_expected_score_higher_player() -> None:
    """Higher player ELO should give > 50% expected score."""
    result = expected_score(1400, 1200)
    assert result > 0.5


def test_expected_score_lower_player() -> None:
    """Lower player ELO should give < 50% expected score."""
    result = expected_score(1000, 1200)
    assert result < 0.5


def test_update_elo_correct_equal() -> None:
    """Correct answer with equal ELO should increase player, decrease question."""
    player_new, question_new = update_elo(1200, 1200, answered_correctly=True)
    assert player_new > 1200
    assert question_new < 1200


def test_update_elo_wrong_equal() -> None:
    """Wrong answer with equal ELO should decrease player, increase question."""
    player_new, question_new = update_elo(1200, 1200, answered_correctly=False)
    assert player_new < 1200
    assert question_new > 1200


def test_update_elo_symmetry() -> None:
    """ELO changes should be symmetric (what player gains, question loses)."""
    player_new, question_new = update_elo(1200, 1200, answered_correctly=True)
    player_delta = player_new - 1200
    question_delta = 1200 - question_new
    assert abs(player_delta - question_delta) < 0.2


def test_update_elo_upset_gives_bigger_change() -> None:
    """Answering a hard question correctly should give a bigger ELO boost."""
    # Easy question (player much higher)
    p1, _ = update_elo(1500, 1000, answered_correctly=True)
    easy_gain = p1 - 1500

    # Hard question (player much lower)
    p2, _ = update_elo(1000, 1500, answered_correctly=True)
    hard_gain = p2 - 1000

    assert hard_gain > easy_gain


def test_base_elo_constant() -> None:
    """Base ELO should be 1200."""
    assert BASE_ELO == 1200.0
