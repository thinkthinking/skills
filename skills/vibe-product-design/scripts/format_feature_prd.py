#!/usr/bin/env python3
"""用 mdformat 就地规范化单个功能模块 PRD 文件（模式 B 专用，无需合并）。

模式 B 只产出一份文件（`features/<slug>/PRD.md`），不需要 merge_prd.py 那套多文件
拼接逻辑，但同样需要 mdformat 规范化（标题空行、表格对齐、去行尾空白等）。这里直接
复用 merge_prd.py 里现成的 lint_markdown，不重复实现一遍。

用法：
    python3 format_feature_prd.py <PRD.md 路径>
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from merge_prd import lint_markdown  # noqa: E402  复用同一套 mdformat 规范化逻辑


def main():
    if len(sys.argv) != 2:
        sys.exit("用法：python3 format_feature_prd.py <PRD.md 路径>")

    path = Path(sys.argv[1]).expanduser().resolve()
    if not path.is_file():
        sys.exit(f"文件不存在：{path}")

    original = path.read_text(encoding="utf-8")
    formatted, available = lint_markdown(original)

    if not available:
        print("⚠️ 未安装 mdformat，已跳过规范化。建议：pip install mdformat mdformat-gfm")
        return

    if formatted != original:
        path.write_text(formatted, encoding="utf-8")
        print(f"🧹 已用 mdformat 规范化：{path}")
    else:
        print("ℹ️ 格式已规范，无需改动。")


if __name__ == "__main__":
    main()
