.PHONY: help install install-backend install-frontend setup dev-backend dev-frontend test test-watch clean docker-up docker-down

# Default target
help:
	@echo "PlayBox — Makefile Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make install              Install all dependencies (backend + frontend)"
	@echo "  make setup                Generate PyCharm configs + start all servers"
	@echo ""
	@echo "Development (individual servers):"
	@echo "  make dev-backend          Start backend only (uvicorn)"
	@echo "  make dev-frontend         Start frontend only (vite)"
	@echo ""
	@echo "Testing:"
	@echo "  make test                 Run all backend tests"
	@echo "  make test-watch           Run tests in watch mode"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-up            Start full stack with docker-compose"
	@echo "  make docker-down          Stop docker-compose"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean                Remove venv, node_modules, caches"
	@echo ""

# ---------------------------------------------------------------------------
# Installation
# ---------------------------------------------------------------------------

install: install-backend install-frontend
	@echo "All dependencies installed!"

install-backend:
	@echo "Installing backend dependencies..."
	cd backend && python -m venv .venv && \
	.venv\Scripts\pip install -r requirements.txt

install-frontend:
	@echo "Installing frontend dependencies..."
	cd frontend && npm install

# ---------------------------------------------------------------------------
# Setup — one command to rule them all
# ---------------------------------------------------------------------------

setup:
	python setup.py

# ---------------------------------------------------------------------------
# Development (individual servers, for debugging)
# ---------------------------------------------------------------------------

dev-backend:
	@echo "Starting backend (uvicorn on http://localhost:8015 and your LAN IP on port 8015)..."
	cd backend && .venv\Scripts\uvicorn app.main:app --reload --host 0.0.0.0 --port 8015

dev-frontend:
	@echo "Starting frontend (vite on http://localhost:5173 and your LAN IP on port 5173)..."
	cd frontend && npm run dev

# ---------------------------------------------------------------------------
# Testing
# ---------------------------------------------------------------------------

test:
	@echo "Running backend tests..."
	cd backend && .venv\Scripts\python -m pytest tests/ -v

test-watch:
	@echo "Running tests in watch mode..."
	cd backend && .venv\Scripts\python -m pytest tests/ -v --tb=short -x

# ---------------------------------------------------------------------------
# Docker
# ---------------------------------------------------------------------------

docker-up:
	docker compose up --build

docker-down:
	docker compose down

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

clean:
	@echo "Cleaning up..."
	rm -rf backend/.venv
	rm -rf frontend/node_modules
	rm -rf backend/.pytest_cache
	rm -rf backend/__pycache__
	@echo "Done."
