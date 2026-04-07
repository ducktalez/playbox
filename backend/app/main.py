"""PlayBox — FastAPI application entry point."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from app.core.database import init_pg_db, init_sqlite_db
from app.core.errors import STATUS_CODE_MAP, AppError
from app.games.chess.router import router as chess_router
from app.games.imposter.router import router as imposter_router
from app.games.piccolo.router import router as piccolo_router
from app.games.quiz.router import router as quiz_router
from app.games.quiz.seed import seed_questions


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: startup and shutdown events."""
    # Startup
    Path(settings.media_dir).mkdir(parents=True, exist_ok=True)
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
    application.include_router(chess_router, prefix="/api/v1/chess", tags=["Chess"])

    # Serve uploaded media files at /media/
    media_path = Path(settings.media_dir)
    media_path.mkdir(parents=True, exist_ok=True)
    application.mount("/media", StaticFiles(directory=str(media_path)), name="media")

    @application.get("/health", tags=["System"])
    async def health_check() -> dict[str, str]:
        return {"status": "ok"}

    @application.get("/api/v1/config/offline", tags=["System"])
    async def offline_config() -> dict[str, int]:
        """Return configured offline cache sizes so the frontend knows how much to request."""
        return {
            "quiz_questions": settings.offline_quiz_questions,
            "imposter_words": settings.offline_imposter_words,
            "piccolo_challenges": settings.offline_piccolo_challenges,
        }

    # --- Standardized error responses: { "detail": "...", "code": "..." } ---

    @application.exception_handler(AppError)
    async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "code": exc.code},
        )

    @application.exception_handler(HTTPException)
    async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
        code = STATUS_CODE_MAP.get(exc.status_code, "ERROR")
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": str(exc.detail), "code": code},
        )

    @application.exception_handler(SQLAlchemyError)
    async def sqlalchemy_error_handler(_request: Request, exc: SQLAlchemyError) -> JSONResponse:
        """Catch unhandled DB errors (e.g. schema drift, missing column) and return 500.

        Prevents raw tracebacks from crashing the ASGI app.
        In development, the detail includes the raw error to aid debugging.
        TODO: post-dev — strip internal detail from production responses.
        """
        return JSONResponse(
            status_code=500,
            content={"detail": str(exc).splitlines()[0], "code": "DATABASE_ERROR"},
        )

    return application


app = create_app()
