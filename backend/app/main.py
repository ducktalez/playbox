"""PlayBox — FastAPI application entry point."""

from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import init_pg_db, init_sqlite_db
from app.games.imposter.router import router as imposter_router
from app.games.piccolo.router import router as piccolo_router
from app.games.quiz.router import router as quiz_router
from app.games.quiz.seed import seed_questions


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: startup and shutdown events."""
    # Startup
    init_pg_db()
    init_sqlite_db()
    # Seed quiz questions if database is empty
    try:
        seed_questions()
    except Exception as e:
        print(f"Warning: Could not seed questions: {e}")
    yield
    # Shutdown


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    application = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="Collection of small browser-based party & quiz games",
        lifespan=lifespan,
    )

    # CORS
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Mount game routers
    application.include_router(imposter_router, prefix="/api/v1/imposter", tags=["Imposter"])
    application.include_router(piccolo_router, prefix="/api/v1/piccolo", tags=["Piccolo"])
    application.include_router(quiz_router, prefix="/api/v1/quiz", tags=["Quiz"])
    # TODO: mount chess router when implemented
    # application.include_router(chess_router, prefix="/api/v1/chess", tags=["Chess"])

    @application.get("/health", tags=["System"])
    async def health_check() -> dict[str, str]:
        return {"status": "ok"}

    return application


app = create_app()

