"""Download WWM sound assets from archive.org.

Source: https://archive.org/download/WerWirdMillionaerSoundtracks

Run standalone:
    python scripts/download_sounds.py

Or check what's missing without downloading:
    python scripts/download_sounds.py --check

Called automatically by setup.py when sounds are missing.
"""

from __future__ import annotations

import argparse
import sys
import urllib.parse
import urllib.request
from pathlib import Path

# ---------------------------------------------------------------------------
# Manifest: local filename → archive.org source filename
# ---------------------------------------------------------------------------
# Source base URL for all files:
_BASE_URL = "https://archive.org/download/WerWirdMillionaerSoundtracks"

# Maps the clean local name to the original filename on archive.org.
# Verify / extend this list if archive.org renames or adds files.
SOUND_MANIFEST: dict[str, str] = {
    "intro.mp3":            "WWM_Intro.mp3",
    "outro.mp3":            "WWM_Outro.mp3",
    "lock-in.mp3":          "WWM_Einsatz.mp3",
    "after-selection.mp3":  "WWM_Antwortwahl.mp3",
    "after-correct.mp3":    "WWM_Richtig.mp3",
    "after-safety.mp3":     "WWM_Sicherheitsstufe.mp3",
    "question-low.mp3":     "WWM_Frage_1-5.mp3",
    "question-mid.mp3":     "WWM_Frage_6-10.mp3",
    "question-high.mp3":    "WWM_Frage_11-14.mp3",
    "question-million.mp3": "WWM_Frage_15.mp3",
    "correct-low.mp3":      "WWM_Richtig_1-5.mp3",
    "correct-mid.mp3":      "WWM_Richtig_6-10.mp3",
    "correct-high.mp3":     "WWM_Richtig_11-14.mp3",
    "correct-million.mp3":  "WWM_Richtig_15.mp3",
    "wrong-low.mp3":        "WWM_Falsch_1-5.mp3",
    "wrong-mid.mp3":        "WWM_Falsch_6-10.mp3",
    "wrong-high.mp3":       "WWM_Falsch_11-14.mp3",
    "wrong-million.mp3":    "WWM_Falsch_15.mp3",
    "fifty-fifty.mp3":      "WWM_5050.mp3",
    "audience-joker.mp3":   "WWM_Publikumsjoker.mp3",
    "phone-joker.mp3":      "WWM_Telefonjoker.mp3",
    "safety-1.mp3":         "WWM_Sicherheitsnetz_500.mp3",
    "safety-2.mp3":         "WWM_Sicherheitsnetz_16000.mp3",
    "win.mp3":              "WWM_Gewonnen.mp3",
    "win-2.mp3":            "WWM_Gewonnen_2.mp3",
}

# Where to save the files
_SOUNDS_DIR = (
    Path(__file__).resolve().parents[1]
    / "frontend" / "public" / "media" / "sounds" / "wwm"
)


def _download_file(url: str, dest: Path) -> None:
    """Download a single file with a progress indicator."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        with urllib.request.urlopen(url, timeout=30) as response:  # noqa: S310
            total = int(response.headers.get("Content-Length", 0))
            downloaded = 0
            chunk_size = 64 * 1024  # 64 KB
            with dest.open("wb") as f:
                while True:
                    chunk = response.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total:
                        pct = downloaded * 100 // total
                        print(f"\r    {dest.name}: {pct}%", end="", flush=True)
            print(f"\r    ✓ {dest.name:<35} ({downloaded // 1024} KB)")
    except Exception as exc:
        # Remove partial file on error
        if dest.exists():
            dest.unlink()
        raise RuntimeError(f"Failed to download {dest.name}: {exc}") from exc


def missing_sounds() -> list[str]:
    """Return local filenames that are not yet downloaded."""
    return [
        local_name
        for local_name in SOUND_MANIFEST
        if not (_SOUNDS_DIR / local_name).exists()
    ]


def download_sounds(force: bool = False) -> bool:
    """Download all missing sound files.  Returns True if all succeeded."""
    targets = list(SOUND_MANIFEST.keys()) if force else missing_sounds()

    if not targets:
        print("✅  All sound files are already present.")
        return True

    print(f"🎵  Downloading {len(targets)} sound file(s) from archive.org …")
    errors: list[str] = []

    for local_name in targets:
        archive_name = SOUND_MANIFEST[local_name]
        url = f"{_BASE_URL}/{urllib.parse.quote(archive_name)}"
        dest = _SOUNDS_DIR / local_name
        try:
            _download_file(url, dest)
        except RuntimeError as exc:
            print(f"    ✗ {exc}")
            errors.append(local_name)

    if errors:
        print(
            f"\n⚠️  {len(errors)} file(s) failed to download. "
            "Check the SOUND_MANIFEST in scripts/download_sounds.py "
            "and verify the archive.org filenames match."
        )
        print("   Failed:", ", ".join(errors))
        return False

    print(f"\n✅  All {len(targets)} sound file(s) downloaded successfully.")
    return True


def check_sounds() -> None:
    """Print a status table of all expected sound files."""
    missing = set(missing_sounds())
    print(f"Sound files — {_SOUNDS_DIR}")
    print("-" * 50)
    for local_name in SOUND_MANIFEST:
        status = "✗ MISSING" if local_name in missing else "✓ present"
        print(f"  {status:<12} {local_name}")
    print("-" * 50)
    if missing:
        print(f"  {len(missing)} missing — run: python scripts/download_sounds.py")
    else:
        print("  All present.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download WWM sound assets.")
    parser.add_argument(
        "--check", action="store_true", help="Only list status, do not download."
    )
    parser.add_argument(
        "--force", action="store_true", help="Re-download even present files."
    )
    args = parser.parse_args()

    if args.check:
        check_sounds()
    else:
        ok = download_sounds(force=args.force)
        sys.exit(0 if ok else 1)



