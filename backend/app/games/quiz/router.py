"""
╔════════════════════════════════════════════════════════════════════════════════╗
║                     QUIZ GAME — SHARED IMPLEMENTATION CORE                     ║
╚════════════════════════════════════════════════════════════════════════════════╝

GAME MODES:
  1. "Wer wird Elite-Haider" (Millionär)  — session mode: "millionaire"
     - Solo player (or async leaderboard)
     - 15 escalating difficulty questions
     - Track cumulative ELO score
     - GameOver when wrong or all 15 answered
  
  2. "Quizduell" (1v1 — Future)  — session mode: "duel"
     - 1v1 duel (future: multiplayer via WebSocket)
     - 10 alternating questions per player
     - Category selection pre-game
     - ELO-based matchmaking (future)
     - Winner: most correct answers

  3. "Single Player" (Speed Mode)  — session mode: "speed"
     - Solo player races against 20-second countdown timer
     - 10 rapid-fire questions
     - Must answer within time limit or counts as wrong
     - Manual tap to advance (no auto-advance)
     - Track cumulative ELO delta from attempts

QUESTION FEATURES:
  - Optional background: shown after answering (hidden during gameplay)
  - ELO score per question: tracks difficulty
  - Media attachments: images, video, documents (URL-referenced)

SHARED CORE FLOW:
  ┌─────────────────────────────────────────────────────────────────┐
  │ 1. SELECT MODE        → choose game variant                    │
  │ 2. CREATE GUEST PLAYER → auto-generate "Gast" or login (TO-DO)  │
  │ 3. CREATE SESSION      → mode + player_id → session state      │
  │ 4. LOAD QUESTIONS      → fetch N questions based on mode        │
  │ 5. QUESTION LOOP:                                              │
  │    - Display question + 4 answers (A/B/C/D colored)            │
  │    - Player selects answer (or timeout in speed mode)          │
  │    - Submit attempt → get ELO delta + result + background      │
  │    - Show feedback (correct/wrong, ELO, background if any)     │
  │    - Player taps "Nächste Frage" to advance                    │
  │ 6. END GAME            → finish session, show final ELO/score  │
  │ 7. RESULTS             → show stats, leaderboard, play again   │
  └─────────────────────────────────────────────────────────────────┘

SHARED API CONTRACTS:
  POST   /api/v1/quiz/players              → Create guest/temp player
  POST   /api/v1/quiz/sessions             → Create session (mode + player_id)
  GET    /api/v1/quiz/questions            → List / filter / order questions
  GET    /api/v1/quiz/questions/{id}       → Get question + randomized answers (background hidden)
  POST   /api/v1/quiz/questions/{id}/attempt → Submit answer + get ELO update + background

SHARED API CONTRACTS:
  POST   /api/v1/quiz/players              → Create guest/temp player
  POST   /api/v1/quiz/sessions             → Create session (mode + player_id)
  GET    /api/v1/quiz/questions?limit=N    → Fetch N questions (balanced by category)
  GET    /api/v1/quiz/questions/{id}       → Get single question with 4 answers
  POST   /api/v1/quiz/questions/{id}/attempt → Submit answer + get ELO update + explanation
  POST   /api/v1/quiz/sessions/{id}/finish → Finish session, update player stats

GAME-SPECIFIC DIFFERENCES:
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ Aspekt                  │ Millionär       │ Quizduell 1v1 │ Single Player│
  ├──────────────────────────────────────────────────────────────────────────┤
  │ Session Mode            │ "millionaire"   │ "duel"        │ "speed"      │
  │ Players                 │ 1 (solo)        │ 2 (vs)        │ 1 (solo)     │
  │ Question Count          │ 15              │ 10 each       │ 10           │
  │ Time Limit/Question     │ None            │ None          │ 20s          │
  │ Difficulty Progression  │ Ascending ELO   │ Random        │ Random       │
  │ Advance                 │ Manual tap      │ Manual tap    │ Manual tap   │
  │ Leaderboard Tracking    │ Yes             │ Yes (wins)    │ Yes (ELO)    │
  └──────────────────────────────────────────────────────────────────────────┘

FUTURE ENHANCEMENTS:
  • Proper authentication (replace "Gast" with real accounts)
  • Real-time 1v1 Quizduell via WebSocket
  • Lifelines in Millionär mode
  • Category filtering / tag-based sessions
  • Media attachments in questions (images, video clips)
  • Difficulty badges based on ELO ranges
  • Tournament/bracket mode
"""

"""Quiz — API router."""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_pg_session
from app.games.quiz.schemas import (
    AttemptIn,
    AttemptOut,
    AudiencePollIn,
    AudiencePollOut,
    CategoryIn,
    CategoryOut,
    FiftyFiftyIn,
    FiftyFiftyOut,
    LeaderboardEntry,
    PhoneJokerOut,
    PlayerCreateIn,
    PlayerOut,
    PlayerProfileOut,
    QuestionCreateIn,
    QuestionListOut,
    QuestionOut,
    QuestionUpdateIn,
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
    order_by_elo: str | None = Query(default=None, pattern="^(asc|desc)$"),
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
        order_by_elo=order_by_elo,
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


@router.patch("/questions/{question_id}", response_model=QuestionOut)
async def update_question(
    question_id: uuid.UUID, body: QuestionUpdateIn, service: QuizService = Depends(get_service)
) -> QuestionOut:
    """Update mutable fields of an existing question."""
    return service.update_question(question_id=question_id, data=body)


@router.delete("/questions/{question_id}", response_model=QuestionOut)
async def delete_question(
    question_id: uuid.UUID, service: QuizService = Depends(get_service)
) -> QuestionOut:
    """Soft-delete a question (sets deleted_at)."""
    return service.delete_question(question_id=question_id)


@router.post("/questions/{question_id}/attempt", response_model=AttemptOut)
async def submit_attempt(
    question_id: uuid.UUID, body: AttemptIn, service: QuizService = Depends(get_service)
) -> AttemptOut:
    """Submit an answer attempt and get ELO update."""
    return service.submit_attempt(question_id=question_id, data=body)


# --- Jokers (Millionaire lifelines) ---


@router.post("/questions/{question_id}/fifty-fifty", response_model=FiftyFiftyOut)
async def fifty_fifty(
    question_id: uuid.UUID, body: FiftyFiftyIn, service: QuizService = Depends(get_service)
) -> FiftyFiftyOut:
    """Use the 50:50 joker to remove two wrong answers."""
    return service.fifty_fifty(question_id=question_id, data=body)


@router.post("/questions/{question_id}/audience-poll", response_model=AudiencePollOut)
async def audience_poll(
    question_id: uuid.UUID, body: AudiencePollIn, service: QuizService = Depends(get_service)
) -> AudiencePollOut:
    """Use the audience poll joker to get vote percentages."""
    return service.audience_poll(question_id=question_id, data=body)


@router.post("/questions/{question_id}/phone-joker", response_model=PhoneJokerOut)
async def phone_joker(
    question_id: uuid.UUID, body: AudiencePollIn, service: QuizService = Depends(get_service)
) -> PhoneJokerOut:
    """Use the phone joker to get Drachenlord's hint."""
    return service.phone_joker(question_id=question_id, data=body)


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


@router.get("/players/{player_id}/profile", response_model=PlayerProfileOut)
async def get_player_profile(player_id: uuid.UUID, service: QuizService = Depends(get_service)) -> PlayerProfileOut:
    """Get extended player profile with accuracy and recent session history."""
    return service.get_player_profile(player_id=player_id)


@router.get("/players/{player_id}/sessions", response_model=list[SessionOut])
async def get_player_sessions(
    player_id: uuid.UUID,
    limit: int = Query(default=20, ge=1, le=100),
    service: QuizService = Depends(get_service),
) -> list[SessionOut]:
    """List sessions for a player (newest first)."""
    return service.get_player_sessions(player_id=player_id, limit=limit)


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

