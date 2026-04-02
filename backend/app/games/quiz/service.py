"""Quiz — Game service / business logic."""

import random
import shutil
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from fastapi import UploadFile

from app.core.config import settings
from app.core.errors import AppError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.games.quiz.elo import update_elo
from app.games.quiz.models import (
    Answer,
    Category,
    GameSession,
    OrderingQuestion,
    Player,
    Question,
    QuestionAttempt,
    QuestionFeedback,
    QuestionTag,
    Tag,
)
from app.games.quiz.schemas import (
    AnswerOut,
    AttemptIn,
    AttemptOut,
    AudiencePollEntry,
    AudiencePollIn,
    AudiencePollOut,
    CategoryIn,
    CategoryOut,
    FEEDBACK_TYPES,
    FiftyFiftyIn,
    FiftyFiftyOut,
    LeaderboardEntry,
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
    REPORT_CATEGORIES,
    SessionCreateIn,
    SessionOut,
    TagOut,
    THUMBS_DOWN_CATEGORIES,
    THUMBS_UP_CATEGORIES,
)

# Allowed MIME types for media uploads
ALLOWED_MEDIA_TYPES: dict[str, str] = {
    "image/jpeg": "image",
    "image/png": "image",
    "image/gif": "image",
    "image/webp": "image",
    "video/mp4": "video",
    "video/webm": "video",
    "application/pdf": "document",
}


class QuizService:
    """Business logic for the Quiz game."""

    def __init__(self, db: Session) -> None:
        self.db = db

    # --- Questions ---

    def list_questions(
        self,
        category_id: uuid.UUID | None = None,
        tag: str | None = None,
        language: str | None = None,
        elo_min: float | None = None,
        elo_max: float | None = None,
        balanced_categories: bool = False,
        order_by_elo: str | None = None,
        limit: int = 20,
        offset: int = 0,
        pun_first: bool = False,
        randomize: bool = False,
    ) -> QuestionListOut:
        """List questions with optional filters.

        Args:
            language: ISO 639-1 code to filter by (e.g. "de", "en"). None = no filter.
            order_by_elo: "asc" for ascending ELO (easy→hard, Millionär mode),
                          "desc" for descending. None keeps default ordering.
            pun_first: If True, ensure the first question in the result is a Wortspiel/pun
                       (is_pun=True) when one exists in the filtered pool.
            randomize: If True and order_by_elo=asc, randomly sample from ELO bands so each
                       game gets a different question set instead of always the lowest-ELO ones.
        """
        query = select(Question).where(Question.deleted_at.is_(None))

        if language:
            query = query.where(Question.language == language)
        if category_id:
            query = query.where(Question.category_id == category_id)
        if elo_min is not None:
            query = query.where(Question.elo_score >= elo_min)
        if elo_max is not None:
            query = query.where(Question.elo_score <= elo_max)
        if tag:
            query = query.join(QuestionTag).join(Tag).where(Tag.name == tag)

        # Apply ordering for non-balanced path
        if order_by_elo == "asc":
            query = query.order_by(Question.elo_score.asc(), Question.id.asc())
        elif order_by_elo == "desc":
            query = query.order_by(Question.elo_score.desc(), Question.id.asc())
        else:
            query = query.order_by(Question.created_at.asc(), Question.id.asc())

        total = self.db.scalar(select(func.count()).select_from(query.subquery()))

        if balanced_categories and category_id is None:
            all_matching = self.db.execute(query).scalars().all()

            # Pre-select a pun question so it's guaranteed in the result
            pun_question: Question | None = None
            pool = list(all_matching)
            effective_limit = limit

            if pun_first:
                pun_candidates = [q for q in pool if q.is_pun]
                if pun_candidates:
                    pun_question = random.choice(pun_candidates)  # noqa: S311
                    pool = [q for q in pool if q.id != pun_question.id]
                    effective_limit = limit - 1

            if order_by_elo and randomize:
                selected = self._random_sample_by_elo_bands(pool, effective_limit)
            elif order_by_elo:
                sorted_pool = sorted(pool, key=lambda q: (q.elo_score, str(q.id)))
                balanced = self._balance_within_elo_bands(sorted_pool, band_size=5)
                selected = balanced[offset : offset + effective_limit]
            else:
                balanced = self._balance_questions_by_category(pool)
                selected = balanced[offset : offset + effective_limit]

            questions: list[Question] = (
                [pun_question] + list(selected) if pun_question else list(selected)
            )
        else:
            questions = list(self.db.execute(query.offset(offset).limit(limit)).scalars().all())

        return QuestionListOut(
            items=[self._question_to_out(q) for q in questions],
            total=total or 0,
        )

    def _balance_questions_by_category(self, questions: list[Question]) -> list[Question]:
        """Interleave questions by category so one large category does not dominate the list."""
        buckets: dict[str, list[Question]] = defaultdict(list)
        category_order: list[str] = []

        for question in questions:
            category_name = question.category.name if question.category else "__uncategorized__"
            if category_name not in buckets:
                category_order.append(category_name)
            buckets[category_name].append(question)

        balanced: list[Question] = []
        while any(buckets.values()):
            for category_name in category_order:
                bucket = buckets[category_name]
                if bucket:
                    balanced.append(bucket.pop(0))

        return balanced

    def _balance_within_elo_bands(self, questions: list[Question], band_size: int = 5) -> list[Question]:
        """Balance categories within ELO bands.

        Splits the ELO-ordered question list into bands of ``band_size`` and
        interleaves categories within each band. This preserves the overall
        difficulty progression while avoiding long runs of the same category.
        """
        result: list[Question] = []
        for start in range(0, len(questions), band_size):
            band = questions[start : start + band_size]
            result.extend(self._balance_questions_by_category(band))
        return result

    def _random_sample_by_elo_bands(self, questions: list[Question], limit: int) -> list[Question]:
        """Randomly sample ``limit`` questions from three ELO difficulty bands.

        Splits the pool into easy (<1150), medium (1150–1350) and hard (>1350) bands,
        then draws approximately limit//3 questions from each.  This ensures every
        Millionär game uses a different question set while preserving the easy→hard
        difficulty curve.

        ELO thresholds are based on TIER_ELO_MAP seed values (1000 / 1200 / 1400)
        and will self-calibrate over time as players answer questions.
        """
        easy = [q for q in questions if q.elo_score < 1150]
        medium = [q for q in questions if 1150 <= q.elo_score < 1350]
        hard = [q for q in questions if q.elo_score >= 1350]

        per_band = limit // 3
        remainder = limit % 3
        # Distribute extra slots to lower bands (more variety in easy questions)
        band_limits = [per_band + (1 if i < remainder else 0) for i in range(3)]

        sampled: list[Question] = []
        for band, k in zip((easy, medium, hard), band_limits):
            actual_k = min(k, len(band))
            if actual_k > 0:
                sampled.extend(random.sample(band, actual_k))  # noqa: S311

        # Fill any remaining slots if a band did not have enough questions
        if len(sampled) < limit:
            taken_ids = {q.id for q in sampled}
            leftover = [q for q in questions if q.id not in taken_ids]
            extra = min(limit - len(sampled), len(leftover))
            if extra > 0:
                sampled.extend(random.sample(leftover, extra))  # noqa: S311

        # Re-sort by ELO ascending to maintain difficulty curve
        sampled.sort(key=lambda q: (q.elo_score, str(q.id)))
        return sampled

    def create_question(self, data: QuestionCreateIn) -> QuestionOut:
        """Create a new question with answers and tags."""
        # Validate: at least one correct answer
        correct_count = sum(1 for a in data.answers if a.is_correct)
        if correct_count < 1:
            raise AppError(422, "At least one answer must be marked as correct", "NO_CORRECT_ANSWER")

        question = Question(
            text=data.text,
            note=data.note,
            category_id=data.category_id,
            wwm_difficulty=data.wwm_difficulty,
            language=data.language,
            is_pun=data.is_pun,
            media_url=data.media_url,
            media_type=data.media_type,
            created_by=data.created_by,
        )
        self.db.add(question)
        self.db.flush()

        # Add answers
        for answer_data in data.answers:
            answer = Answer(question_id=question.id, text=answer_data.text, is_correct=answer_data.is_correct)
            self.db.add(answer)

        # Add tags (create if not exists)
        for tag_name in data.tags:
            tag = self.db.execute(select(Tag).where(Tag.name == tag_name)).scalar_one_or_none()
            if not tag:
                tag = Tag(name=tag_name)
                self.db.add(tag)
                self.db.flush()
            self.db.add(QuestionTag(question_id=question.id, tag_id=tag.id))

        self.db.commit()
        self.db.refresh(question)
        return self._question_to_out(question)

    def get_question(self, question_id: uuid.UUID, num_answers: int = 4) -> QuestionOut:
        """Get a question with a randomized subset of answers (1 correct + N-1 wrong)."""
        question = self.db.get(Question, question_id)
        if not question or question.deleted_at is not None:
            raise AppError(404, "Question not found", "QUESTION_NOT_FOUND")

        correct = [a for a in question.answers if a.is_correct]
        wrong = [a for a in question.answers if not a.is_correct]

        # Pick one correct answer randomly (model may store multiple)
        selected_correct = [random.choice(correct)]  # noqa: S311
        # Fill remaining slots with wrong answers
        num_wrong = min(num_answers - 1, len(wrong))
        selected_wrong = random.sample(wrong, num_wrong)  # noqa: S311

        # Combine and shuffle
        selected = selected_correct + selected_wrong
        random.shuffle(selected)  # noqa: S311

        out = self._question_to_out(question)
        out.note = None  # Hide note during gameplay
        out.answers = [AnswerOut(id=a.id, text=a.text) for a in selected]  # Hide is_correct
        return out

    def update_question(self, question_id: uuid.UUID, data: QuestionUpdateIn) -> QuestionOut:
        """Update a question's mutable fields (partial update)."""
        question = self.db.get(Question, question_id)
        if not question or question.deleted_at is not None:
            raise AppError(404, "Question not found", "QUESTION_NOT_FOUND")

        if data.text is not None:
            question.text = data.text
        if data.note is not None:
            question.note = data.note
        if data.category_id is not None:
            question.category_id = data.category_id
        if data.wwm_difficulty is not None:
            question.wwm_difficulty = data.wwm_difficulty
        if data.language is not None:
            question.language = data.language
        if data.is_pun is not None:
            question.is_pun = data.is_pun
        if data.media_url is not None:
            question.media_url = data.media_url
        if data.media_type is not None:
            question.media_type = data.media_type

        question.updated_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(question)
        return self._question_to_out(question)

    def delete_question(self, question_id: uuid.UUID) -> QuestionOut:
        """Soft-delete a question (sets deleted_at timestamp)."""
        question = self.db.get(Question, question_id)
        if not question or question.deleted_at is not None:
            raise AppError(404, "Question not found", "QUESTION_NOT_FOUND")

        question.deleted_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(question)
        return self._question_to_out(question)

    def submit_attempt(self, question_id: uuid.UUID, data: AttemptIn) -> AttemptOut:
        """Submit an answer and update ELO scores."""
        question = self.db.get(Question, question_id)
        if not question:
            raise AppError(404, "Question not found", "QUESTION_NOT_FOUND")

        player = self.db.get(Player, data.player_id)
        if not player:
            raise AppError(404, "Player not found", "PLAYER_NOT_FOUND")

        answer = self.db.get(Answer, data.answer_id)
        if not answer or answer.question_id != question_id:
            raise AppError(422, "Invalid answer for this question", "INVALID_ANSWER")

        # Calculate ELO
        player_elo_before = player.elo_score
        question_elo_before = question.elo_score
        new_player_elo, new_question_elo = update_elo(player.elo_score, question.elo_score, answer.is_correct)

        # Update scores
        player.elo_score = new_player_elo
        player.updated_at = datetime.now(timezone.utc)
        if answer.is_correct:
            player.correct_count += 1
        question.elo_score = new_question_elo
        question.updated_at = datetime.now(timezone.utc)

        # Record attempt
        attempt = QuestionAttempt(
            session_id=data.session_id,
            question_id=question_id,
            player_id=data.player_id,
            answered_correctly=answer.is_correct,
            time_taken_ms=data.time_taken_ms,
        )
        self.db.add(attempt)

        # Find correct answer id
        correct_answer = next(a for a in question.answers if a.is_correct)

        self.db.commit()

        return AttemptOut(
            correct=answer.is_correct,
            correct_answer_id=correct_answer.id,
            note=question.note,
            player_elo_before=player_elo_before,
            player_elo_after=new_player_elo,
            question_elo_before=question_elo_before,
            question_elo_after=new_question_elo,
        )

    # --- Categories ---

    def list_categories(self) -> list[CategoryOut]:
        """List all categories with question counts."""
        categories = self.db.execute(select(Category)).scalars().all()
        result = []
        for cat in categories:
            count = self.db.scalar(
                select(func.count()).where(Question.category_id == cat.id, Question.deleted_at.is_(None))
            )
            result.append(CategoryOut(id=cat.id, name=cat.name, description=cat.description, question_count=count or 0))
        return result

    def create_category(self, data: CategoryIn) -> CategoryOut:
        """Create a new category."""
        category = Category(name=data.name, description=data.description)
        self.db.add(category)
        self.db.commit()
        self.db.refresh(category)
        return CategoryOut(id=category.id, name=category.name, description=category.description, question_count=0)

    # --- Tags ---

    def list_tags(self) -> list[TagOut]:
        """List all tags with question counts."""
        tags = self.db.execute(select(Tag)).scalars().all()
        result = []
        for tag in tags:
            count = self.db.scalar(select(func.count()).where(QuestionTag.tag_id == tag.id))
            result.append(TagOut(id=tag.id, name=tag.name, question_count=count or 0))
        return result

    # --- Players ---

    def create_player(self, data: PlayerCreateIn) -> PlayerOut:
        """Create a new player."""
        player = Player(name=data.name)
        self.db.add(player)
        self.db.commit()
        self.db.refresh(player)
        return self._player_to_out(player)

    def get_player(self, player_id: uuid.UUID) -> PlayerOut:
        """Get a player by ID."""
        player = self.db.get(Player, player_id)
        if not player:
            raise AppError(404, "Player not found", "PLAYER_NOT_FOUND")
        return self._player_to_out(player)

    def get_player_profile(self, player_id: uuid.UUID) -> PlayerProfileOut:
        """Get extended player profile including accuracy and recent sessions."""
        player = self.db.get(Player, player_id)
        if not player:
            raise AppError(404, "Player not found", "PLAYER_NOT_FOUND")

        # Compute accuracy from total attempts
        total_attempts = self.db.scalar(
            select(func.count(QuestionAttempt.id)).where(QuestionAttempt.player_id == player_id)
        ) or 0
        accuracy = (player.correct_count / total_attempts) if total_attempts > 0 else 0.0

        # Recent sessions (last 10, newest first)
        sessions = self.db.execute(
            select(GameSession)
            .where(GameSession.player_id == player_id)
            .order_by(GameSession.started_at.desc())
            .limit(10)
        ).scalars().all()

        return PlayerProfileOut(
            id=player.id,
            name=player.name,
            elo_score=player.elo_score,
            games_played=player.games_played,
            correct_count=player.correct_count,
            accuracy=round(accuracy, 4),
            recent_sessions=[self._session_to_out(s) for s in sessions],
        )

    def get_player_sessions(self, player_id: uuid.UUID, limit: int = 20) -> list[SessionOut]:
        """List sessions for a player (newest first)."""
        player = self.db.get(Player, player_id)
        if not player:
            raise AppError(404, "Player not found", "PLAYER_NOT_FOUND")

        sessions = self.db.execute(
            select(GameSession)
            .where(GameSession.player_id == player_id)
            .order_by(GameSession.started_at.desc())
            .limit(limit)
        ).scalars().all()

        return [self._session_to_out(s) for s in sessions]

    # --- Sessions ---

    def create_session(self, data: SessionCreateIn) -> SessionOut:
        """Start a new quiz session."""
        player = self.db.get(Player, data.player_id)
        if not player:
            raise AppError(404, "Player not found", "PLAYER_NOT_FOUND")

        session = GameSession(mode=data.mode, player_id=data.player_id)
        self.db.add(session)

        player.games_played += 1
        player.updated_at = datetime.now(timezone.utc)

        self.db.commit()
        self.db.refresh(session)
        return self._session_to_out(session)

    def get_session(self, session_id: uuid.UUID) -> SessionOut:
        """Get a session by ID."""
        session = self.db.get(GameSession, session_id)
        if not session:
            raise AppError(404, "Session not found", "SESSION_NOT_FOUND")
        return self._session_to_out(session)

    def finish_session(self, session_id: uuid.UUID) -> SessionOut:
        """Finish a session and persist its final score."""
        session = self.db.get(GameSession, session_id)
        if not session:
            raise AppError(404, "Session not found", "SESSION_NOT_FOUND")

        correct_attempts = self.db.scalar(
            select(func.count())
            .select_from(QuestionAttempt)
            .where(
                QuestionAttempt.session_id == session_id,
                QuestionAttempt.answered_correctly.is_(True),
            )
        )

        session.score = correct_attempts or 0
        if session.finished_at is None:
            session.finished_at = datetime.now(timezone.utc)

        self.db.commit()
        self.db.refresh(session)
        return self._session_to_out(session)

    # --- Leaderboard ---

    def get_leaderboard(self, limit: int = 10) -> list[LeaderboardEntry]:
        """Get top players by ELO."""
        players = self.db.execute(select(Player).order_by(Player.elo_score.desc()).limit(limit)).scalars().all()
        return [
            LeaderboardEntry(
                rank=i + 1,
                player_id=p.id,
                name=p.name,
                elo_score=p.elo_score,
                games_played=p.games_played,
                correct_count=p.correct_count,
            )
            for i, p in enumerate(players)
        ]

    # --- Jokers (Millionaire lifelines) ---

    def fifty_fifty(self, question_id: uuid.UUID, data: FiftyFiftyIn) -> FiftyFiftyOut:
        """Return 2 wrong answer IDs from the displayed set for 50:50 joker."""
        question = self.db.get(Question, question_id)
        if not question:
            raise AppError(404, "Question not found", "QUESTION_NOT_FOUND")

        displayed_ids = set(data.displayed_answer_ids)
        wrong_displayed = [a for a in question.answers if a.id in displayed_ids and not a.is_correct]

        to_remove = random.sample(wrong_displayed, min(2, len(wrong_displayed)))  # noqa: S311
        return FiftyFiftyOut(remove=[a.id for a in to_remove])

    def audience_poll(self, question_id: uuid.UUID, data: AudiencePollIn) -> AudiencePollOut:
        """Generate fake audience poll results biased toward the correct answer.

        The correct answer always gets 45-72%. The remaining percentage is
        distributed deterministically among the wrong answers so the total
        is guaranteed to sum to exactly 100.
        """
        question = self.db.get(Question, question_id)
        if not question:
            raise AppError(404, "Question not found", "QUESTION_NOT_FOUND")

        displayed_ids = set(data.displayed_answer_ids)
        displayed = [a for a in question.answers if a.id in displayed_ids]

        correct_ids = {a.id for a in displayed if a.is_correct}
        correct_pct = random.randint(45, 72)  # noqa: S311
        wrong_displayed = [a for a in displayed if not a.is_correct]

        # Distribute remaining percentage among wrong answers
        remaining = 100 - correct_pct
        wrong_pcts: list[int] = []
        for i, _ in enumerate(wrong_displayed):
            if i == len(wrong_displayed) - 1:
                # Last wrong answer gets everything that's left
                wrong_pcts.append(remaining)
            else:
                pct = random.randint(0, max(0, remaining))  # noqa: S311
                wrong_pcts.append(pct)
                remaining -= pct

        results: list[AudiencePollEntry] = []
        wrong_idx = 0
        for a in displayed:
            if a.id in correct_ids:
                results.append(AudiencePollEntry(answer_id=a.id, percentage=correct_pct))
            else:
                results.append(AudiencePollEntry(answer_id=a.id, percentage=wrong_pcts[wrong_idx]))
                wrong_idx += 1

        return AudiencePollOut(results=results)

    def phone_joker(self, question_id: uuid.UUID, data: AudiencePollIn) -> PhoneJokerOut:
        """Drachenlord phone joker — gives a hint with varying confidence."""
        question = self.db.get(Question, question_id)
        if not question:
            raise AppError(404, "Question not found", "QUESTION_NOT_FOUND")

        displayed_ids = set(data.displayed_answer_ids)
        displayed = [a for a in question.answers if a.id in displayed_ids]

        correct = [a for a in displayed if a.is_correct]
        wrong = [a for a in displayed if not a.is_correct]

        messages_correct = [
            "Isch schwör dir, des is {answer}!",
            "Hör mal, des muss {answer} sein, etzala!",
            "Des is doch klar, {answer}!",
            "Isch weiß des, des is {answer}, Mann!",
        ]
        messages_wrong = [
            "Ähm... isch glaub des is {answer}... oder?",
            "Puh, schwierig... isch sag mal {answer}.",
            "Keine Ahnung ehrlich gesagt, vielleicht {answer}?",
        ]

        if random.random() < 0.7 and correct:  # noqa: S311
            hint = random.choice(correct)  # noqa: S311
            confidence = random.randint(65, 92)  # noqa: S311
            msg = random.choice(messages_correct).format(answer=hint.text)  # noqa: S311
        else:
            hint = random.choice(wrong) if wrong else correct[0]  # noqa: S311
            confidence = random.randint(25, 55)  # noqa: S311
            msg = random.choice(messages_wrong).format(answer=hint.text)  # noqa: S311

        return PhoneJokerOut(hint_answer_id=hint.id, confidence=confidence, message=msg)

    # --- Media ---

    async def upload_media(self, question_id: uuid.UUID, file: UploadFile) -> MediaUploadOut:
        """Upload a media file and attach it to a question."""
        question = self.db.get(Question, question_id)
        if not question or question.deleted_at is not None:
            raise AppError(404, "Question not found", "QUESTION_NOT_FOUND")

        # Validate content type
        content_type = file.content_type or ""
        media_type = ALLOWED_MEDIA_TYPES.get(content_type)
        if not media_type:
            allowed = ", ".join(sorted(ALLOWED_MEDIA_TYPES.keys()))
            raise AppError(422, f"Unsupported file type: {content_type}. Allowed: {allowed}", "UNSUPPORTED_MEDIA_TYPE")

        # Read file content and check size
        content = await file.read()
        max_bytes = settings.max_media_size_mb * 1024 * 1024
        if len(content) > max_bytes:
            raise AppError(413, f"File too large. Maximum: {settings.max_media_size_mb} MB", "FILE_TOO_LARGE")

        # Determine file extension from content type
        ext_map = {
            "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif",
            "image/webp": ".webp", "video/mp4": ".mp4", "video/webm": ".webm",
            "application/pdf": ".pdf",
        }
        ext = ext_map.get(content_type, "")
        safe_filename = f"{question_id}{ext}"

        # Save file
        media_dir = Path(settings.media_dir) / "quiz" / str(question_id)
        media_dir.mkdir(parents=True, exist_ok=True)

        # Remove any previously uploaded file for this question
        if question.media_url:
            old_path = Path(settings.media_dir) / question.media_url.lstrip("/media/")
            if old_path.exists():
                old_path.unlink(missing_ok=True)

        file_path = media_dir / safe_filename
        file_path.write_bytes(content)

        # Update question
        media_url = f"/media/quiz/{question_id}/{safe_filename}"
        question.media_url = media_url
        question.media_type = media_type
        question.updated_at = datetime.now(timezone.utc)
        self.db.commit()

        return MediaUploadOut(media_url=media_url, media_type=media_type)

    def delete_media(self, question_id: uuid.UUID) -> QuestionOut:
        """Remove media from a question and delete the file."""
        question = self.db.get(Question, question_id)
        if not question or question.deleted_at is not None:
            raise AppError(404, "Question not found", "QUESTION_NOT_FOUND")

        if not question.media_url:
            raise AppError(404, "No media attached to this question", "NO_MEDIA")

        # Delete file from filesystem
        relative_path = question.media_url.lstrip("/")
        file_path = Path(settings.media_dir).parent / relative_path
        if file_path.exists():
            file_path.unlink(missing_ok=True)

        # Clean up empty directory
        question_dir = Path(settings.media_dir) / "quiz" / str(question_id)
        if question_dir.exists() and not any(question_dir.iterdir()):
            question_dir.rmdir()

        question.media_url = None
        question.media_type = None
        question.updated_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(question)
        return self._question_to_out(question)

    # --- Question Feedback ---

    def submit_feedback(self, question_id: uuid.UUID, data: QuestionFeedbackIn) -> QuestionFeedbackOut:
        """Submit feedback (thumbs up/down or report) on a question."""
        # Validate feedback_type
        if data.feedback_type not in FEEDBACK_TYPES:
            raise AppError(
                422,
                f"Invalid feedback_type '{data.feedback_type}'. Must be one of: {', '.join(sorted(FEEDBACK_TYPES))}",
                "INVALID_FEEDBACK_TYPE",
            )

        # Validate question exists
        question = self.db.get(Question, question_id)
        if not question or question.deleted_at is not None:
            raise AppError(404, "Question not found", "QUESTION_NOT_FOUND")

        # Validate category based on feedback_type
        if data.feedback_type == "THUMBS_DOWN":
            if not data.category:
                raise AppError(422, "Category is required for THUMBS_DOWN feedback", "CATEGORY_REQUIRED")
            if data.category not in THUMBS_DOWN_CATEGORIES:
                raise AppError(
                    422,
                    f"Invalid category '{data.category}' for THUMBS_DOWN. Allowed: {', '.join(sorted(THUMBS_DOWN_CATEGORIES))}",
                    "INVALID_FEEDBACK_CATEGORY",
                )
        elif data.feedback_type == "REPORT":
            if not data.category:
                raise AppError(422, "Category is required for REPORT feedback", "CATEGORY_REQUIRED")
            if data.category not in REPORT_CATEGORIES:
                raise AppError(
                    422,
                    f"Invalid category '{data.category}' for REPORT. Allowed: {', '.join(sorted(REPORT_CATEGORIES))}",
                    "INVALID_FEEDBACK_CATEGORY",
                )
        elif data.feedback_type == "THUMBS_UP":
            if data.category and data.category not in THUMBS_UP_CATEGORIES:
                raise AppError(
                    422,
                    f"Invalid category '{data.category}' for THUMBS_UP. Allowed: {', '.join(sorted(THUMBS_UP_CATEGORIES))}",
                    "INVALID_FEEDBACK_CATEGORY",
                )

        feedback = QuestionFeedback(
            question_id=question_id,
            player_id=data.player_id,
            session_id=data.session_id,
            feedback_type=data.feedback_type,
            category=data.category,
            comment=data.comment,
        )
        self.db.add(feedback)
        self.db.commit()
        self.db.refresh(feedback)

        return QuestionFeedbackOut(
            id=feedback.id,
            question_id=feedback.question_id,
            feedback_type=feedback.feedback_type,
            category=feedback.category,
            created_at=feedback.created_at,
        )

    def list_feedback(
        self, question_id: uuid.UUID, limit: int = 50, offset: int = 0
    ) -> list[QuestionFeedbackOut]:
        """List feedback entries for a question (newest first)."""
        question = self.db.get(Question, question_id)
        if not question or question.deleted_at is not None:
            raise AppError(404, "Question not found", "QUESTION_NOT_FOUND")

        entries = self.db.execute(
            select(QuestionFeedback)
            .where(QuestionFeedback.question_id == question_id)
            .order_by(QuestionFeedback.created_at.desc())
            .offset(offset)
            .limit(limit)
        ).scalars().all()

        return [
            QuestionFeedbackOut(
                id=e.id,
                question_id=e.question_id,
                feedback_type=e.feedback_type,
                category=e.category,
                created_at=e.created_at,
            )
            for e in entries
        ]

    # --- Ordering Questions (WWM Kandidatenfrage) ---

    def get_random_ordering_question(self, language: str | None = None) -> OrderingQuestionOut:
        """Return a random ordering question with shuffled answers."""
        query = select(OrderingQuestion)
        if language:
            query = query.where(OrderingQuestion.language == language)

        all_oqs = self.db.execute(query).scalars().all()
        if not all_oqs:
            raise AppError(404, "No ordering questions available", "NO_ORDERING_QUESTIONS")

        oq: OrderingQuestion = random.choice(all_oqs)  # noqa: S311
        shuffled = list(oq.ordered_answers)
        random.shuffle(shuffled)  # noqa: S311

        return OrderingQuestionOut(
            id=oq.id,
            text=oq.text,
            shuffled_answers=shuffled,
        )

    def check_ordering_question(self, question_id: uuid.UUID, data: OrderingCheckIn) -> OrderingCheckOut:
        """Validate a player's ordering attempt."""
        oq = self.db.get(OrderingQuestion, question_id)
        if not oq:
            raise AppError(404, "Ordering question not found", "ORDERING_QUESTION_NOT_FOUND")

        correct_order = oq.ordered_answers
        is_correct = data.submitted_order == correct_order

        return OrderingCheckOut(
            correct=is_correct,
            correct_order=correct_order,
            time_taken_ms=data.time_taken_ms,
        )

    # --- Helpers ---

    def _question_to_out(self, question: Question) -> QuestionOut:
        """Convert a Question model to QuestionOut schema."""
        return QuestionOut(
            id=question.id,
            text=question.text,
            note=question.note,
            category=question.category.name if question.category else None,
            tags=[t.name for t in question.tags] if question.tags else [],
            elo_score=question.elo_score,
            wwm_difficulty=question.wwm_difficulty,
            language=question.language,
            is_pun=question.is_pun,
            media_url=question.media_url,
            media_type=question.media_type,
            answers=[AnswerOut(id=a.id, text=a.text, is_correct=a.is_correct) for a in question.answers],
        )

    def _player_to_out(self, player: Player) -> PlayerOut:
        """Convert a Player model to PlayerOut schema."""
        return PlayerOut(
            id=player.id,
            name=player.name,
            elo_score=player.elo_score,
            games_played=player.games_played,
            correct_count=player.correct_count,
        )

    def _session_to_out(self, session: GameSession) -> SessionOut:
        """Convert a GameSession model to SessionOut schema."""
        return SessionOut(
            id=session.id,
            mode=session.mode,
            player_id=session.player_id,
            score=session.score,
            finished_at=session.finished_at,
        )

