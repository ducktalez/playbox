"""Piccolo — Pydantic schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class SessionCreateIn(BaseModel):
    """Request to create a new Piccolo game session."""

    player_names: list[str] = Field(..., min_length=2, max_length=20)
    intensity: str = Field(default="medium", pattern="^(mild|medium|spicy)$")
    categories: list[str] | None = None


class SessionOut(BaseModel):
    """Response with session data."""

    id: uuid.UUID
    player_names: list[str]
    intensity: str
    total_challenges: int


class ChallengeTemplateOut(BaseModel):
    """A raw challenge template (before player name substitution)."""

    text: str
    category: str
    intensity: str
    target_count: int


class ChallengeOut(BaseModel):
    """A single challenge to display."""

    text: str
    category: str
    intensity: str
    targets: list[str]  # Player names referenced in this challenge


# --- Challenge Feedback (Cross-Game Content Reporting) ---

FEEDBACK_TYPES = {"THUMBS_UP", "THUMBS_DOWN", "REPORT"}

REPORT_CATEGORIES = {"INAPPROPRIATE", "BORING", "BROKEN_TEMPLATE", "OTHER"}


class ChallengeFeedbackIn(BaseModel):
    """Request to submit feedback on a challenge template."""

    challenge_text: str = Field(..., min_length=1, max_length=500, description="Original template text identifying the challenge")
    feedback_type: str = Field(..., description="THUMBS_UP, THUMBS_DOWN, or REPORT")
    category: str | None = Field(default=None, max_length=200, description="Comma-separated set of reason categories (required for REPORT)")
    comment: str | None = Field(default=None, max_length=500)


class ChallengeFeedbackOut(BaseModel):
    """Feedback entry in a response."""

    id: uuid.UUID
    challenge_text: str
    feedback_type: str
    category: str | None = None
    comment: str | None = None
    created_at: datetime
