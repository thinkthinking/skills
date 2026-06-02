#!/usr/bin/env python3
"""Fetch the latest usable OpenAI Codex release notes with GitHub CLI.

The Codex CLI repository publishes GitHub releases rather than a single
CHANGELOG.md. This helper uses `gh api` as the only GitHub access path. If
GitHub CLI auth is missing or expired, it stops and asks the user to log in.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any


OWNER = "openai"
REPO = "codex"
SKILL_DIR = Path(__file__).resolve().parent.parent
DEFAULT_OUT_DIR = SKILL_DIR / "changelogs"

PRERELEASE_RE = re.compile(
    r"(?:^|[-_.])(alpha|beta|rc|pre|preview|nightly|snapshot|canary)(?:[-_.]|\d|$)",
    re.IGNORECASE,
)
VERSION_RE = re.compile(r"(?:codex[-_])?(?:rust[-_])?v?(\d+\.\d+\.\d+(?:\.\d+)?)", re.IGNORECASE)
GENERATED_SECTION_RE = re.compile(
    r"^\s*#{1,3}\s+(what'?s changed|new contributors|contributors|full changelog|changelog)\b",
    re.IGNORECASE,
)
FULL_CHANGELOG_RE = re.compile(r"^\s*(?:\*\*)?full changelog(?:\*\*)?\s*:", re.IGNORECASE)
PR_BULLET_RE = re.compile(r"^\s*[-*]\s+.*#\d{2,}.*@\S+", re.IGNORECASE)


class FetchError(RuntimeError):
    pass


def comparable_markdown(text: str) -> str:
    return "\n".join(
        line for line in text.replace("\r\n", "\n").replace("\r", "\n").splitlines()
        if not line.startswith("fetched:")
    ).strip()


def request_json(path: str, query: dict[str, str | int] | None = None) -> Any:
    endpoint = f"repos/{OWNER}/{REPO}{path}"
    if query:
        query_text = "&".join(f"{key}={value}" for key, value in query.items())
        endpoint = f"{endpoint}?{query_text}"
    args = ["gh", "api", endpoint]

    try:
        proc = subprocess.run(
            args,
            check=False,
            text=True,
            capture_output=True,
            timeout=60,
        )
    except FileNotFoundError as exc:
        raise FetchError("GitHub CLI `gh` is not installed or not on PATH.") from exc
    except subprocess.TimeoutExpired as exc:
        raise FetchError(f"`gh api {endpoint}` timed out.") from exc

    if proc.returncode != 0:
        stderr = proc.stderr.strip() or proc.stdout.strip()
        if "gh auth login" in stderr or "GH_TOKEN" in stderr or "Bad credentials" in stderr:
            raise FetchError(
                "GitHub CLI authentication is missing or expired. "
                "Run `gh auth login -h github.com` or set `GH_TOKEN`, then retry. "
                f"gh said: {stderr}"
            )
        raise FetchError(f"`{' '.join(args)}` failed: {stderr}")

    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise FetchError(f"`gh api {endpoint}` returned invalid JSON: {proc.stdout[:500]}") from exc


def release_label(release: dict[str, Any]) -> str:
    return " ".join(
        str(release.get(key) or "")
        for key in ("tag_name", "name", "html_url")
    ).strip()


def canonical_version(release: dict[str, Any]) -> str:
    label = release_label(release)
    match = VERSION_RE.search(label)
    if match:
        return match.group(1)
    return str(release.get("tag_name") or release.get("name") or release.get("id"))


def is_non_codex_release(release: dict[str, Any]) -> bool:
    label = release_label(release).lower()
    return "rusty-v8" in label or "librusty" in label


def is_prerelease_by_name(release: dict[str, Any]) -> bool:
    return bool(PRERELEASE_RE.search(release_label(release)))


def strip_generated_sections(body: str) -> tuple[str, list[str]]:
    lines = body.replace("\r\n", "\n").replace("\r", "\n").splitlines()
    kept: list[str] = []
    removed: list[str] = []
    skipping = False

    for line in lines:
        if GENERATED_SECTION_RE.match(line) or FULL_CHANGELOG_RE.match(line):
            removed.append(line.strip() or line)
            skipping = True
            continue
        if skipping:
            if re.match(r"^\s*#{1,3}\s+", line):
                # Resume only if this is not another generated section.
                if GENERATED_SECTION_RE.match(line) or FULL_CHANGELOG_RE.match(line):
                    removed.append(line.strip() or line)
                    continue
                skipping = False
                kept.append(line)
            else:
                removed.append(line.strip() or line)
            continue
        kept.append(line)

    cleaned = "\n".join(kept).strip()
    return cleaned, [item for item in removed if item]


def looks_like_generated_pr_notes(body: str) -> bool:
    lines = [line for line in body.splitlines() if line.strip()]
    if not lines:
        return True

    pr_bullets = [line for line in lines if PR_BULLET_RE.match(line)]
    generated_heading_count = sum(1 for line in lines if GENERATED_SECTION_RE.match(line))
    has_full_changelog = any(FULL_CHANGELOG_RE.match(line) for line in lines)

    if generated_heading_count or has_full_changelog:
        non_heading_lines = [
            line for line in lines
            if not GENERATED_SECTION_RE.match(line) and not FULL_CHANGELOG_RE.match(line)
        ]
        if non_heading_lines and len(pr_bullets) / len(non_heading_lines) >= 0.6:
            return True
    return len(pr_bullets) >= 8 and len(pr_bullets) / len(lines) >= 0.7


def usable_release(
    release: dict[str, Any],
    *,
    allow_generated: bool,
) -> tuple[bool, str, str, list[str]]:
    if release.get("draft"):
        return False, "", "draft release", []
    if release.get("prerelease") or is_prerelease_by_name(release):
        return False, "", "prerelease release", []
    if is_non_codex_release(release):
        return False, "", "non-Codex dependency release", []

    body = str(release.get("body") or "").strip()
    if not body:
        return False, "", "empty release body", []

    cleaned, removed = strip_generated_sections(body)
    if not allow_generated and looks_like_generated_pr_notes(body):
        if cleaned and not looks_like_generated_pr_notes(cleaned):
            return True, cleaned, "kept curated sections and removed generated PR notes", removed
        return False, "", "generated PR release notes only", removed

    if not cleaned:
        return False, "", "no content left after removing generated sections", removed
    return True, cleaned, "ok", removed


def find_latest_release(
    *,
    allow_generated: bool,
    max_pages: int,
) -> tuple[dict[str, Any], str, str, list[str]]:
    skipped: list[str] = []

    try:
        latest = request_json("/releases/latest")
        ok, body, reason, removed = usable_release(latest, allow_generated=allow_generated)
        if ok:
            return latest, body, reason, removed
        skipped.append(f"{latest.get('tag_name')}: {reason}")
    except FetchError as exc:
        raise FetchError(str(exc)) from exc

    for page in range(1, max_pages + 1):
        releases = request_json("/releases", {"per_page": 30, "page": page})
        if not releases:
            break
        for release in releases:
            ok, body, reason, removed = usable_release(release, allow_generated=allow_generated)
            if ok:
                if skipped:
                    release["_codex_changelog_skipped"] = skipped
                return release, body, reason, removed
            skipped.append(f"{release.get('tag_name')}: {reason}")

    raise FetchError("No usable latest Codex release found. Skipped: " + "; ".join(skipped[:20]))


def markdown_for_release(
    release: dict[str, Any],
    body: str,
    reason: str,
    removed: list[str],
) -> str:
    version = canonical_version(release)
    fetched = dt.date.today().isoformat()
    source = str(release.get("html_url") or f"https://github.com/{OWNER}/{REPO}/releases")
    tag = str(release.get("tag_name") or "")
    published = str(release.get("published_at") or "")

    frontmatter = [
        "---",
        f"version: {version}",
        f"tag: {json.dumps(tag)}",
        f"source: {source}",
        f"published: {json.dumps(published)}",
        f"fetched: {fetched}",
        "language: en",
        f"generated_notes_handling: {json.dumps(reason)}",
        "---",
        "",
        f"# Codex CLI {version}",
        "",
        body.strip(),
        "",
    ]
    return "\n".join(frontmatter)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--save", action="store_true", help="Save markdown to changelogs/<version>.md")
    ap.add_argument("--output-dir", default=str(DEFAULT_OUT_DIR), help="Directory for --save output")
    ap.add_argument("--json", action="store_true", help="Print selected release metadata as JSON")
    ap.add_argument(
        "--allow-generated",
        action="store_true",
        help="Allow auto-generated PR release notes if no curated content is present",
    )
    ap.add_argument("--max-pages", type=int, default=3, help="Release-list pages to scan after latest")
    args = ap.parse_args()
    out_dir = Path(args.output_dir).expanduser().resolve()

    try:
        release, body, reason, removed = find_latest_release(
            allow_generated=args.allow_generated,
            max_pages=args.max_pages,
        )
    except FetchError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    version = canonical_version(release)
    markdown = markdown_for_release(release, body, reason, removed)

    if args.json:
        payload = {
            "version": version,
            "tag_name": release.get("tag_name"),
            "name": release.get("name"),
            "html_url": release.get("html_url"),
            "published_at": release.get("published_at"),
            "generated_notes_handling": reason,
            "removed_generated_lines": removed[:20],
            "skipped": release.get("_codex_changelog_skipped", []),
        }
        out_path = out_dir / f"{version}.md"
        if out_path.exists():
            existing = out_path.read_text(encoding="utf-8")
            payload["existing_local_path"] = str(out_path)
            payload["archive_status"] = (
                "unchanged"
                if comparable_markdown(existing) == comparable_markdown(markdown)
                else "different"
            )
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(markdown)

    if args.save:
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"{version}.md"
        if out_path.exists():
            existing = out_path.read_text(encoding="utf-8")
            if comparable_markdown(existing) == comparable_markdown(markdown):
                print(f"Skipped unchanged: {out_path}", file=sys.stderr)
                return 0
        out_path.write_text(markdown, encoding="utf-8")
        print(f"Saved: {out_path}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
