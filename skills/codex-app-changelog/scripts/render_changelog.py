#!/usr/bin/env python3
"""Render a Codex App changelog markdown file to a PNG image."""
from __future__ import annotations

import argparse
import html
import os
import re
import sys
from pathlib import Path

import markdown
from playwright.sync_api import sync_playwright


SKILL_DIR = Path(__file__).resolve().parent.parent
DEFAULT_OUT_DIR = SKILL_DIR / "assets" / "rendered"

CSS = """
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
    background: #111316;
    color: #f4f4f5;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC",
        "Helvetica Neue", "Segoe UI", "Noto Sans CJK SC",
        "Source Han Sans SC", "Microsoft YaHei", sans-serif;
    font-size: 26px;
    line-height: 1.65;
    -webkit-font-smoothing: antialiased;
}
main { padding: 80px 88px 88px 88px; }
h1 {
    font-size: 78px;
    font-weight: 800;
    line-height: 1.1;
    margin: 0 0 44px 0;
    color: #ffffff;
}
h2 {
    font-size: 44px;
    font-weight: 700;
    margin: 40px 0 20px 0;
    color: #ffffff;
}
h3 {
    font-size: 32px;
    font-weight: 700;
    margin: 32px 0 16px 0;
    color: #ffffff;
}
p { margin: 0 0 18px 0; }
ul, ol { margin: 0; padding-left: 36px; }
li { margin-bottom: 14px; line-height: 1.6; }
li::marker { color: #8b949e; }
code {
    background: #262a30;
    color: #f4f4f5;
    border-radius: 6px;
    padding: 2px 9px;
    font-family: "SF Mono", "JetBrains Mono", Menlo, Monaco, Consolas,
        "Liberation Mono", monospace;
    font-size: 0.86em;
    font-weight: 500;
    white-space: nowrap;
}
pre {
    background: #0a0c0f;
    border-radius: 10px;
    padding: 20px 24px;
    overflow-x: auto;
    margin: 0 0 24px 0;
}
pre code { background: transparent; padding: 0; font-size: 0.82em; white-space: pre; }
a { color: #9ad0ff; text-decoration: none; }
strong { font-weight: 700; color: #ffffff; }
em { font-style: italic; color: #e4e4e7; }
blockquote {
    border-left: 3px solid #52525b;
    margin: 16px 0;
    padding: 4px 0 4px 20px;
    color: #d4d4d8;
}
hr { border: none; border-top: 1px solid #27272a; margin: 32px 0; }
"""


def strip_frontmatter(text: str) -> str:
    stripped = text.lstrip()
    if stripped.startswith("---"):
        parts = stripped.split("---", 2)
        if len(parts) >= 3:
            return parts[2].lstrip()
    return text


def extract_title_and_body(text: str) -> tuple[str, str]:
    lines = text.splitlines()
    title = ""
    body_lines: list[str] = []
    title_taken = False
    for line in lines:
        if not title_taken:
            match = re.match(r"^\s*#\s+(.+?)\s*$", line)
            if match:
                title = match.group(1).strip()
                title = re.sub(r"[（(]\s*中文版\s*[）)]", "", title).strip()
                title_taken = True
                continue
        body_lines.append(line)
    return title, "\n".join(body_lines).strip()


def render_html(title: str, body_html: str) -> str:
    safe_title = html.escape(title, quote=True)
    return f"""<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{safe_title}</title>
<style>{CSS}</style>
</head>
<body>
<main>
<h1>{safe_title}</h1>
{body_html}
</main>
</body>
</html>"""


def find_local_chromium() -> Path | None:
    browsers_path = os.environ.get("PLAYWRIGHT_BROWSERS_PATH")
    if not browsers_path:
        return None

    root = Path(browsers_path).expanduser()
    candidates = sorted(root.glob("chromium-*/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"))
    if candidates:
        return candidates[-1]
    return None


def render_to_png(html_text: str, out_path: Path, width: int, scale: int) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        local_chromium = find_local_chromium()
        launch_options = {"args": ["--disable-gpu"]}
        if local_chromium:
            launch_options["executable_path"] = str(local_chromium)
        browser = p.chromium.launch(**launch_options)
        context = browser.new_context(
            viewport={"width": width, "height": 1200},
            device_scale_factor=scale,
        )
        page = context.new_page()
        page.set_content(html_text, wait_until="load")
        page.wait_for_load_state("networkidle")
        page.screenshot(path=str(out_path), full_page=True, omit_background=False)
        browser.close()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--input", required=True, help="Path to changelog markdown")
    ap.add_argument("--output", default=None, help="Output PNG path")
    ap.add_argument("--width", type=int, default=1600, help="Image logical width in px")
    ap.add_argument("--scale", type=int, default=2, help="Device pixel ratio")
    args = ap.parse_args()

    in_path = Path(args.input).expanduser().resolve()
    if not in_path.exists():
        print(f"ERROR: input file not found: {in_path}", file=sys.stderr)
        return 2

    text = strip_frontmatter(in_path.read_text(encoding="utf-8"))
    title, body_md = extract_title_and_body(text)
    if not title:
        title = in_path.stem
    body_html = markdown.markdown(body_md, extensions=["fenced_code", "tables", "sane_lists"])

    out_path = Path(args.output).expanduser().resolve() if args.output else DEFAULT_OUT_DIR / f"{in_path.stem}.png"
    print(f"Rendering: {in_path.name} -> {out_path}")
    render_to_png(render_html(title, body_html), out_path, width=args.width, scale=args.scale)
    print(f"Saved: {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
