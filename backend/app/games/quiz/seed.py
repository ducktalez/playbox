"""Quiz seed utilities and a small file-based starter dataset importer."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select, func
from sqlalchemy.orm import Session
import yaml

from app.core.database import PgSessionLocal, init_pg_db
from app.games.quiz.models import Answer, Category, Question, QuestionTag, Tag

DEFAULT_SEED_PATH = Path(__file__).with_name("seed_questions.yaml")
DEFAULT_CREATED_BY = "PlayBox quiz seed"

# Map tier → starting ELO score for seeded questions.
# Tier 1 = easy (WWM levels 1-5), Tier 2 = medium (6-10), Tier 3 = hard (11-15).
TIER_ELO_MAP: dict[int, float] = {
    1: 1000.0,
    2: 1200.0,
    3: 1500.0,
}


class SeedAnswerIn(BaseModel):
    """An answer option inside the quiz seed file."""

    text: str = Field(..., max_length=500)
    is_correct: bool = False


class SeedCategoryIn(BaseModel):
    """A category definition inside the quiz seed file."""

    name: str = Field(..., max_length=100)
    description: str = Field(default="", max_length=500)


class SeedQuestionIn(BaseModel):
    """A question definition inside the quiz seed file."""

    text: str = Field(..., max_length=1000)
    explanation: str | None = Field(default=None, max_length=2000)
    category: str | None = None
    tier: int | None = Field(default=None, ge=1)
    tags: list[str] = Field(default_factory=list)
    answers: list[SeedAnswerIn] = Field(..., min_length=2)
    media_url: str | None = None
    media_type: str | None = None
    created_by: str = Field(default=DEFAULT_CREATED_BY, max_length=200)
    created_at: str | None = None

    @model_validator(mode="before")
    @classmethod
    def normalize_compact_answers(cls, data: object) -> object:
        """Support compact YAML answers: [correct_answer, [wrong_answer, ...]]."""
        if not isinstance(data, dict):
            return data

        answers = data.get("answers")
        if not isinstance(answers, list):
            return data

        if answers and all(isinstance(answer, dict) for answer in answers):
            return data

        if len(answers) != 2:
            raise ValueError(
                "Compact seed answers must contain exactly two items: the correct answer and a list of wrong answers."
            )

        correct_answer, wrong_answers = answers
        if not isinstance(correct_answer, str) or not correct_answer.strip():
            raise ValueError("Compact seed answers must start with a non-empty correct answer string.")
        if not isinstance(wrong_answers, list) or len(wrong_answers) < 1:
            raise ValueError("Compact seed answers must include a non-empty list of wrong answers.")
        if not all(isinstance(answer, str) and answer.strip() for answer in wrong_answers):
            raise ValueError("All compact seed wrong answers must be non-empty strings.")

        data = dict(data)
        data["answers"] = [
            {"text": correct_answer, "is_correct": True},
            *({"text": answer, "is_correct": False} for answer in wrong_answers),
        ]
        return data

    @model_validator(mode="after")
    def validate_at_least_one_correct_answer(self) -> "SeedQuestionIn":
        """Ensure the seed question has at least one correct answer."""
        correct_count = sum(1 for answer in self.answers if answer.is_correct)
        if correct_count < 1:
            raise ValueError("Seed questions must contain at least one correct answer.")

        normalized_answers = [answer.text.strip().casefold() for answer in self.answers]
        if len(set(normalized_answers)) != len(normalized_answers):
            raise ValueError("Seed questions must not contain duplicate answer texts.")

        return self


class QuizSeedFile(BaseModel):
    """Root structure for the quiz seed YAML file."""

    categories: list[SeedCategoryIn] = Field(default_factory=list)
    questions: list[SeedQuestionIn] = Field(default_factory=list)


@dataclass(slots=True)
class QuizSeedResult:
    """Summary of a quiz seed import run."""

    created_categories: int = 0
    created_tags: int = 0
    created_questions: int = 0
    skipped_questions: int = 0


def load_seed_file(file_path: Path) -> QuizSeedFile:
    """Load and validate a quiz seed file from disk.

    YAML is the default project format. Legacy JSON stays readable because JSON is a
    subset of YAML and therefore parses through ``yaml.safe_load`` as well.
    """
    payload = yaml.safe_load(file_path.read_text(encoding="utf-8"))
    return QuizSeedFile.model_validate(payload)


def seed_quiz_dataset(db: Session, dataset: QuizSeedFile) -> QuizSeedResult:
    """Insert a validated quiz dataset into the database without duplicating questions."""
    result = QuizSeedResult()

    categories_by_name = {
        category.name: category for category in db.execute(select(Category)).scalars().all()
    }
    tags_by_name = {tag.name: tag for tag in db.execute(select(Tag)).scalars().all()}

    for category_data in dataset.categories:
        if category_data.name in categories_by_name:
            continue
        category = Category(name=category_data.name, description=category_data.description)
        db.add(category)
        db.flush()
        categories_by_name[category.name] = category
        result.created_categories += 1

    for question_data in dataset.questions:
        existing_question = db.execute(
            select(Question).where(
                Question.text == question_data.text,
                Question.deleted_at.is_(None),
            )
        ).scalar_one_or_none()
        if existing_question:
            result.skipped_questions += 1
            continue

        category_id = None
        if question_data.category:
            category = categories_by_name.get(question_data.category)
            if category is None:
                category = Category(name=question_data.category, description="")
                db.add(category)
                db.flush()
                categories_by_name[category.name] = category
                result.created_categories += 1
            category_id = category.id

        elo_score = TIER_ELO_MAP.get(question_data.tier, 1200.0) if question_data.tier else 1200.0

        question = Question(
            text=question_data.text,
            explanation=question_data.explanation,
            category_id=category_id,
            elo_score=elo_score,
            media_url=question_data.media_url,
            media_type=question_data.media_type,
            created_by=question_data.created_by,
        )
        db.add(question)
        db.flush()

        for answer_data in question_data.answers:
            db.add(
                Answer(
                    question_id=question.id,
                    text=answer_data.text,
                    is_correct=answer_data.is_correct,
                )
            )

        for tag_name in question_data.tags:
            tag = tags_by_name.get(tag_name)
            if tag is None:
                tag = Tag(name=tag_name)
                db.add(tag)
                db.flush()
                tags_by_name[tag.name] = tag
                result.created_tags += 1
            db.add(QuestionTag(question_id=question.id, tag_id=tag.id))

        result.created_questions += 1

    db.commit()
    return result


def run_seed(file_path: Path) -> QuizSeedResult:
    """Create tables if needed and import the dataset from the given file."""
    dataset = load_seed_file(file_path)
    init_pg_db()
    with PgSessionLocal() as db:
        return seed_quiz_dataset(db=db, dataset=dataset)


def seed_questions() -> None:
    """Seed questions from the default seed file if the database is empty."""
    init_pg_db()
    with PgSessionLocal() as db:
        question_count = db.execute(select(func.count()).select_from(Question)).scalar()
        if question_count and question_count > 0:
            # Database already has questions, skip seeding
            return
    
    # Database is empty, seed it
    run_seed(DEFAULT_SEED_PATH)


def main() -> None:
    """CLI entry point for importing quiz starter questions."""
    parser = argparse.ArgumentParser(description="Seed PlayBox quiz questions from a YAML file.")
    parser.add_argument(
        "--file",
        type=Path,
        default=DEFAULT_SEED_PATH,
        help="Path to a quiz seed YAML file.",
    )
    args = parser.parse_args()
    file_path = args.file.resolve()

    result = run_seed(file_path=file_path)
    print(f"Imported quiz seed file: {file_path}")
    print(f"Created categories: {result.created_categories}")
    print(f"Created tags: {result.created_tags}")
    print(f"Created questions: {result.created_questions}")
    print(f"Skipped existing questions: {result.skipped_questions}")


if __name__ == "__main__":
    main()


