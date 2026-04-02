"""Quiz — SQLAlchemy / SQLModel models."""

import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, Text
from sqlmodel import Field, Relationship, SQLModel


class QuestionTag(SQLModel, table=True):
    """Junction table: question ↔ tag."""

    __tablename__ = "question_tags"

    question_id: uuid.UUID = Field(foreign_key="questions.id", primary_key=True)
    tag_id: uuid.UUID = Field(foreign_key="tags.id", primary_key=True)


class Category(SQLModel, table=True):
    """Quiz question category."""

    __tablename__ = "categories"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=100, unique=True)
    description: str = Field(default="", max_length=500)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime | None = Field(default=None)

    questions: list["Question"] = Relationship(back_populates="category")


class Tag(SQLModel, table=True):
    """Free-form tag for quiz questions."""

    __tablename__ = "tags"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=100, unique=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    questions: list["Question"] = Relationship(back_populates="tags", link_model=QuestionTag)


class Question(SQLModel, table=True):
    """A quiz question."""

    __tablename__ = "questions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    text: str = Field(max_length=1000)
    note: str | None = Field(default=None, max_length=2000)  # optional hint shown after answering
    category_id: uuid.UUID | None = Field(default=None, foreign_key="categories.id")
    elo_score: float = Field(default=1200.0)
    # WWM difficulty level 1–15 (0 = unrated / special); null = not assigned yet
    wwm_difficulty: int | None = Field(default=None, ge=0, le=15)
    # ISO 639-1 language code; "de" = German (default), "en" = English
    language: str = Field(default="de", max_length=5)
    # True if the question is designed as a Wortspiel/pun (used to select Q1 in Millionär)
    is_pun: bool = Field(default=False)
    media_url: str | None = Field(default=None, max_length=500)
    media_type: str | None = Field(default=None, max_length=50)  # image, video, document
    created_by: str | None = Field(default=None, max_length=200)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime | None = Field(default=None)
    deleted_at: datetime | None = Field(default=None)  # Soft delete

    category: Category | None = Relationship(back_populates="questions")
    answers: list["Answer"] = Relationship(back_populates="question")
    tags: list[Tag] = Relationship(back_populates="questions", link_model=QuestionTag)


class Answer(SQLModel, table=True):
    """An answer option for a quiz question."""

    __tablename__ = "answers"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    question_id: uuid.UUID = Field(foreign_key="questions.id")
    text: str = Field(max_length=500)
    is_correct: bool = Field(default=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    question: Question = Relationship(back_populates="answers")


class Player(SQLModel, table=True):
    """A quiz player (lightweight, no auth)."""

    __tablename__ = "players"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=100)
    elo_score: float = Field(default=1200.0)
    games_played: int = Field(default=0)
    correct_count: int = Field(default=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime | None = Field(default=None)


class GameSession(SQLModel, table=True):
    """A quiz game session."""

    __tablename__ = "game_sessions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    mode: str = Field(max_length=50)  # "millionaire", "duel", or "speed"
    player_id: uuid.UUID = Field(foreign_key="players.id")
    score: int = Field(default=0)
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    finished_at: datetime | None = Field(default=None)


class QuestionAttempt(SQLModel, table=True):
    """Record of a player's attempt at a question."""

    __tablename__ = "question_attempts"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    session_id: uuid.UUID = Field(foreign_key="game_sessions.id")
    question_id: uuid.UUID = Field(foreign_key="questions.id")
    player_id: uuid.UUID = Field(foreign_key="players.id")
    answered_correctly: bool = Field(default=False)
    time_taken_ms: int | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class QuestionFeedback(SQLModel, table=True):
    """Player feedback / report on a quiz question."""

    __tablename__ = "question_feedback"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    question_id: uuid.UUID = Field(foreign_key="questions.id")
    player_id: uuid.UUID | None = Field(default=None, foreign_key="players.id")
    session_id: uuid.UUID | None = Field(default=None, foreign_key="game_sessions.id")
    # THUMBS_UP, THUMBS_DOWN, REPORT
    feedback_type: str = Field(max_length=20)
    # Optional follow-up category, e.g. TOO_HARD, PROBLEM_WITH_ANSWERS, ...
    # Stored as comma-separated set for multi-select (e.g. "PROBLEM_WITH_ANSWERS,TOO_HARD")
    category: str | None = Field(default=None, max_length=200)
    # Free-text comment (future use)
    comment: str | None = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class OrderingQuestion(SQLModel, table=True):
    """A question where answers must be placed in the correct order (WWM Kandidatenfrage)."""

    __tablename__ = "ordering_questions"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    text: str = Field(max_length=1000)
    # JSON-serialized list of answer strings in the correct order.
    # Example: '["First", "Second", "Third", "Fourth"]'
    ordered_answers_json: str = Field(sa_column=Column("ordered_answers_json", Text, nullable=False))
    language: str = Field(default="de", max_length=5)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def ordered_answers(self) -> list[str]:
        """Deserialize the ordered answers from JSON."""
        return json.loads(self.ordered_answers_json)

    @ordered_answers.setter
    def ordered_answers(self, value: list[str]) -> None:
        """Serialize the ordered answers to JSON."""
        self.ordered_answers_json = json.dumps(value, ensure_ascii=False)


