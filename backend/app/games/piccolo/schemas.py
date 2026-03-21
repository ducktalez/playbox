"""Piccolo — Pydantic schemas."""

import uuid

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


class ChallengeOut(BaseModel):
    """A single challenge to display."""

    text: str
    category: str
    intensity: str
    targets: list[str]  # Player names referenced in this challenge

