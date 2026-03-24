"""PlayBox setup — generates PyCharm run configurations and starts all servers.

Usage:
    python setup.py
"""

from __future__ import annotations

import logging
import shutil
import subprocess
import sys
import time
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration (defaults; overridden by backend/.env via pydantic-settings)
# ---------------------------------------------------------------------------

BACKEND_HOST = "localhost"
BACKEND_PORT = 8015
FRONTEND_HOST = "localhost"
FRONTEND_PORT = 5173


def _print(text: str = "") -> None:
    """Print safely even on consoles without full Unicode support."""
    encoding = getattr(sys.stdout, "encoding", None) or "utf-8"
    try:
        print(text)
    except UnicodeEncodeError:
        print(text.encode(encoding, errors="replace").decode(encoding, errors="replace"))


# ---------------------------------------------------------------------------
# PyCharm run-configuration generator
# ---------------------------------------------------------------------------

_PYTHON_CONFIG_TMPL = """\
<?xml version="1.0" encoding="UTF-8"?>
<component name="ProjectRunConfigurationManager">
  <configuration default="false" name="{name}" type="PythonConfigurationType" factoryName="Python">
    <option name="INTERPRETER_OPTIONS" value="" />
    <option name="PARENT_ENVS" value="true" />
    <envs />
    <option name="SDK_HOME" value="" />
    <option name="WORKING_DIRECTORY" value="{working_dir}" />
    <option name="IS_MODULE_SDK" value="true" />
    <option name="ADD_CONTENT_ROOTS" value="true" />
    <option name="ADD_SOURCE_ROOTS" value="true" />
    <option name="SCRIPT_NAME" value="" />
    <option name="PARAMETERS" value="{parameters}" />
    <option name="SHOW_COMMAND_LINE" value="false" />
    <option name="EMULATE_TERMINAL" value="true" />
    <option name="MODULE_MODE" value="true" />
    <option name="REDIRECT_INPUT" value="false" />
    <option name="INPUT_FILE" value="" />
    <option name="MODULE_NAME" value="{module_name}" />
    <method v="2" />
  </configuration>
</component>
"""

_NPM_CONFIG_TMPL = """\
<?xml version="1.0" encoding="UTF-8"?>
<component name="ProjectRunConfigurationManager">
  <configuration default="false" name="{name}" type="js.build_tools.npm">
    <package-json value="{working_dir}/package.json" />
    <command value="run" />
    <scripts value="{npm_script}" />
    <node-interpreter value="project" />
    <envs />
    <method v="2" />
  </configuration>
</component>
"""

_COMPOUND_CONFIG_TMPL = """\
<?xml version="1.0" encoding="UTF-8"?>
<component name="ProjectRunConfigurationManager">
  <configuration default="false" name="{name}" type="CompoundRunConfigurationType">
{children}    <method v="2" />
  </configuration>
</component>
"""


def generate_pycharm_configs(project_root: Path) -> list[Path]:
    """Generate/update PyCharm run configurations in .run/."""
    run_cfg_dir = project_root / ".run"
    run_cfg_dir.mkdir(parents=True, exist_ok=True)

    configs: list[tuple[str, str]] = [
        (
            "PlayBox Backend (uvicorn).run.xml",
            _PYTHON_CONFIG_TMPL.format(
                name="PlayBox Backend (uvicorn)",
                working_dir="$PROJECT_DIR$/backend",
                module_name="uvicorn",
                parameters=f"app.main:app --reload --port {BACKEND_PORT}",
            ),
        ),
        (
            "PlayBox Frontend (vite).run.xml",
            _NPM_CONFIG_TMPL.format(
                name="PlayBox Frontend (vite)",
                working_dir="$PROJECT_DIR$/frontend",
                npm_script="dev",
            ),
        ),
        (
            "PlayBox Backend Tests (pytest).run.xml",
            _PYTHON_CONFIG_TMPL.format(
                name="PlayBox Backend Tests (pytest)",
                working_dir="$PROJECT_DIR$/backend",
                module_name="pytest",
                parameters="tests/ -v",
            ),
        ),
        (
            "PlayBox Fullstack (compound).run.xml",
            _COMPOUND_CONFIG_TMPL.format(
                name="PlayBox Fullstack (compound)",
                children=(
                    '    <toRun name="PlayBox Backend (uvicorn)" type="PythonConfigurationType" />\n'
                    '    <toRun name="PlayBox Frontend (vite)" type="js.build_tools.npm" />\n'
                ),
            ),
        ),
    ]

    created: list[Path] = []
    for filename, content in configs:
        target = run_cfg_dir / filename
        target.write_text(content, encoding="utf-8")
        created.append(target)
        logger.info("Written: %s", target.name)

    return created


# ---------------------------------------------------------------------------
# Dual-server launcher
# ---------------------------------------------------------------------------


def _ensure_env_file(project_root: Path) -> None:
    """Copy .env.example → .env (project root) if .env is missing."""
    env_file = project_root / ".env"
    example_file = project_root / ".env.example"
    if not env_file.exists() and example_file.exists():
        shutil.copy(example_file, env_file)
        _print("📋 Created .env from .env.example — adjust if needed.")


def _ensure_backend_deps(backend_dir: Path, venv_python: Path) -> None:
    """Install backend requirements if uvicorn is missing from the venv."""
    if sys.platform == "win32":
        uvicorn_bin = venv_python.parent / "uvicorn.exe"
    else:
        uvicorn_bin = venv_python.parent / "uvicorn"

    if not uvicorn_bin.exists():
        _print("📦  Backend dependencies missing — running pip install...")
        subprocess.run(
            [str(venv_python), "-m", "pip", "install", "-r", "requirements.txt"],
            cwd=backend_dir,
            check=True,
        )
        _print("    ✓ Backend dependencies installed.\n")


def _ensure_frontend_deps(frontend_dir: Path, npm_cmd: str) -> None:
    """Run npm install if node_modules is missing."""
    if not (frontend_dir / "node_modules").exists():
        _print("📦  Frontend dependencies missing — running npm install...")
        subprocess.run([npm_cmd, "install"], cwd=frontend_dir, check=True)
        _print("    ✓ Frontend dependencies installed.\n")


def serve_all(project_root: Path) -> None:
    """Start backend (uvicorn) and frontend (vite) as subprocesses."""
    backend_dir = project_root / "backend"
    frontend_dir = project_root / "frontend"

    if sys.platform == "win32":
        venv_python = backend_dir / ".venv" / "Scripts" / "python.exe"
    else:
        venv_python = backend_dir / ".venv" / "bin" / "python"

    if not venv_python.exists():
        _print("❌  Backend venv not found.")
        _print("    Run:  cd backend && python -m venv .venv && pip install -r requirements.txt")
        sys.exit(1)

    npm_cmd = shutil.which("npm")
    if npm_cmd is None:
        _print("❌  npm not found on PATH. Install Node.js 20+ and retry.")
        sys.exit(1)

    # Auto-install missing dependencies before starting
    _ensure_backend_deps(backend_dir, venv_python)
    _ensure_frontend_deps(frontend_dir, npm_cmd)

    backend_cmd = [str(venv_python), "-m", "uvicorn", "app.main:app", "--reload", "--port", str(BACKEND_PORT)]
    frontend_cmd = [npm_cmd, "run", "dev"]

    _print()
    _print("=" * 60)
    _print("🚀  PlayBox — Starting all servers")
    _print("=" * 60)
    _print(f"   Backend   →  http://{BACKEND_HOST}:{BACKEND_PORT}")
    _print(f"   Frontend  →  http://{FRONTEND_HOST}:{FRONTEND_PORT}")
    _print("=" * 60)
    _print("   Press Ctrl+C to stop.\n")

    backend_proc = subprocess.Popen(backend_cmd, cwd=backend_dir)
    frontend_proc = subprocess.Popen(frontend_cmd, cwd=frontend_dir)

    logger.info("Started backend pid=%s, frontend pid=%s", backend_proc.pid, frontend_proc.pid)

    try:
        while True:
            if backend_proc.poll() is not None or frontend_proc.poll() is not None:
                logger.warning("A child process exited unexpectedly.")
                break
            time.sleep(0.5)
    except KeyboardInterrupt:
        logger.info("Interrupted — shutting down.")
    finally:
        for proc, name in ((backend_proc, "backend"), (frontend_proc, "frontend")):
            if proc.poll() is None:
                proc.terminate()
        for proc, name in ((backend_proc, "backend"), (frontend_proc, "frontend")):
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)
        _print("\n✅  All servers stopped.")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    project_root = Path(__file__).parent

    # 1. Ensure backend/.env exists (copy from .env.example if missing)
    _ensure_env_file(project_root)

    # 2. Generate PyCharm run configurations
    _print("🔧  Generating PyCharm run configurations...")
    configs = generate_pycharm_configs(project_root)
    for cfg in configs:
        _print(f"    ✓ {cfg.name}")
    _print("    PyCharm will pick these up automatically on next IDE refresh.\n")

    # 3. Start backend + frontend
    serve_all(project_root)


if __name__ == "__main__":
    main()

