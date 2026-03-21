"""Quiz — Pydantic schemas for API request/response."""

import uuid

from pydantic import BaseModel, Field


# --- Answers ---

class AnswerIn(BaseModel):
    """An answer option when creating a question."""

    text: str = Field(..., max_length=500)
    is_correct: bool = False


class AnswerOut(BaseModel):
    """An answer option in a response."""

    id: uuid.UUID
    text: str
    is_correct: bool | None = None  # Hidden during gameplay


# --- Questions ---

class QuestionCreateIn(BaseModel):
    """Request to create a new question."""

    text: str = Field(..., max_length=1000)
    category_id: uuid.UUID | None = None
    tags: list[str] = Field(default_factory=list)
    answers: list[AnswerIn] = Field(..., min_length=2)
    media_url: str | None = None
    media_type: str | None = None
    created_by: str | None = None


class QuestionOut(BaseModel):
    """A question in a response."""

    id: uuid.UUID
    text: str
    category: str | None = None
    tags: list[str] = []
    elo_score: float
    media_url: str | None = None
    media_type: str | None = None
    answers: list[AnswerOut] = []


class QuestionListOut(BaseModel):
    """Paginated list of questions."""

    items: list[QuestionOut]
    total: int


# --- Attempts ---

class AttemptIn(BaseModel):
    """Request to submit an answer."""

    answer_id: uuid.UUID
    player_id: uuid.UUID
    session_id: uuid.UUID | None = None
    time_taken_ms: int | None = None


class AttemptOut(BaseModel):
    """Result of an answer attempt."""

    correct: bool
    correct_answer_id: uuid.UUID
    player_elo_before: float
    player_elo_after: float
    question_elo_before: float
    question_elo_after: float


# --- Categories ---

class CategoryIn(BaseModel):
    """Request to create a category."""

    name: str = Field(..., max_length=100)
    description: str = Field(default="", max_length=500)


class CategoryOut(BaseModel):
    """A category in a response."""

    id: uuid.UUID
    name: str
    description: str
    question_count: int = 0


# --- Tags ---

class TagOut(BaseModel):
    """A tag in a response."""

    id: uuid.UUID
    name: str
    question_count: int = 0


# --- Players ---

class PlayerCreateIn(BaseModel):
    """Request to create a player."""

    name: str = Field(..., max_length=100)


class PlayerOut(BaseModel):
    """A player in a response."""

    id: uuid.UUID
    name: str
    elo_score: float
    games_played: int
    correct_count: int


# --- Sessions ---

class SessionCreateIn(BaseModel):
    """Request to start a quiz session."""

    mode: str = Field(..., pattern="^(millionaire|duel)$")
    player_id: uuid.UUID


class SessionOut(BaseModel):
    """A quiz session in a response."""

    id: uuid.UUID
    mode: str
    player_id: uuid.UUID
    score: int


# --- Leaderboard ---

class LeaderboardEntry(BaseModel):
    """A single leaderboard entry."""

    rank: int
    player_id: uuid.UUID
    name: str
    elo_score: float
    games_played: int
    correct_count: int

