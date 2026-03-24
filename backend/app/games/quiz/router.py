"""Quiz — API router."""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_pg_session
from app.games.quiz.schemas import (
    AttemptIn,
    AttemptOut,
    CategoryIn,
    CategoryOut,
    LeaderboardEntry,
    PlayerCreateIn,
    PlayerOut,
    QuestionCreateIn,
    QuestionListOut,
    QuestionOut,
    SessionCreateIn,
    SessionOut,
    TagOut,
)
from app.games.quiz.service import QuizService

router = APIRouter()


def get_service(db: Session = Depends(get_pg_session)) -> QuizService:
    """Dependency: create a QuizService with a DB session."""
    return QuizService(db=db)


# --- Questions ---


@router.get("/questions", response_model=QuestionListOut)
async def list_questions(
    category_id: uuid.UUID | None = None,
    tag: str | None = None,
    elo_min: float | None = None,
    elo_max: float | None = None,
    balanced_categories: bool = Query(default=False),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    service: QuizService = Depends(get_service),
) -> QuestionListOut:
    """List questions with optional filters."""
    return service.list_questions(
        category_id=category_id,
        tag=tag,
        elo_min=elo_min,
        elo_max=elo_max,
        balanced_categories=balanced_categories,
        limit=limit,
        offset=offset,
    )


@router.post("/questions", response_model=QuestionOut)
async def create_question(body: QuestionCreateIn, service: QuizService = Depends(get_service)) -> QuestionOut:
    """Submit a new question with answers."""
    return service.create_question(data=body)


@router.get("/questions/{question_id}", response_model=QuestionOut)
async def get_question(
    question_id: uuid.UUID,
    num_answers: int = Query(default=4, ge=2, le=10),
    service: QuizService = Depends(get_service),
) -> QuestionOut:
    """Get a question with a randomized subset of answers."""
    return service.get_question(question_id=question_id, num_answers=num_answers)


@router.post("/questions/{question_id}/attempt", response_model=AttemptOut)
async def submit_attempt(
    question_id: uuid.UUID, body: AttemptIn, service: QuizService = Depends(get_service)
) -> AttemptOut:
    """Submit an answer attempt and get ELO update."""
    return service.submit_attempt(question_id=question_id, data=body)


# --- Categories ---


@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(service: QuizService = Depends(get_service)) -> list[CategoryOut]:
    """List all categories."""
    return service.list_categories()


@router.post("/categories", response_model=CategoryOut)
async def create_category(body: CategoryIn, service: QuizService = Depends(get_service)) -> CategoryOut:
    """Create a new category."""
    return service.create_category(data=body)


# --- Tags ---


@router.get("/tags", response_model=list[TagOut])
async def list_tags(service: QuizService = Depends(get_service)) -> list[TagOut]:
    """List all tags."""
    return service.list_tags()


# --- Players ---


@router.post("/players", response_model=PlayerOut)
async def create_player(body: PlayerCreateIn, service: QuizService = Depends(get_service)) -> PlayerOut:
    """Create a new player."""
    return service.create_player(data=body)


@router.get("/players/{player_id}", response_model=PlayerOut)
async def get_player(player_id: uuid.UUID, service: QuizService = Depends(get_service)) -> PlayerOut:
    """Get player profile and stats."""
    return service.get_player(player_id=player_id)


# --- Sessions ---


@router.post("/sessions", response_model=SessionOut)
async def create_session(body: SessionCreateIn, service: QuizService = Depends(get_service)) -> SessionOut:
    """Start a new quiz session."""
    return service.create_session(data=body)


@router.get("/sessions/{session_id}", response_model=SessionOut)
async def get_session(session_id: uuid.UUID, service: QuizService = Depends(get_service)) -> SessionOut:
    """Get session state."""
    return service.get_session(session_id=session_id)


@router.post("/sessions/{session_id}/finish", response_model=SessionOut)
async def finish_session(session_id: uuid.UUID, service: QuizService = Depends(get_service)) -> SessionOut:
    """Finish a quiz session and return its final state."""
    return service.finish_session(session_id=session_id)


# --- Leaderboard ---


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
async def leaderboard(
    limit: int = Query(default=10, ge=1, le=100),
    service: QuizService = Depends(get_service),
) -> list[LeaderboardEntry]:
    """Get the player leaderboard sorted by ELO."""
    return service.get_leaderboard(limit=limit)

