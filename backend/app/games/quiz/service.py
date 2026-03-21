"""Quiz — Game service / business logic."""

import random
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.games.quiz.elo import update_elo
from app.games.quiz.models import (
    Answer,
    Category,
    GameSession,
    Player,
    Question,
    QuestionAttempt,
    QuestionTag,
    Tag,
)
from app.games.quiz.schemas import (
    AnswerOut,
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


class QuizService:
    """Business logic for the Quiz game."""

    def __init__(self, db: Session) -> None:
        self.db = db

    # --- Questions ---

    def list_questions(
        self,
        category_id: uuid.UUID | None = None,
        tag: str | None = None,
        elo_min: float | None = None,
        elo_max: float | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> QuestionListOut:
        """List questions with optional filters."""
        query = select(Question).where(Question.deleted_at.is_(None))

        if category_id:
            query = query.where(Question.category_id == category_id)
        if elo_min is not None:
            query = query.where(Question.elo_score >= elo_min)
        if elo_max is not None:
            query = query.where(Question.elo_score <= elo_max)
        if tag:
            query = query.join(QuestionTag).join(Tag).where(Tag.name == tag)

        total = self.db.scalar(select(func.count()).select_from(query.subquery()))
        questions = self.db.execute(query.offset(offset).limit(limit)).scalars().all()

        return QuestionListOut(
            items=[self._question_to_out(q) for q in questions],
            total=total or 0,
        )

    def create_question(self, data: QuestionCreateIn) -> QuestionOut:
        """Create a new question with answers and tags."""
        # Validate: at least one correct answer
        correct_count = sum(1 for a in data.answers if a.is_correct)
        if correct_count != 1:
            raise HTTPException(status_code=422, detail="Exactly one answer must be marked as correct")

        question = Question(
            text=data.text,
            category_id=data.category_id,
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
            raise HTTPException(status_code=404, detail="Question not found")

        correct = [a for a in question.answers if a.is_correct]
        wrong = [a for a in question.answers if not a.is_correct]

        # Select random wrong answers
        num_wrong = min(num_answers - 1, len(wrong))
        selected_wrong = random.sample(wrong, num_wrong)  # noqa: S311

        # Combine and shuffle
        selected = correct + selected_wrong
        random.shuffle(selected)  # noqa: S311

        out = self._question_to_out(question)
        out.answers = [AnswerOut(id=a.id, text=a.text) for a in selected]  # Hide is_correct
        return out

    def submit_attempt(self, question_id: uuid.UUID, data: AttemptIn) -> AttemptOut:
        """Submit an answer and update ELO scores."""
        question = self.db.get(Question, question_id)
        if not question:
            raise HTTPException(status_code=404, detail="Question not found")

        player = self.db.get(Player, data.player_id)
        if not player:
            raise HTTPException(status_code=404, detail="Player not found")

        answer = self.db.get(Answer, data.answer_id)
        if not answer or answer.question_id != question_id:
            raise HTTPException(status_code=422, detail="Invalid answer for this question")

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
            raise HTTPException(status_code=404, detail="Player not found")
        return self._player_to_out(player)

    # --- Sessions ---

    def create_session(self, data: SessionCreateIn) -> SessionOut:
        """Start a new quiz session."""
        player = self.db.get(Player, data.player_id)
        if not player:
            raise HTTPException(status_code=404, detail="Player not found")

        session = GameSession(mode=data.mode, player_id=data.player_id)
        self.db.add(session)

        player.games_played += 1
        player.updated_at = datetime.now(timezone.utc)

        self.db.commit()
        self.db.refresh(session)
        return SessionOut(id=session.id, mode=session.mode, player_id=session.player_id, score=session.score)

    def get_session(self, session_id: uuid.UUID) -> SessionOut:
        """Get a session by ID."""
        session = self.db.get(GameSession, session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        return SessionOut(id=session.id, mode=session.mode, player_id=session.player_id, score=session.score)

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

    # --- Helpers ---

    def _question_to_out(self, question: Question) -> QuestionOut:
        """Convert a Question model to QuestionOut schema."""
        return QuestionOut(
            id=question.id,
            text=question.text,
            category=question.category.name if question.category else None,
            tags=[t.name for t in question.tags] if question.tags else [],
            elo_score=question.elo_score,
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

