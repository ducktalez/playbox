"""Quiz — ELO calculation engine."""

K_FACTOR = 32
BASE_ELO = 1200.0


def expected_score(player_elo: float, question_elo: float) -> float:
    """Calculate the expected probability of a correct answer."""
    return 1.0 / (1.0 + 10.0 ** ((question_elo - player_elo) / 400.0))


def update_elo(
    player_elo: float,
    question_elo: float,
    answered_correctly: bool,
) -> tuple[float, float]:
    """
    Calculate new ELO scores for player and question.

    Returns:
        (new_player_elo, new_question_elo)
    """
    expected = expected_score(player_elo, question_elo)

    if answered_correctly:
        new_player_elo = player_elo + K_FACTOR * (1.0 - expected)
        new_question_elo = question_elo - K_FACTOR * (1.0 - expected)
    else:
        new_player_elo = player_elo - K_FACTOR * expected
        new_question_elo = question_elo + K_FACTOR * expected

    return round(new_player_elo, 1), round(new_question_elo, 1)
