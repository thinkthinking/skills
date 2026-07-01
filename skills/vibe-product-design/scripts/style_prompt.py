#!/usr/bin/env python3
"""风格提示词的「预处理 + 加载」协调器（config-driven，不需要用户手填细节）。

设计思路：用户只在 config/prototype-style.yaml 里写一句话主题（active_theme）。
真正细致的风格提示词由大模型在**预处理**阶段展开成一份缓存文件，出图时再加载。
本脚本本身**不调用大模型**——它只做确定性的编排：解析主题、算缓存路径、判断缓不
缓存命中，然后：

  status=need_generation → 打印一段「展开任务书」(BRIEF)，由调用方（Claude）据此
                           生成风格提示词，写入 style_file，即完成一次性预处理。
  status=ready           → 打印已缓存的风格提示词（PROMPT_PREFIX），直接用于出图。

命令：
  style_prompt.py plan   [--config <yaml>] [--theme <文本或key>] [--force]
      解析当前主题 → 命中缓存则输出 ready + 风格提示词；否则输出 need_generation + 任务书。
      --theme 临时覆盖 active_theme；--force 忽略已有缓存强制要求重新展开。
  style_prompt.py load   [--config <yaml>] [--theme <文本或key>]
      只加载已缓存的风格提示词；未缓存则报错退出（供确认已预处理后出图用）。
  style_prompt.py params [--config <yaml>]
      输出出图参数（model / quality / size），供组装 zenmux 命令用。

输出统一为一个 JSON 对象（末行以 RESULT_JSON: 打头，便于下游解析）。
零第三方依赖：有 PyYAML 用之，没有则用内置极简解析器兜底，保证开箱即用。
"""
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = SKILL_DIR / "config" / "prototype-style.yaml"
GENERATED_DIR = SKILL_DIR / "config" / "generated"

# 通用质量底线：与具体审美无关，任何主题展开出的风格提示词都必须包含，
# 防止自定义主题退化成简陋线框图。预处理任务书会把它交代给大模型。
QUALITY_BASELINE = [
    "高保真界面稿，不是灰框占位或手绘线框图",
    "使用真实文案与内容（真实标题 / 按钮文字 / 数据 / 列表项），不要占位框、假字或乱码",
    "把这个界面最关键的设计决策清楚展现出来：核心组件形态、信息层级、当前所处的交互状态",
    "同一功能的不同状态（默认 / 选中 / 空 / 加载 / 异常）各出一张图，用状态差异体现设计，"
    "不要把多个状态挤进一张图",
]


# ------------------------- 零依赖 YAML 读取 -------------------------

def _parse_scalar(value: str):
    v = value.strip()
    if v and v[0] in ("'", '"'):
        quote = v[0]
        end = v.find(quote, 1)
        return v[1:end] if end != -1 else v[1:]
    hash_pos = v.find(" #")
    if hash_pos != -1:
        v = v[:hash_pos]
    return v.strip()


def _minimal_yaml_load(text: str) -> dict:
    """极简 YAML 解析：缩进映射 + 标量值，覆盖本配置用到的子集。"""
    root: dict = {}
    stack = [(-1, root)]
    for raw in text.splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        key, sep, rest = raw.strip().partition(":")
        if not sep:
            continue
        key = key.strip()
        while stack and indent <= stack[-1][0]:
            stack.pop()
        parent = stack[-1][1]
        if rest.strip() == "":
            child: dict = {}
            parent[key] = child
            stack.append((indent, child))
        else:
            parent[key] = _parse_scalar(rest)
    return root


def load_config(path: Path) -> dict:
    if not path.is_file():
        sys.exit(f"配置文件不存在：{path}")
    raw = path.read_text(encoding="utf-8")
    try:
        import yaml  # type: ignore

        data = yaml.safe_load(raw) or {}
    except ImportError:
        data = _minimal_yaml_load(raw)
    except yaml.YAMLError as e:  # noqa: BLE001
        sys.exit(f"配置文件不是合法 YAML：{path}\n{e}")
    if not isinstance(data, dict):
        sys.exit(f"配置文件根节点不是映射：{path}")
    return data


# ------------------------- 主题解析与缓存路径 -------------------------

def _slugify(text: str) -> str:
    """把主题 key/文本压成一个安全的短文件名 slug。"""
    s = re.sub(r"\s+", "-", text.strip().lower())
    s = re.sub(r"[^0-9a-z一-鿿\-]", "", s)  # 允许中英文与连字符
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:40] or "theme"


def resolve_theme(config: dict, override: str | None) -> tuple[str, str]:
    """返回 (theme_slug, theme_text)。

    theme 来源：--theme 覆盖 > active_theme。若其值命中 themes: 里的 key，则用该
    key 做 slug、用其值做主题文本；否则视为一句自由主题文本，slug 由文本+哈希生成。
    """
    themes = config.get("themes") or {}
    raw = override if override is not None else config.get("active_theme")
    if not raw:
        sys.exit("配置里没有 active_theme，命令行也没给 --theme。")
    raw = str(raw).strip()
    if raw in themes and themes[raw]:
        return _slugify(raw), str(themes[raw]).strip()
    # 自由文本主题：slug 用文本前缀 + 短哈希，避免不同长句 slug 撞车。
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:6]
    return f"{_slugify(raw)}-{digest}", raw


def style_file_path(theme_slug: str) -> Path:
    return GENERATED_DIR / f"{theme_slug}.style.md"


# ------------------------- 出图参数 -------------------------

def get_rendering(config: dict) -> dict:
    r = dict(config.get("rendering") or {})
    return r


# ------------------------- 预处理任务书（交给大模型展开） -------------------------

def build_brief(theme_text: str, out_path: Path) -> str:
    baseline = "\n".join(f"  {i+1}. {b}" for i, b in enumerate(QUALITY_BASELINE))
    return f"""把下面这个「风格主题」展开成一份可复用的**风格提示词**，用于给
zenmux-image-generation 生成高保真产品原型图。这是一次性预处理，产物会被缓存复用。

风格主题（用户所填，一句话）：
    {theme_text}

请据此写出一段自然语言风格提示词（中文，150–300 字为宜），把这个主题**具象化**为
可直接指导出图的视觉规格，至少覆盖：
  - 整体设计语言 / 参照的设计师或品牌气质
  - 配色（背景 / 正文 / 强调色，含要规避的颜色；给出大致色号更好）
  - 字体（字族气质、字重、字号层级）
  - 布局与留白（网格、信息密度、如何强调重点）
  - 组件与质感（描边 / 阴影 / 圆角 / 图标 / 有无拟物）
  - 整体氛围关键词
  - 明确要规避的元素

无论主题是什么，这段风格提示词都**必须内化以下通用质量底线**（把它们自然融进文字，
不要另起编号清单）：
{baseline}

把最终风格提示词写入这个文件（只写风格提示词正文，开头可加一行 `# 风格：<主题>` 作标题）：
    {out_path}

写完后即完成预处理；出图时会自动加载这段风格提示词，拼在每张图的具体画面描述之前。"""


# ------------------------- 命令实现 -------------------------

def _emit(payload: dict):
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    print("RESULT_JSON: " + json.dumps(payload, ensure_ascii=False))


def cmd_plan(config: dict, args):
    theme_slug, theme_text = resolve_theme(config, args.theme)
    out_path = style_file_path(theme_slug)
    cached = out_path.is_file() and out_path.read_text(encoding="utf-8").strip()

    if cached and not args.force:
        _emit({
            "status": "ready",
            "theme_slug": theme_slug,
            "theme_text": theme_text,
            "style_file": str(out_path),
            "prompt_prefix": out_path.read_text(encoding="utf-8").strip(),
            "rendering": get_rendering(config),
            "note": "已有缓存的风格提示词，可直接用于出图（如需重新展开加 --force）。",
        })
        return

    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    _emit({
        "status": "need_generation",
        "theme_slug": theme_slug,
        "theme_text": theme_text,
        "style_file": str(out_path),
        "brief": build_brief(theme_text, out_path),
        "quality_baseline": QUALITY_BASELINE,
        "rendering": get_rendering(config),
        "note": "尚无缓存。请按 brief 生成风格提示词并写入 style_file，即完成预处理。",
    })


def cmd_load(config: dict, args):
    theme_slug, theme_text = resolve_theme(config, args.theme)
    out_path = style_file_path(theme_slug)
    if not (out_path.is_file() and out_path.read_text(encoding="utf-8").strip()):
        sys.exit(
            f"风格提示词尚未生成：{out_path}\n"
            f"请先运行：python3 {Path(__file__).name} plan  然后按 brief 生成该文件。"
        )
    _emit({
        "status": "ready",
        "theme_slug": theme_slug,
        "theme_text": theme_text,
        "style_file": str(out_path),
        "prompt_prefix": out_path.read_text(encoding="utf-8").strip(),
        "rendering": get_rendering(config),
    })


def cmd_params(config: dict, args):
    _emit({"status": "ok", "rendering": get_rendering(config)})


def main():
    parser = argparse.ArgumentParser(description="原型图风格：预处理 + 加载协调器")
    parser.add_argument("command", choices=["plan", "load", "params"])
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--theme", default=None, help="临时覆盖 active_theme（key 或自由文本）")
    parser.add_argument("--force", action="store_true", help="忽略已有缓存，强制重新展开")
    args = parser.parse_args()

    config = load_config(args.config.expanduser().resolve())
    {"plan": cmd_plan, "load": cmd_load, "params": cmd_params}[args.command](config, args)


if __name__ == "__main__":
    main()
