#!/usr/bin/env python3
"""Find an existing Claude Code changelog archive for a known upstream version."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


SKILL_DIR = Path(__file__).resolve().parent.parent
DEFAULT_CHANGELOG_DIR = SKILL_DIR / "changelogs"


def is_archive_markdown(path: Path) -> bool:
    return path.suffix == ".md" and not path.name.endswith(".zh.md")


def parse_simple_frontmatter(text: str) -> dict[str, str]:
    if not text.startswith("---\n"):
        return {}
    raw = text.split("\n---\n", 1)[0].removeprefix("---\n")

    data: dict[str, str] = {}
    for line in raw.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = value.strip().strip("\"'")
    return data


def version_sort_key(value: str) -> tuple[int, ...]:
    parts = [int(part) for part in re.findall(r"\d+", value)]
    return tuple(parts) if parts else (0,)


def find_archives(changelog_dir: Path, version: str | None) -> list[tuple[Path, dict[str, str]]]:
    archives: list[tuple[Path, dict[str, str]]] = []
    if not changelog_dir.exists():
        return archives
    for path in changelog_dir.glob("*.md"):
        if not is_archive_markdown(path):
            continue
        if version and path.stem != version:
            continue
        try:
            frontmatter = parse_simple_frontmatter(path.read_text(encoding="utf-8"))
        except OSError:
            continue
        archives.append((path, frontmatter))
    return sorted(
        archives,
        key=lambda item: (
            version_sort_key(item[1].get("version") or item[0].stem),
            item[0].stat().st_mtime,
        ),
        reverse=True,
    )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--changelog-dir", default=str(DEFAULT_CHANGELOG_DIR), help="Directory containing changelog markdown")
    ap.add_argument("--version", required=True, help="Match this upstream version or merged-version filename")
    ap.add_argument("--json", action="store_true", help="Print selected archive metadata as JSON")
    args = ap.parse_args()

    changelog_dir = Path(args.changelog_dir).expanduser().resolve()
    archives = find_archives(changelog_dir, args.version)
    if not archives:
        print("No existing Claude Code changelog archive found.", file=sys.stderr)
        return 1

    path, frontmatter = archives[0]
    if args.json:
        payload = {
            "version": frontmatter.get("version") or path.stem,
            "source": frontmatter.get("source"),
            "fetched": frontmatter.get("fetched"),
            "language": frontmatter.get("language") or "en",
            "reused_local": True,
            "local_path": str(path),
            "status": "local archive found for the selected upstream version",
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
