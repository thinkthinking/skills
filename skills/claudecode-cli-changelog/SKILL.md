---
name: claudecode-cli-changelog
description: >-
  Fetch, archive, translate, and render the latest Claude Code changelog from
  the official GitHub CHANGELOG.md. Use when the user asks to pull Claude Code
  release notes, sync the latest version, save bilingual changelog markdown,
  create dark-themed changelog images, draft a Xiaohongshu/rednote post about a
  Claude Code update, or generate a 3:4 cover image. Trigger on phrases like
  "claude code changelog", "Claude Code 更新日志", "Claude Code 最新版本", "拉取
  changelog", "同步 Claude Code 更新", "生成 changelog 图片", "写 Claude Code
  小红书", or "生成 Claude Code 封面图".
metadata:
  short-description: Archive, translate, render, and promote Claude Code changelog entries
---

# Claude Code Changelog

End-to-end workflow: pull the latest Claude Code CHANGELOG entry, archive it bilingually, render BOTH the Chinese and the English versions as paste-ready PNG images (图2 / 图3 in the rednote layout), and optionally draft a Xiaohongshu post with a 3:4 cover.

## Paths & dependencies

This skill can be installed into different agent directories, so **its absolute location is not fixed** — do not assume a project-root path or any specific install prefix.

Throughout this document, `<skill-dir>` means **the directory that contains this SKILL.md** (the installed `claudecode-cli-changelog/` folder). `<project-dir>` means the user's current project root: prefer `git rev-parse --show-toplevel`, otherwise use the current working directory.

Resolve bundled scripts and logo assets against `<skill-dir>`, but write runtime outputs under the user's project:

```text
<project-dir>/.context/claudecode-cli-changelog/
├── changelogs/
├── rednotes/
└── assets/
    ├── rendered/
    └── covers/
```

The bundled TypeScript scripts self-locate for code, then default to `<project-dir>/.context/claudecode-cli-changelog/...` for generated files based on the shell's current project. If you run a script from outside the intended project, pass `--changelog-dir` or `--output` explicitly. These runtime scripts create `<project-dir>/.context/claudecode-cli-changelog/.gitignore` on first write; this source skill repository must not contain a checked-in `.context/` directory.

The cover step (Step 7) depends on a separate skill, **`zenmux-image-generation`**. If it is not installed, install it before running that step:

```bash
npx skills add ZenMux/skills --skill zenmux-image-generation
```

## Source

- Upstream file: https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md
- Browseable view: https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md

The file uses semver-style headings (`## X.Y.Z`) in reverse chronological order — the FIRST heading is always the latest version.

## Workflow

### 1. Fetch

Fetch the raw CHANGELOG with `curl`, piping through `head -100` to cap payload size. The latest version heading is always at the top of the file, so the first 100 lines contain at minimum the latest entry (and usually the prior 1–2 entries for hotfix-check context):

```bash
curl -sSL https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md | head -100
```

Do not use `WebFetch` for this — the raw markdown is small, deterministic, and curl output drops straight into the parser without HTML-to-markdown rewriting. If 100 lines isn't enough (unusually long release), bump to `head -200`.

### 2. Extract latest version entry

Parse the first `## X.Y.Z` heading and capture every line until (but not including) the next `## ` heading.

- `<version>` = the string after `## ` on the first heading (e.g. `2.1.114`)
- `<body>` = the bullet lines that follow until the next version heading

When the latest version is a tiny hotfix, check the version immediately below it — often a richer release is one step behind. Offer the user the choice of (a) strictly latest, (b) broader previous version, or (c) merged summary of both.

After deciding the exact `<version>` or merged `<version-a>-<version-b>` bundle, check for an existing English archive for that selected version:

```bash
npx --yes tsx <skill-dir>/scripts/find_existing_changelog.ts --version <version> --json
```

If this reports `"reused_local": true`, treat the local file as the duplicate check result: skip saving the English markdown and continue only with missing downstream artifacts. This check happens **after** fetching and extracting the latest upstream entry, never before.

### 3. Save English copy

Write to `<project-dir>/.context/claudecode-cli-changelog/changelogs/<version>.md`:

```markdown
---
version: <version>
source: https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md
fetched: <YYYY-MM-DD>
language: en
---

# Claude Code <version>

<body — upstream bullets verbatim>
```

If the selected version's English archive already exists and the fetched body matches, skip writing. If content differs, overwrite.

### 4. Produce Chinese translation

Write to `<project-dir>/.context/claudecode-cli-changelog/changelogs/<version>.zh.md`:

```markdown
---
version: <version>
source: https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md
fetched: <YYYY-MM-DD>
language: zh-CN
---

# Claude Code <version>（中文版）

<translated bullets>
```

If `.context/claudecode-cli-changelog/changelogs/<version>.zh.md` already exists for the selected latest version or merged bundle, reuse it and skip translation unless the English archive changed or the user asks for a retranslation.

**Translation rules:**

- Keep technical identifiers untouched: CLI flags (`--foo`), settings keys (`sandbox.network.deniedDomains`), env vars (`CLAUDE_CODE_EXTRA_BODY`), tool/command names (`/loop`, `Bash`, `ToolSearch`), file paths, keybindings (`Ctrl+A`, `Shift+↑`), error codes.
- Translate prose: feature descriptions, bug fix explanations, user-facing behavior.
- Prefer concise, technical Chinese — match the style of developer release notes, not marketing copy.
- Preserve bullet order one-to-one; do not merge or reorder.
- Use full-width punctuation `：` `，` `。` in prose; keep half-width inside code identifiers.
- Common mappings: "Fixed" → "修复"；"Added" → "新增"；"Changed" → "变更"；"Improved" → "优化"；"Security" → "安全"。

### 5. Render the changelog as images (CN + EN, both required)

Produce dark-themed PNGs of BOTH the translated and the upstream-English changelog so they can be pasted directly into chats, slides, or social posts. Always run this step after saving the `.md` and `.zh.md` files unless the user explicitly opts out — the rednote workflow assumes both images exist as 图2（中文版）+ 图3（英文原版）.

Run the renderer twice — once per language — and dispatch the two calls in parallel (independent inputs and outputs):

```bash
# Chinese
npx --yes tsx \
  <skill-dir>/scripts/render_changelog.ts \
  --input <project-dir>/.context/claudecode-cli-changelog/changelogs/<version>.zh.md

# English (upstream verbatim)
npx --yes tsx \
  <skill-dir>/scripts/render_changelog.ts \
  --input <project-dir>/.context/claudecode-cli-changelog/changelogs/<version>.md
```

Outputs:

- `.context/claudecode-cli-changelog/assets/rendered/<version>.zh.png` — Chinese, retina 2x, ~1600px (becomes 图2 in the rednote)
- `.context/claudecode-cli-changelog/assets/rendered/<version>.png` — English, retina 2x, ~1600px (becomes 图3 in the rednote)

If `.context/claudecode-cli-changelog/assets/rendered/<version>.zh.png` and `.context/claudecode-cli-changelog/assets/rendered/<version>.png` already exist for the selected version or merged bundle, skip rendering. If only one image exists, render only the missing language.

The renderer:

1. Strips YAML frontmatter.
2. Extracts the first H1 and **removes `（中文版）` / `(中文版)` from the title** — the rendered image shows `Claude Code <version>` only. English files have no suffix to strip and render as-is.
3. Converts the body markdown to HTML with inline `code`, bullet lists, fenced blocks, tables.
4. Loads it in headless Chromium with a dark theme (`#17191c` bg, white text, `#2a2d31` code pills) and screenshots `full_page`.

First-time setup requires Chromium:

```bash
npx --yes --package playwright playwright install chromium
```

Optional flags:

- `--output <path>` — override destination
- `--width <px>` — logical width (default 1600)
- `--scale <N>` — device pixel ratio (default 2 for retina)

### 6. (Optional) Draft a Xiaohongshu post

When the user asks for a rednote / 小红书 post about the update, create a detailed but scannable post directly from the changelog content. **The output goes under the current project's context folder**, not in rednote-generator's own published dir:

```
<project-dir>/.context/claudecode-cli-changelog/rednotes/claude-code-<version>.md
```

Before drafting, do a product-manager read of the release:

- Read the selected English archive and Chinese translation end to end. Do not write from the version number or first bullet only.
- Review up to the 10 most recent prior Claude Code changelog entries for continuity. Prefer `<project-dir>/.context/claudecode-cli-changelog/changelogs/`, then any bundled `<skill-dir>/changelogs/`; if local history is thin, fetch enough of the upstream `CHANGELOG.md` to inspect the latest 10 headings instead of only the current entry. This history pass is for pattern recognition: a multi-release workflow arc, a recently introduced feature being stabilized, model/provider availability, terminal/TUI friction, plugin/skill evolution, permissions/sandboxing, or whether the latest release is mostly maintenance. Do not invent a callback when the evidence is weak.
- Pick 3-5 numbered highlights that a user, developer, or product manager would immediately care about. Prioritize direct experience: new commands/workflows, plugin or skill behavior, worktree/session/resume behavior, model/provider support, terminal/editor interaction, permissions/security behavior, background agents, reliability, performance, and fixes that remove visible friction.
- De-prioritize internal refactors, dependency bumps, and tiny edge-case fixes unless they clearly change how someone uses Claude Code.
- For each highlight, explain both what changed and why it matters in practice. When a highlight continues a recent arc, add a short natural callback such as "这也接上了前几版一直在补的 plugin / worktree / 后台 agent 能力".

The Xiaohongshu post must be paste-ready plain text, not Markdown. The saved file may be `.md` for project organization, but the content itself must avoid Markdown syntax: no `#` heading marker, no `**bold**`, no `-` bullet lists, no `>` quote blocks, no code fences, and no backticks around commands, settings, or product terms. Hashtags at the end are the only acceptable `#` usage because they are Xiaohongshu tags.

Use a human, lightly opinionated voice inspired by `$vibe-writing`: preserve texture, emotional temperature, and small personal judgments. Do not sand the post into generic AI prose. Separate stronger writing from smoother writing: a concrete, slightly opinionated sentence is better than a polished but empty one.

Avoid AI-flavored filler such as "赋能", "显著提升", "全面升级", "多维度", "闭环", "深度优化", "值得关注的是" unless the changelog itself makes that phrasing unavoidable. Do not over-explain the workflow or say "以下是". Write like a real developer/product manager sharing what they noticed after reading the changelog.

Do not use a fixed transition sentence between the reference line and the numbered highlights. That sentence should be content-specific, or omitted entirely when the title and first highlight already carry the post. Vary the opening based on the release story: a big feature can start with a direct judgment, a maintenance release can start with "这版看起来不大，但...", a model/provider update can start with who can use it now, and a workflow/reliability release can start with the friction it removes. Repeated generic lines make the series feel templated.

The Xiaohongshu post should use this plain-text structure:

```text
Claude Code <version>｜<one sharp, user-facing headline>

完整原版 ChangeLog 见图2（中文版）、图3（英文原版）。

<可选的一句内容化开场；也可以直接进入第 1 条。不要每篇都用同一句套话。>

1｜<最影响使用体验的更新>
<1-2 句：基于 changelog 说明具体变化，以及用户/开发者为什么会感受到它。可以带一点判断，但不要夸张。>

2｜<第二个关键变化>
<1-2 句：如果它延续最近 10 条里的某条产品线，就自然 call back；没有证据就不要硬连。>

3｜<第三个关键变化>
<1-2 句：把价值说成人话，避免复读 release note。>

我的判断：<一句收束：这是大功能更新、体验补齐、安全/稳定性修复，还是偏维护的一版；说清楚谁最该看。>

#ClaudeCode #Claude #AI编程 #开发工具
```

The standalone reference line must be the first non-title line and must be exactly this plain text line:

完整原版 ChangeLog 见图2（中文版）、图3（英文原版）。

Keep hashtags after the body when useful. The title should include the version number and may reuse the rednote cover title. Write in Chinese, conversational but precise: like a developer/product manager who has actually reviewed the changelog and is telling other Claude Code users what to notice first.

The Xiaohongshu post is laid out as:

- 图1 → cover generated via `$zenmux-image-generation` (prefer `.context/claudecode-cli-changelog/assets/covers/<version>/<generated-or-returned-filename>.png` when bundling assets here)
- 图2 → rendered Chinese changelog (`.context/claudecode-cli-changelog/assets/rendered/<version>.zh.png`)
- 图3 → rendered English changelog (`.context/claudecode-cli-changelog/assets/rendered/<version>.png`)

Both rendered images are produced in Step 5, so the reference line is always accurate. Do not omit or paraphrase it.

### 7. (Optional) Generate 3:4 cover image(s)

When the user asks for a cover / 头图 / poster, **invoke `$zenmux-image-generation` and let that skill own the image-generation workflow**. Do not duplicate its current commands, setup steps, model routing, prompt-file format, confirmation rules, or troubleshooting details here, because that skill is the source of truth and may change frequently.

This step requires the **`zenmux-image-generation`** skill. If `$zenmux-image-generation` is not available, install it with `npx skills add ZenMux/skills --skill zenmux-image-generation` before continuing. Do not attempt to hand-roll image generation without it.

This skill only supplies the changelog-specific handoff brief:

- Goal: create a 3:4 portrait cover for Claude Code `<version>` as Xiaohongshu / rednote 图1.
- Literal text: include the rednote title and `Claude Code <version>`; keep the version digits exact.
- Reference image: use `<skill-dir>/assets/claude.png` (bundled with this skill) as the Claude logo / wordmark reference.
- Brand grounding: keep the Claude identity recognizable when a logo / wordmark is used, but do **not** force every concept into Claude orange, a dark theme, terminal UI, editorial layout, workflow map, or any other fixed house style.
- Content grounding: before writing image prompts, distill the changelog into one sharp cover headline, 1-2 supporting phrases, 2-3 release-specific visual motifs, and one reason a developer should care. Do not make a generic "Claude Code updated" poster when the release has a clearer product story.
- Style randomization: read `<skill-dir>/references/cover-style-pool.md`, randomly sample 4 different styles for this run, and record the selected style names in the handoff. Do not reuse the same four styles by habit. If one sampled style obviously fights the release story or brand/logo constraints, swap it for another random style and note the reason.
- Creative concept requirement: write **4 fresh, content-driven cover concepts** for this specific release, one per sampled style. The styles should shape the visual language, but the changelog story still decides the headline, metaphor, and composition.
- For each concept, produce a compact handoff brief containing:
  - `concept_title`: a memorable name derived from the release story.
  - `style_name`: the sampled style from `references/cover-style-pool.md`.
  - `style_slug`: a filesystem-safe slug derived from the sampled style and concept title, prefixed with `style-01-` through `style-04-`.
  - `cover_headline`: the exact short title to place on the cover.
  - `supporting_text`: 1-2 optional short phrases; keep text minimal.
  - `visual_metaphor`: the central image idea tied to the changelog.
  - `composition`: framing, focal object, depth, negative space, and text placement.
  - `material_palette`: color, texture, lighting, and medium choices; vary these across the four concepts.
  - `reference_usage`: how to use the Claude reference image, or when to omit it.
  - `generation_params`: `1024x1536`, `quality=high`, `openai_n=1`, `gemini_n=1`, and distinct intended output folders for the two model/protocol runs.
- Model/protocol requirement: for every sampled style, generate exactly one image with `openai/gpt-image-2` via the OpenAI Images edit protocol, and exactly one image with `google/gemini-3.1-flash-image-preview` (or the exact current `google/gemini-3.1-flash-image` model id if `list_models.sh` shows that name) via the Gemini image edit protocol. Both calls must pass the Claude reference image so the request is an edit/reference-image workflow, not pure text-to-image.
- Optimization requirement: after drafting the four style briefs, hand them to `$zenmux-image-generation` and let that skill optimize each prompt using its current OpenAI and Gemini cookbooks, confirmation rules, API commands, and troubleshooting. This changelog skill should not hand-write final API prompts when `$zenmux-image-generation` can optimize them.
- Batch requirement: generate **8 total images**: 4 sampled styles x 2 model/protocol variants. For each style, run one `gpt-image-2` OpenAI edit batch with `-n 1`, then one Gemini edit batch with `-n 1`, using distinct output folders such as `<style-slug>/openai-gpt-image-2/` and `<style-slug>/gemini-3.1-flash-image/`. Do not merge styles or models into a grid.
- Output preference: save or place final cover assets under `<project-dir>/.context/claudecode-cli-changelog/assets/covers/<version>/<style-slug>/<model-slug>/`, preserving the image-generation skill's filenames unless the user asks for canonical names.
- **Post-process required — stamp a black metadata footer on every generated cover** (see below). Do this after each successful generation batch (or after all 8 images exist), before reporting paths.
- After generation + footer stamping: report the stamped output paths only. Do not rank, select, or recommend a final 图1 unless the user explicitly asks.
- Avoid: emoji, stock-photo people, cluttered fake app screenshots, malformed words, watermarks, bland gradient backgrounds, busy small text, and multi-variant grids inside a single image.

#### Stamp cover footer (required after generation)

After `$zenmux-image-generation` returns image paths, **manually append a black footer bar under each cover with code** — do not ask the image model to draw the footer, and do not skip this step.

The footer shows three fields:

| Label | Source |
| --- | --- |
| 生图模型 | The image model id used for that file, e.g. `openai/gpt-image-2` or `google/gemini-3.1-flash-image-preview` |
| 提示词模型 | The **current session model that wrote/optimized the image prompt** (this Claude Code / agent session's model id, e.g. `claude-opus-4-8`, `claude-sonnet-5`, `grok-4.5[1m]`) |
| 生成日期 | Local calendar date `YYYY-MM-DD` (prefer the date embedded in the zenmux filename timestamp; otherwise today) |

How to obtain each value:

1. **生图模型 (image model)** — known from the generation call / folder slug (`openai-gpt-image-2/`, `gemini-3.1-flash-image/`) or the prompt file's `- **Model:** ...` header. Pass it with `--image-model`. If omitted, `stamp_cover_footer.ts` also infers common model ids from the file path.
2. **提示词模型 (prompt model)** — the model id of **this** interactive session that authored the optimized prompt for `$zenmux-image-generation`. Use the exact model name shown for the current session (slash `/model`, status line, or the host-reported model). Pass it with `--prompt-model`. Do **not** put the image model here.
3. **生成日期** — pass `--date YYYY-MM-DD` when you know it; otherwise the script uses the `YYYYMMDD` stamp in zenmux filenames (e.g. `...-20260709-144019-01.png` → `2026-07-09`), then falls back to today's local date.

Run the bundled script **once per generated cover**, in-place (default overwrites the PNG so rednote 图1 is the stamped version):

```bash
# Single cover
npx --yes tsx <skill-dir>/scripts/stamp_cover_footer.ts \
  --input <path-to-generated-cover.png> \
  --image-model "openai/gpt-image-2" \
  --prompt-model "<current-session-model-id>" \
  --date "YYYY-MM-DD"

# Or stamp every image in a model output folder
npx --yes tsx <skill-dir>/scripts/stamp_cover_footer.ts \
  --input-dir <project-dir>/.context/claudecode-cli-changelog/assets/covers/<version>/<style-slug>/openai-gpt-image-2 \
  --image-model "openai/gpt-image-2" \
  --prompt-model "<current-session-model-id>"
```

Repeat for each style × model folder (8 images total). Optional `--suffix -footer` writes alongside instead of overwriting; optional `--output` is for a single explicit destination.

Requires the same Playwright Chromium setup as `render_changelog.ts` (`npx --yes playwright install chromium` once).

Operational rules:

- Follow `$zenmux-image-generation` exactly for prompt optimization, user confirmation, model choice, API invocation, references, output count, dependencies, and error handling.
- For this changelog cover workflow, request 4 sampled styles and 8 total one-image batches: `openai/gpt-image-2` via OpenAI image edit protocol and `google/gemini-3.1-flash-image-preview` via Gemini image edit protocol for each style. Do not run batches in parallel unless every batch has a distinct output folder or otherwise cannot collide.
- After every successful batch, stamp the footer on the returned paths before considering the cover step complete.
- If `$zenmux-image-generation` defaults change, use its current defaults rather than the older assumptions in archived changelog runs.
- If the generated files land in `$zenmux-image-generation`'s own output folder, stamp the footer on those paths first; only copy or reorganize them into this skill's cover folder when the user asks or the current run explicitly needs the rednote asset bundle.

### 8. Report

Output a short summary: version, saved file paths (changelog EN/ZH + rendered PNG + optional rednote + optional cover), and a one-line headline of what the release contains.

## Output locations

Bundled code/assets live under `<skill-dir>`; generated runtime output lives under `<project-dir>/.context/claudecode-cli-changelog/`.

```
<skill-dir>/
├── SKILL.md
├── scripts/
│   ├── find_existing_changelog.ts          # Local archive duplicate check
│   ├── render_changelog.ts                 # Markdown → dark-themed PNG (Playwright)
│   └── stamp_cover_footer.ts               # Append black model/date footer under covers
├── references/
│   └── cover-style-pool.md                 # 60 cover styles for random sampling
└── assets/
    └── claude.png                          # Bundled Claude logo reference for cover handoff

<project-dir>/.context/claudecode-cli-changelog/
├── .gitignore                              # Runtime-created; ignores generated image/media files
├── assets/
│   ├── rendered/
│   │   ├── <version>.zh.png                # Rendered Chinese changelog (图2 in rednote)
│   │   └── <version>.png                   # Rendered English changelog (图3 in rednote)
│   └── covers/
│   │   └── <version>/                      # Folder named by version
│   │       ├── style-01-<style-and-content-slug>/
│   │       │   ├── openai-gpt-image-2/
│   │       │   └── gemini-3.1-flash-image/
│   │       ├── style-02-<style-and-content-slug>/
│   │       ├── style-03-<style-and-content-slug>/
│   │       └── style-04-<style-and-content-slug>/
├── changelogs/
│   ├── <version>.md                        # English, upstream verbatim
│   └── <version>.zh.md                     # Chinese translation
└── rednotes/
    └── claude-code-<version>.md            # Xiaohongshu draft (if requested)
```

Files are version-named (not date-named) so re-running the skill for the same release is idempotent.
Generated image folders (`assets/rendered/` and `assets/covers/`) are gitignored inside `.context/claudecode-cli-changelog/` because they are reproducible local/social assets and can become large.
