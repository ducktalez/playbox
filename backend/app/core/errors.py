"""Standardized error handling for the PlayBox API.

All API errors follow the format: { "detail": "...", "code": "MACHINE_READABLE_CODE" }
"""

from fastapi import HTTPException


class AppError(HTTPException):
    """Application error with a machine-readable code.

    Usage:
        raise AppError(404, "Question not found", "QUESTION_NOT_FOUND")
    """

    def __init__(self, status_code: int, detail: str, code: str) -> None:
        super().__init__(status_code=status_code, detail=detail)
        self.code = code


# Common HTTP status code → default code mapping
STATUS_CODE_MAP: dict[int, str] = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
}

