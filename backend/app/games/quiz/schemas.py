"""Quiz — Pydantic schemas for API request/response."""

import uuid
from datetime import datetime

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
    note: str | None = Field(default=None, max_length=2000)
    category_id: uuid.UUID | None = None
    tags: list[str] = Field(default_factory=list)
    answers: list[AnswerIn] = Field(..., min_length=2)
    wwm_difficulty: int | None = Field(default=None, ge=0, le=15)
    language: str = Field(default="de", max_length=5)
    is_pun: bool = False
    media_url: str | None = None
    media_type: str | None = None
    created_by: str | None = None


class QuestionOut(BaseModel):
    """A question in a response."""

    id: uuid.UUID
    text: str
    note: str | None = None
    category: str | None = None
    tags: list[str] = []
    elo_score: float
    difficulty: str | None = None  # EASY / MEDIUM / HARD — computed from elo_score
    wwm_difficulty: int | None = None
    language: str = "de"
    is_pun: bool = False
    media_url: str | None = None
    media_type: str | None = None
    moderation_status: str = "APPROVED"  # PENDING / APPROVED / REJECTED
    answers: list[AnswerOut] = []


class QuestionUpdateIn(BaseModel):
    """Request to update a question (partial update)."""

    text: str | None = Field(default=None, max_length=1000)
    note: str | None = Field(default=None, max_length=2000)
    category_id: uuid.UUID | None = None
    wwm_difficulty: int | None = Field(default=None, ge=0, le=15)
    language: str | None = Field(default=None, max_length=5)
    is_pun: bool | None = None
    media_url: str | None = None
    media_type: str | None = None


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
    note: str | None = None
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


class PlayerProfileOut(BaseModel):
    """Extended player profile with session history."""

    id: uuid.UUID
    name: str
    elo_score: float
    games_played: int
    correct_count: int
    accuracy: float  # correct_count / total_attempts (0.0 if none)
    recent_sessions: list["SessionOut"]


# --- Sessions ---


class SessionCreateIn(BaseModel):
    """Request to start a quiz session."""

    mode: str = Field(..., pattern="^(millionaire|duel|speed)$")
    player_id: uuid.UUID


class SessionOut(BaseModel):
    """A quiz session in a response."""

    id: uuid.UUID
    mode: str
    player_id: uuid.UUID
    score: int
    finished_at: datetime | None = None


# --- Leaderboard ---


class LeaderboardEntry(BaseModel):
    """A single leaderboard entry."""

    rank: int
    player_id: uuid.UUID
    name: str
    elo_score: float
    games_played: int
    correct_count: int


# --- Jokers (Millionaire lifelines) ---


class FiftyFiftyIn(BaseModel):
    """Request for 50:50 joker — pass the currently displayed answer IDs."""

    displayed_answer_ids: list[uuid.UUID] = Field(..., min_length=3, max_length=6)


class FiftyFiftyOut(BaseModel):
    """Result of 50:50 joker — two wrong answer IDs to hide."""

    remove: list[uuid.UUID]


class AudiencePollEntry(BaseModel):
    """A single answer in the audience poll result."""

    answer_id: uuid.UUID
    percentage: int


class AudiencePollIn(BaseModel):
    """Request for audience poll joker."""

    displayed_answer_ids: list[uuid.UUID] = Field(..., min_length=2, max_length=6)


class AudiencePollOut(BaseModel):
    """Result of audience poll joker — percentage distribution."""

    results: list[AudiencePollEntry]


class PhoneJokerOut(BaseModel):
    """Result of phone joker — Drachenlord's hint."""

    hint_answer_id: uuid.UUID
    confidence: int
    message: str


# --- Media ---


class MediaUploadOut(BaseModel):
    """Response after uploading media to a question."""

    media_url: str
    media_type: str


# --- Bulk Import ---


class BulkImportOut(BaseModel):
    """Summary returned after a bulk question import."""

    created_categories: int
    created_tags: int
    created_questions: int
    skipped_questions: int


# --- Ordering Questions (WWM Kandidatenfrage) ---


# --- Question Feedback ---

# Allowed follow-up categories per feedback type
THUMBS_DOWN_CATEGORIES = {
    "PROBLEM_WITH_QUESTION",
    "PROBLEM_WITH_ANSWERS",
    "TOO_HARD",
    "TOO_EASY",
    "NOT_A_GOOD_QUESTION",
    "DUPLICATE",
}

REPORT_CATEGORIES = {
    "QUESTION_INACCURATE",
    "ANSWER_INCORRECT",
    "OFFENSIVE_CONTENT",
    "OTHER",
}

FEEDBACK_TYPES = {"THUMBS_UP", "THUMBS_DOWN", "REPORT"}


class QuestionFeedbackIn(BaseModel):
    """Request to submit feedback on a question."""

    feedback_type: str = Field(..., description="THUMBS_UP, THUMBS_DOWN, or REPORT")
    category: str | None = Field(default=None, max_length=200, description="Comma-separated set of reason categories")
    comment: str | None = Field(default=None, max_length=500)
    player_id: uuid.UUID | None = None
    session_id: uuid.UUID | None = None


class QuestionFeedbackOut(BaseModel):
    """Feedback entry in a response."""

    id: uuid.UUID
    question_id: uuid.UUID
    feedback_type: str
    category: str | None = None
    comment: str | None = None
    created_at: datetime


# --- Ordering Questions (WWM Kandidatenfrage) ---


class OrderingQuestionOut(BaseModel):
    """An ordering question with shuffled answers."""

    id: uuid.UUID
    text: str
    shuffled_answers: list[str]


class OrderingCheckIn(BaseModel):
    """Request to validate an ordering attempt."""

    submitted_order: list[str] = Field(..., min_length=2, description="Answers in the order the player selected them")
    time_taken_ms: int | None = Field(default=None, ge=0, description="Time the player took in milliseconds")


class OrderingCheckOut(BaseModel):
    """Result of an ordering question check."""

    correct: bool
    correct_order: list[str]
    time_taken_ms: int | None = None


# --- ELO History ---


class EloHistoryEntryOut(BaseModel):
    """A single ELO change event."""

    id: uuid.UUID
    question_id: uuid.UUID
    session_id: uuid.UUID | None = None
    elo_before: float
    elo_after: float
    answered_correctly: bool
    created_at: datetime


# --- Moderation ---

MODERATION_STATUSES = {"PENDING", "APPROVED", "REJECTED"}


class ModerationActionIn(BaseModel):
    """Request to approve or reject a question."""

    status: str = Field(..., description="APPROVED or REJECTED")
    reason: str | None = Field(default=None, max_length=500)
