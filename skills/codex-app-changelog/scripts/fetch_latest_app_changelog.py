#!/usr/bin/env python3
"""Fetch the latest Codex app changelog entry from OpenAI Developers."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable
from urllib.error import URLError
from urllib.request import Request, urlopen


SOURCE_URL = "https://developers.openai.com/codex/changelog?type=codex-app"
BASE_SOURCE_URL = "https://developers.openai.com/codex/changelog"
TOPIC = "codex-app"
SKILL_DIR = Path(__file__).resolve().parent.parent
DEFAULT_OUT_DIR = SKILL_DIR / "changelogs"
VERSION_RE = re.compile(r"\b(\d{2}\.\d{3}(?:\.\d+)?)\b")


class FetchError(RuntimeError):
    pass


def comparable_markdown(text: str) -> str:
    return "\n".join(
        line for line in text.replace("\r\n", "\n").replace("\r", "\n").splitlines()
        if not line.startswith("fetched:")
    ).strip()


@dataclass
class Entry:
    entry_id: str
    topics: list[str]
    published: str
    title: str
    body: str


def collapse_space(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def source_for_entry(entry_id: str) -> str:
    return f"{BASE_SOURCE_URL}#{entry_id}"


def version_from_title(title: str, entry_id: str) -> str:
    versions = VERSION_RE.findall(title)
    if versions:
        return "-".join(versions)
    if entry_id:
        return entry_id.removeprefix("codex-")
    return dt.date.today().isoformat()


def add_text(buffer: list[str], data: str) -> None:
    text = collapse_space(data)
    if not text:
        return
    previous = buffer[-1] if buffer else ""
    if (
        buffer
        and previous not in {"`", "**", "*"}
        and not previous.endswith((" ", "\n"))
        and not text.startswith((".", ",", ":", ";", ")", "]"))
    ):
        buffer.append(" ")
    buffer.append(text)


def add_inline_marker(buffer: list[str], marker: str, *, closing: bool) -> None:
    if closing and buffer:
        buffer[-1] = f"{buffer[-1]}{marker}"
        return
    if buffer and not buffer[-1].endswith((" ", "\n", "(", "[")):
        buffer.append(" ")
    buffer.append(marker)


class CodexChangelogParser(HTMLParser):
    def __init__(self, topic: str) -> None:
        super().__init__(convert_charrefs=True)
        self.topic = topic
        self.entries: list[Entry] = []

        self.in_entry = False
        self.entry_depth = 0
        self.entry_matches = False
        self.entry_id = ""
        self.entry_topics: list[str] = []

        self.in_article = False
        self.article_depth = 0
        self.time_depth = 0
        self.title_depth = 0
        self.heading_depth = 0
        self.para_depth = 0
        self.list_depth = 0
        self.item_depth = 0

        self.published: list[str] = []
        self.title: list[str] = []
        self.article_lines: list[str] = []
        self.heading_text: list[str] = []
        self.para_text: list[str] = []
        self.item_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = {key: value or "" for key, value in attrs}

        if tag == "li" and "data-codex-topics" in attrs_dict:
            self.in_entry = True
            self.entry_depth = 1
            self.entry_topics = attrs_dict.get("data-codex-topics", "").split()
            self.entry_matches = self.topic in self.entry_topics
            self.entry_id = attrs_dict.get("id", "")
            self.published = []
            self.title = []
            self.article_lines = []
            return

        if not self.in_entry:
            return

        self.entry_depth += 1

        if not self.entry_matches:
            return

        if self.in_article:
            self.article_depth += 1
            self.handle_article_start(tag, attrs_dict)
            return

        if tag == "article":
            self.in_article = True
            self.article_depth = 1
            return
        if tag == "time":
            self.time_depth += 1
            return
        if tag == "h3":
            self.title_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if not self.in_entry:
            return

        if self.entry_matches:
            if self.in_article:
                self.handle_article_end(tag)
                self.article_depth -= 1
                if self.article_depth == 0:
                    self.in_article = False
            elif tag == "time" and self.time_depth:
                self.time_depth -= 1
            elif tag == "h3" and self.title_depth:
                self.title_depth -= 1

        self.entry_depth -= 1
        if self.entry_depth == 0:
            if self.entry_matches:
                body = "\n".join(self.trim_blank_lines(self.article_lines)).strip()
                self.entries.append(
                    Entry(
                        entry_id=self.entry_id,
                        topics=self.entry_topics,
                        published=collapse_space("".join(self.published)),
                        title=collapse_space("".join(self.title)),
                        body=body,
                    )
                )
            self.in_entry = False
            self.entry_matches = False

    def handle_data(self, data: str) -> None:
        if not self.in_entry or not self.entry_matches:
            return

        if self.time_depth:
            add_text(self.published, data)
            return
        if self.title_depth and not self.in_article:
            add_text(self.title, data)
            return
        if self.in_article:
            self.add_article_text(data)

    def handle_article_start(self, tag: str, attrs: dict[str, str]) -> None:
        if tag in {"h2", "h3", "h4", "h5", "h6"}:
            self.heading_depth += 1
            self.heading_text = []
        elif tag == "p":
            self.para_depth += 1
            self.para_text = []
        elif tag in {"ul", "ol"}:
            self.list_depth += 1
        elif tag == "li":
            self.item_depth += 1
            self.item_text = []
        elif tag == "br":
            self.add_article_text("\n")
        elif tag == "code":
            self.add_article_marker("`", closing=False)
        elif tag in {"strong", "b"}:
            self.add_article_marker("**", closing=False)
        elif tag in {"em", "i"}:
            self.add_article_marker("*", closing=False)

    def handle_article_end(self, tag: str) -> None:
        if tag in {"strong", "b"}:
            self.add_article_marker("**", closing=True)
        elif tag in {"em", "i"}:
            self.add_article_marker("*", closing=True)
        elif tag == "code":
            self.add_article_marker("`", closing=True)

        if tag in {"h2", "h3", "h4", "h5", "h6"} and self.heading_depth:
            heading = collapse_space("".join(self.heading_text))
            if heading:
                self.append_block(f"## {heading}")
            self.heading_depth -= 1
            self.heading_text = []
        elif tag == "p" and self.para_depth:
            paragraph = collapse_space("".join(self.para_text))
            if paragraph:
                self.append_block(paragraph)
            self.para_depth -= 1
            self.para_text = []
        elif tag == "li" and self.item_depth:
            item = collapse_space("".join(self.item_text))
            if item:
                self.article_lines.append(f"- {item}")
            self.item_depth -= 1
            self.item_text = []
        elif tag in {"ul", "ol"} and self.list_depth:
            self.list_depth -= 1
            self.append_blank()

    def add_article_text(self, data: str) -> None:
        if self.heading_depth:
            add_text(self.heading_text, data)
        elif self.item_depth:
            add_text(self.item_text, data)
        elif self.para_depth:
            add_text(self.para_text, data)

    def add_article_marker(self, marker: str, *, closing: bool) -> None:
        if self.heading_depth:
            add_inline_marker(self.heading_text, marker, closing=closing)
        elif self.item_depth:
            add_inline_marker(self.item_text, marker, closing=closing)
        elif self.para_depth:
            add_inline_marker(self.para_text, marker, closing=closing)

    def append_block(self, text: str) -> None:
        self.append_blank()
        self.article_lines.append(text)
        self.append_blank()

    def append_blank(self) -> None:
        if self.article_lines and self.article_lines[-1] != "":
            self.article_lines.append("")

    @staticmethod
    def trim_blank_lines(lines: Iterable[str]) -> list[str]:
        trimmed = list(lines)
        while trimmed and not trimmed[0]:
            trimmed.pop(0)
        while trimmed and not trimmed[-1]:
            trimmed.pop()
        return trimmed


def fetch_html(url: str) -> str:
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urlopen(request, timeout=60) as response:
            return response.read().decode("utf-8")
    except URLError as exc:
        raise FetchError(f"Failed to fetch {url}: {exc}") from exc


def fetch_entries(url: str, topic: str) -> list[Entry]:
    parser = CodexChangelogParser(topic=topic)
    parser.feed(fetch_html(url))
    return parser.entries


def select_entry(entries: list[Entry], entry_id: str | None) -> Entry:
    if not entries:
        raise FetchError(f"No Codex app changelog entries found for topic `{TOPIC}`.")
    if not entry_id:
        return entries[0]
    for entry in entries:
        if entry.entry_id == entry_id:
            return entry
    raise FetchError(f"No Codex app changelog entry found with id `{entry_id}`.")


def markdown_for_entry(entry: Entry) -> str:
    version = version_from_title(entry.title, entry.entry_id)
    fetched = dt.date.today().isoformat()
    source = source_for_entry(entry.entry_id)
    body = entry.body.strip()

    frontmatter = [
        "---",
        f"version: {json.dumps(version)}",
        f"entry_id: {json.dumps(entry.entry_id)}",
        f"title: {json.dumps(entry.title, ensure_ascii=False)}",
        f"source: {source}",
        f"published: {json.dumps(entry.published)}",
        f"fetched: {fetched}",
        "language: en",
        f"topic: {TOPIC}",
        "---",
        "",
        f"# Codex App {version}",
        "",
        f"## {entry.title}",
        "",
        body,
        "",
    ]
    return "\n".join(frontmatter)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--save", action="store_true", help="Save markdown to changelogs/<version>.md")
    ap.add_argument("--output-dir", default=str(DEFAULT_OUT_DIR), help="Directory for --save output")
    ap.add_argument("--json", action="store_true", help="Print selected entry metadata as JSON")
    ap.add_argument("--entry-id", default=None, help="Fetch a specific changelog entry id")
    ap.add_argument("--url", default=SOURCE_URL, help="Codex changelog URL")
    args = ap.parse_args()
    out_dir = Path(args.output_dir).expanduser().resolve()

    try:
        entry = select_entry(fetch_entries(args.url, TOPIC), args.entry_id)
    except FetchError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    version = version_from_title(entry.title, entry.entry_id)
    markdown = markdown_for_entry(entry)

    if args.json:
        payload = {
            "version": version,
            "entry_id": entry.entry_id,
            "title": entry.title,
            "source": source_for_entry(entry.entry_id),
            "published": entry.published,
            "topics": entry.topics,
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
