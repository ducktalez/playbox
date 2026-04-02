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

from fastapi import APIRouter, Depends, Header, Query, UploadFile, File
from sqlalchemy.orm import Session

from app.core.database import get_pg_session
from app.core.errors import AppError
from app.games.quiz.schemas import (
    AttemptIn,
    AttemptOut,
    AudiencePollIn,
    AudiencePollOut,
    BulkImportOut,
    CategoryIn,
    CategoryOut,
    EloHistoryEntryOut,
    FiftyFiftyIn,
    FiftyFiftyOut,
    LeaderboardEntry,
    ModerationActionIn,
    MediaUploadOut,
    OrderingCheckIn,
    OrderingCheckOut,
    OrderingQuestionOut,
    PhoneJokerOut,
    PlayerCreateIn,
    PlayerOut,
    PlayerProfileOut,
    QuestionCreateIn,
    QuestionFeedbackIn,
    QuestionFeedbackOut,
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
    language: str | None = Query(default=None, max_length=5, description="ISO 639-1 language filter, e.g. 'de' or 'en'"),
    elo_min: float | None = None,
    elo_max: float | None = None,
    balanced_categories: bool = Query(default=False),
    order_by_elo: str | None = Query(default=None, pattern="^(asc|desc)$"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    pun_first: bool = Query(default=False, description="Ensure the first question is a Wortspiel/pun (is_pun=True) when one exists"),
    randomize: bool = Query(default=False, description="Randomly sample from ELO bands for question variety across games"),
    service: QuizService = Depends(get_service),
) -> QuestionListOut:
    """List questions with optional filters."""
    return service.list_questions(
        category_id=category_id,
        tag=tag,
        language=language,
        elo_min=elo_min,
        elo_max=elo_max,
        balanced_categories=balanced_categories,
        order_by_elo=order_by_elo,
        limit=limit,
        offset=offset,
        pun_first=pun_first,
        randomize=randomize,
    )


@router.post("/questions", response_model=QuestionOut)
async def create_question(body: QuestionCreateIn, service: QuizService = Depends(get_service)) -> QuestionOut:
    """Create a new question with answers (admin — auto-approved)."""
    return service.create_question(data=body, approved=True)


@router.post("/questions/submit", response_model=QuestionOut)
async def submit_question(body: QuestionCreateIn, service: QuizService = Depends(get_service)) -> QuestionOut:
    """Submit a user-created question for moderation (starts as PENDING)."""
    return service.create_question(data=body, approved=False)


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


# --- Bulk Import ---


@router.post("/questions/import", response_model=BulkImportOut)
async def bulk_import(
    body: dict,
    service: QuizService = Depends(get_service),
) -> BulkImportOut:
    """Import questions in bulk (same JSON format as seed_questions.yaml).

    Accepts: ``{ categories: [...], questions: [...], ordering_questions: [...] }``
    Deduplicates by question text — existing questions are skipped.
    """
    # TODO: post-dev — add admin API-key guard
    return service.bulk_import(payload=body)


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


# --- Media ---


@router.post("/questions/{question_id}/media", response_model=MediaUploadOut)
async def upload_media(
    question_id: uuid.UUID,
    file: UploadFile = File(...),
    service: QuizService = Depends(get_service),
) -> MediaUploadOut:
    """Upload a media file (image, video, document) for a question."""
    return await service.upload_media(question_id=question_id, file=file)


@router.delete("/questions/{question_id}/media", response_model=QuestionOut)
async def delete_media(
    question_id: uuid.UUID, service: QuizService = Depends(get_service)
) -> QuestionOut:
    """Remove media from a question."""
    return service.delete_media(question_id=question_id)


# --- Question Feedback ---


@router.post("/questions/{question_id}/feedback", response_model=QuestionFeedbackOut)
async def submit_feedback(
    question_id: uuid.UUID,
    body: QuestionFeedbackIn,
    service: QuizService = Depends(get_service),
) -> QuestionFeedbackOut:
    """Submit feedback (thumbs up/down or report) on a question."""
    return service.submit_feedback(question_id=question_id, data=body)


@router.get("/questions/{question_id}/feedback", response_model=list[QuestionFeedbackOut])
async def list_feedback(
    question_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    service: QuizService = Depends(get_service),
) -> list[QuestionFeedbackOut]:
    """List feedback entries for a question (newest first)."""
    return service.list_feedback(question_id=question_id, limit=limit, offset=offset)


# --- Ordering Questions (WWM Kandidatenfrage) ---


@router.get("/ordering-question", response_model=OrderingQuestionOut)
async def get_ordering_question(
    language: str | None = Query(default=None, max_length=5),
    service: QuizService = Depends(get_service),
) -> OrderingQuestionOut:
    """Get a random ordering question with shuffled answers for the WWM candidate selection."""
    return service.get_random_ordering_question(language=language)


@router.post("/ordering-question/{question_id}/check", response_model=OrderingCheckOut)
async def check_ordering_question(
    question_id: uuid.UUID,
    body: OrderingCheckIn,
    service: QuizService = Depends(get_service),
) -> OrderingCheckOut:
    """Validate the player's submitted answer order."""
    return service.check_ordering_question(question_id=question_id, data=body)


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


@router.get("/players/{player_id}/elo-history", response_model=list[EloHistoryEntryOut])
async def get_elo_history(
    player_id: uuid.UUID,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    service: QuizService = Depends(get_service),
) -> list[EloHistoryEntryOut]:
    """Get ELO progression history for a player (oldest first, suitable for charts)."""
    return service.get_elo_history(player_id=player_id, limit=limit, offset=offset)


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


# --- Admin / Moderation ---


def require_admin(x_admin_token: str | None = Header(default=None)) -> None:
    """Placeholder admin auth — checks for a header token.

    # TODO: post-dev — replace with proper auth / API key validation.
    """
    if not x_admin_token or x_admin_token != "playbox-admin":
        raise AppError(403, "Admin access required", "ADMIN_REQUIRED")


@router.get("/admin/questions/pending", response_model=QuestionListOut)
async def list_pending_questions(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    service: QuizService = Depends(get_service),
    _admin: None = Depends(require_admin),
) -> QuestionListOut:
    """List questions awaiting moderation (admin only)."""
    return service.list_pending_questions(limit=limit, offset=offset)


@router.post("/admin/questions/{question_id}/moderate", response_model=QuestionOut)
async def moderate_question(
    question_id: uuid.UUID,
    body: ModerationActionIn,
    service: QuizService = Depends(get_service),
    _admin: None = Depends(require_admin),
) -> QuestionOut:
    """Approve or reject a question (admin only)."""
    return service.moderate_question(question_id=question_id, data=body)


