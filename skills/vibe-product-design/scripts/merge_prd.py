#!/usr/bin/env python3
"""把分章文档合并成一份完整、干净的 PRD.md。

用法：
    python3 merge_prd.py <分章文档所在目录> [--title "产品名"] [--out PRD.md] [--no-lint]

它会：
  1. 用 mdformat（CommonMark+GFM）就地规范化每个分章文件与 _changelog.md（--no-lint 可关）；
  2. 按章节序号(00→05)、再按续写段序号(主文件→.part2→.part3…)排序所有分章文件；
  3. 去掉每个续写段开头的 `<!-- 续写自 ... -->` 标记行；
  4. 若存在 `_changelog.md`，把它作为「变更记录」表嵌入 PRD 开头（标题之后、目录之前）；
  5. 拼成一份带「文档信息 + 变更记录 + 自动生成目录」的 PRD.md，再整体过一遍 mdformat，输出到同一目录。

依赖：Markdown 规范化用 mdformat（建议 `pip install mdformat mdformat-gfm`）。未安装时
自动跳过规范化并提示，不影响合并本身。

分章文件命名约定（与 SKILL.md 一致）：
    00-产品概述.md   01-需求分析.md   02-商业画布.md
    03-用户旅程.md   04-业务流程.md   05-功能设计.md
续写段：在主文件名后加 .partN，例如 05-功能设计.part2.md
变更记录：`_changelog.md`（下划线开头，不计为章节；内容为一张 Markdown 变更表）。
"""
import argparse
import datetime
import re
import sys
from pathlib import Path

# 章节序号 -> 在 PRD 里的展示名（仅用于目录/缺失提示；正文标题以文件内容为准）
CHAPTER_NAMES = {
    "00": "产品概述",
    "01": "需求分析",
    "02": "商业画布",
    "03": "用户旅程",
    "04": "业务流程",
    "05": "功能设计",
}

CONTINUE_MARK = re.compile(r"^\s*<!--\s*续写自.*?-->\s*$")
# 匹配形如 03-用户旅程.md 或 03-用户旅程.part2.md
FILE_RE = re.compile(r"^(?P<num>\d{2})-(?P<name>.+?)(?:\.part(?P<part>\d+))?\.md$")

# ---- Markdown lint / 规范化（用现成的 mdformat，不自己手写规则）----
def lint_markdown(text: str):
    """用 mdformat（CommonMark + GFM）规范化 Markdown，返回 (规范化文本, 是否生效)。

    mdformat 是成熟的 Python Markdown 格式化库，保证格式化不改变渲染结果：
      - 标题前后空行、列表缩进、表格对齐、去行尾空白、合并多余空行、文件末尾单换行等
      - GFM 表格、frontmatter 走插件；Mermaid 等代码块内容原样保留
    未安装时优雅降级：原样返回并提示安装 `pip install mdformat mdformat-gfm`。
    """
    try:
        import mdformat
    except ImportError:
        return text, False
    extensions = {"gfm"}
    try:
        import mdformat_frontmatter  # noqa: F401  装了就支持 YAML frontmatter
        extensions.add("frontmatter")
    except ImportError:
        pass
    # wrap=keep：不重排中文段落（保留语义换行），只修结构性格式
    return mdformat.text(text, extensions=extensions, options={"wrap": "keep"}), True


def collect(src: Path):
    """返回按 (章节号, part号) 排序的文件列表。"""
    files = []
    for p in src.glob("*.md"):
        if p.name == "PRD.md":
            continue
        m = FILE_RE.match(p.name)
        if not m:
            continue
        num = m.group("num")
        part = int(m.group("part")) if m.group("part") else 1
        files.append((num, part, p))
    files.sort(key=lambda t: (t[0], t[1]))
    return files


def read_body(path: Path) -> str:
    """读取文件正文，去掉续写标记行，去掉首尾多余空行。"""
    lines = path.read_text(encoding="utf-8").splitlines()
    lines = [ln for ln in lines if not CONTINUE_MARK.match(ln)]
    text = "\n".join(lines).strip("\n")
    return text


def read_changelog(src: Path) -> str:
    """读取 _changelog.md 正文（去掉首尾空行）；不存在返回空串。"""
    p = src / "_changelog.md"
    if not p.is_file():
        return ""
    return p.read_text(encoding="utf-8").strip("\n")


def first_heading(body: str, fallback: str) -> str:
    """取正文里第一个 # 标题作为目录条目，没有就用 fallback。"""
    for ln in body.splitlines():
        s = ln.strip()
        if s.startswith("#"):
            return s.lstrip("#").strip()
    return fallback


def lint_sources(src: Path) -> bool:
    """就地规范化目录下的分章文件与 _changelog.md。返回 mdformat 是否可用。

    续写标记行 `<!-- 续写自 ... -->` 在 read_body 里才剔除；mdformat 会保留 HTML
    注释，所以这里就地格式化不会破坏标记。
    """
    targets = [p for p in src.glob("*.md") if p.name != "PRD.md"]
    cl = src / "_changelog.md"
    if cl.is_file() and cl not in targets:
        targets.append(cl)
    available = True
    changed = 0
    for p in sorted(targets):
        original = p.read_text(encoding="utf-8")
        formatted, ok = lint_markdown(original)
        if not ok:
            available = False
            break  # 没装 mdformat，不必继续逐个尝试
        if formatted != original:
            p.write_text(formatted, encoding="utf-8")
            changed += 1
    if available and changed:
        print(f"🧹 mdformat 已规范化 {changed} 个分章文件")
    return available


def main():
    ap = argparse.ArgumentParser(description="合并分章文档为完整 PRD.md")
    ap.add_argument("src", help="分章文档所在目录")
    ap.add_argument("--title", default=None, help="产品名（用于 PRD 标题）")
    ap.add_argument("--out", default="PRD.md", help="输出文件名（默认 PRD.md）")
    ap.add_argument("--no-lint", action="store_true",
                    help="跳过 mdformat 规范化（默认会对分章文件与最终 PRD 做格式化）")
    args = ap.parse_args()

    src = Path(args.src).expanduser().resolve()
    if not src.is_dir():
        sys.exit(f"目录不存在：{src}")

    # 合并前：先用 mdformat 把每个分章文件（含 _changelog.md）就地规范化
    lint_on = not args.no_lint
    lint_available = True
    if lint_on:
        lint_available = lint_sources(src)

    files = collect(src)
    if not files:
        sys.exit(f"在 {src} 没找到符合命名规范的分章文件（如 00-产品概述.md）。")

    # 按章节聚合（同一章节的多个 part 顺序拼接；files 已按 (num, part) 排序）
    seen_nums = []
    by_num = {}
    for num, _part, path in files:
        body = read_body(path)
        by_num.setdefault(num, []).append(body)
        if num not in seen_nums:
            seen_nums.append(num)

    today = datetime.date.today().isoformat()
    title = args.title or src.name
    changelog = read_changelog(src)
    present = [n for n in seen_nums]
    missing = [n for n in CHAPTER_NAMES if n not in present]

    # 目录
    toc_lines = []
    merged_bodies = []
    for num in seen_nums:
        body = "\n\n".join(by_num[num]).strip("\n")
        heading = first_heading(body, f"{num} · {CHAPTER_NAMES.get(num, '')}")
        toc_lines.append(f"- {heading}")
        merged_bodies.append(body)

    parts = []
    parts.append(f"# {title} · 产品需求文档（PRD）\n")
    parts.append(f"_生成日期：{today} · 由 vibe-product-design 流水线自动合并_\n")
    if missing:
        miss_str = "、".join(f"{n} {CHAPTER_NAMES[n]}" for n in missing)
        parts.append(f"> ⚠️ 注意：以下章节尚未产出，PRD 暂不完整：{miss_str}\n")
    if changelog:
        parts.append(changelog + "\n")
    parts.append("## 目录\n")
    parts.append("\n".join(toc_lines) + "\n")
    # 章节之间靠各自的一级标题自然分隔，不再插入 `---`
    # （mdformat 会把 `---` 规范化成一长串下划线，反而难看）。
    parts.append("\n\n".join(merged_bodies) + "\n")

    prd_text = "\n".join(parts)
    if lint_on and lint_available:
        prd_text, lint_available = lint_markdown(prd_text)  # 最终 PRD 再统一规范化一遍

    out_path = src / args.out
    out_path.write_text(prd_text, encoding="utf-8")

    print(f"✅ PRD 已生成：{out_path}")
    print(f"   合并章节：{'、'.join(present)}")
    if missing:
        print(f"   ⚠️ 缺失章节：{'、'.join(missing)}")
    if lint_on and not lint_available:
        print("   ⚠️ 未安装 mdformat，已跳过 Markdown 规范化。"
              "建议：pip install mdformat mdformat-gfm")
    elif not lint_on:
        print("   ℹ️ 已按 --no-lint 跳过 Markdown 规范化。")


if __name__ == "__main__":
    main()
