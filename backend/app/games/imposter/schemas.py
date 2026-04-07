"""Imposter — Pydantic schemas."""

import uuid

from pydantic import BaseModel, Field


class WordOut(BaseModel):
    """A word from the word list."""

    id: uuid.UUID
    text: str
    category: str
    source: str
    uploaded_by: str | None = None
    description: str | None = None


class WordReportIn(BaseModel):
    """Request to report an inappropriate word."""

    reason: str = Field(default="", max_length=500)


class WordReportOut(BaseModel):
    """Confirmation of a word report."""

    id: uuid.UUID
    word_id: uuid.UUID
    reason: str


class SessionCreateIn(BaseModel):
    """Request to create a new Imposter game session."""

    player_names: list[str] = Field(..., min_length=3, max_length=20)
    category: str | None = None
    timer_seconds: int = Field(default=300, ge=60, le=900)


class SessionOut(BaseModel):
    """Response with game session data."""

    id: uuid.UUID
    player_names: list[str]
    word: str
    word_details: WordOut
    imposter_index: int
    timer_seconds: int


class PlayerReveal(BaseModel):
    """What a single player sees when it's their turn."""

    player_name: str
    display: str  # Either the word or "IMPOSTER"
