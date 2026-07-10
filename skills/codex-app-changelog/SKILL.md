---
name: codex-app-changelog
description: >-
  Fetch, archive, translate, and render the latest OpenAI Codex App changelog
  from the official OpenAI Developers changelog page. Use when the user asks
  for Codex app release notes, Codex App changelog updates, desktop/mobile app
  updates, Codex app 最新版本, Codex App 更新日志, generate Codex App changelog
  images, draft a Xiaohongshu/rednote post about a Codex App update, or
  generate a Codex App release cover.
metadata:
  short-description: Archive, translate, render, and promote Codex App changelog entries
---

# Codex App Changelog

End-to-end workflow: pull the latest Codex App entry from OpenAI Developers, archive it bilingually, render BOTH the Chinese and the English versions as paste-ready PNG images (图2 / 图3 in the rednote layout), and optionally draft a Xiaohongshu post with a 3:4 cover.

## Paths & dependencies

This skill can be installed into different agent directories, so **its absolute location is not fixed** — do not assume a project-root path or any specific install prefix.

Throughout this document, `<skill-dir>` means **the directory that contains this SKILL.md** (the installed `codex-app-changelog/` folder). `<project-dir>` means the user's current project root: prefer `git rev-parse --show-toplevel`, otherwise use the current working directory.

Resolve bundled scripts and logo assets against `<skill-dir>`, but write runtime outputs under the user's project:

```text
<project-dir>/.context/codex-app-changelog/
├── changelogs/
├── rednotes/
└── assets/
    ├── rendered/
    └── covers/
```

The bundled TypeScript scripts self-locate for code, then default to `<project-dir>/.context/codex-app-changelog/...` for generated files based on the shell's current project. If you run a script from outside the intended project, pass `--output-dir` or `--output` explicitly. These runtime scripts create `<project-dir>/.context/codex-app-changelog/.gitignore` on first write; this source skill repository must not contain a checked-in `.context/` directory.

The cover step (Step 6) depends on a separate skill, **`zenmux-image-generation`**. If it is not installed, install it before running that step:

```bash
npx skills add ZenMux/skills --skill zenmux-image-generation
```

## Source

- Official changelog page: https://developers.openai.com/codex/changelog?type=codex-app
- Entry filter: only archive HTML entries whose `data-codex-topics` contains `codex-app`.

The page is the source of truth. It is not backed by a public GitHub release feed for Codex App, so this skill intentionally does not use `gh`, GitHub releases, or repository tags.

## Workflow

### 1. Fetch the latest Codex App entry

Prefer the helper script. It fetches the OpenAI Developers page, scans changelog list items, and selects the first entry tagged `codex-app`. Always run this upstream check first so the workflow knows the current latest Codex App entry before deciding whether local artifacts are duplicates.

```bash
npx --yes tsx <skill-dir>/scripts/fetch_latest_app_changelog.ts --json
npx --yes tsx <skill-dir>/scripts/fetch_latest_app_changelog.ts --save
```

Default output for `--save`:

```
<project-dir>/.context/codex-app-changelog/changelogs/<version>.md
```

Use `--entry-id <id>` only when the user asks for a specific dated entry. Do not silently include `general` or `codex-cli` entries when the user asked for Codex App.

The `--json` output includes `existing_local_path` and `archive_status` when `.context/codex-app-changelog/changelogs/<version>.md` already exists. Treat `archive_status: "unchanged"` as the duplicate check result: reuse the local markdown and continue only with missing downstream artifacts.

### 2. Save English copy

The helper writes:

```markdown
---
version: "<version>"
entry_id: "<entry_id>"
title: "<upstream title>"
source: https://developers.openai.com/codex/changelog#<entry_id>
published: "<YYYY-MM-DD>"
fetched: <YYYY-MM-DD>
language: en
topic: codex-app
---

# Codex App <version>

## <upstream title>

<entry body converted from HTML to markdown>
```

If `--save` finds an existing file whose content matches apart from `fetched`, skip writing; if the entry content differs, overwrite only this version's files.

### 3. Produce Chinese translation

Write to `<project-dir>/.context/codex-app-changelog/changelogs/<version>.zh.md`:

```markdown
---
version: "<version>"
entry_id: "<entry_id>"
title: "<upstream title>"
source: https://developers.openai.com/codex/changelog#<entry_id>
published: "<YYYY-MM-DD>"
fetched: <YYYY-MM-DD>
language: zh-CN
topic: codex-app
---

# Codex App <version>（中文版）

## <translated title>

<translated entry body>
```

If `.context/codex-app-changelog/changelogs/<version>.zh.md` already exists for the latest version, reuse it and skip translation unless the English archive changed or the user asks for a retranslation.

Translation rules:

- Keep technical identifiers untouched: app version numbers (`26.519`), CLI flags, env vars, config keys, commands, file paths, model names, protocol names, JSON field names, error names, keybindings.
- Translate prose: feature descriptions, bug fix explanations, UI behavior, and user-facing release notes.
- Prefer concise, technical Chinese — developer release notes, not marketing copy.
- Preserve bullet order one-to-one; do not merge or reorder.
- Use full-width punctuation `：` `，` `。` in prose; keep half-width inside code identifiers and URLs.
- Common mappings: "Fixed" -> "修复"; "Added" -> "新增"; "Changed" -> "变更"; "Improved" -> "优化"; "Performance improvements and bug fixes" -> "性能优化与问题修复".

### 4. Render changelog images (CN + EN, both required)

Produce dark-themed PNGs of BOTH the translated and upstream-English changelog so they can be pasted directly into chats, slides, or social posts. Always run this step after saving the `.md` and `.zh.md` files unless the user explicitly opts out — the rednote workflow assumes both images exist as 图2（中文版）+ 图3（英文原版）.

Run the renderer twice — once per language — and dispatch the two calls in parallel (independent inputs and outputs):

```bash
# Chinese
npx --yes tsx \
  <skill-dir>/scripts/render_changelog.ts \
  --input <project-dir>/.context/codex-app-changelog/changelogs/<version>.zh.md

# English
npx --yes tsx \
  <skill-dir>/scripts/render_changelog.ts \
  --input <project-dir>/.context/codex-app-changelog/changelogs/<version>.md
```

Outputs:

- `.context/codex-app-changelog/assets/rendered/<version>.zh.png` — Chinese, retina 2x, ~1600px (becomes 图2 in the rednote)
- `.context/codex-app-changelog/assets/rendered/<version>.png` — English, retina 2x, ~1600px (becomes 图3 in the rednote)

If `.context/codex-app-changelog/assets/rendered/<version>.zh.png` and `.context/codex-app-changelog/assets/rendered/<version>.png` already exist for the latest version, skip rendering. If only one image exists, render only the missing language. The renderer strips YAML frontmatter, removes `（中文版）` / `(中文版)` from the image title, converts markdown to HTML, and screenshots it with a dark theme.

First-time setup requires Chromium:

```bash
npx --yes --package playwright playwright install chromium
```

### 5. Optional Xiaohongshu post

When the user asks for a rednote / 小红书 post about the update, create a detailed but scannable post directly from the Codex App changelog content. The output goes under the current project's context folder:

```
<project-dir>/.context/codex-app-changelog/rednotes/codex-app-<version>.md
```

Before drafting, do a product-manager read of the release:

- Read the latest English archive and Chinese translation end to end. Do not write from the title or first bullet only.
- Review up to the 10 most recent prior Codex App changelog entries for continuity. Prefer `<project-dir>/.context/codex-app-changelog/changelogs/`, then any bundled `<skill-dir>/changelogs/`, and if local history is thin, skim the OpenAI Developers changelog page around recent `codex-app` entries. This history pass is for pattern recognition: ongoing feature arcs, fixes to recently introduced behavior, platform expansion, workflow completion, or a release that is only maintenance. Do not invent a callback when the evidence is weak.
- Pick 3-5 numbered highlights that a user, developer, or product manager would immediately care about. Prioritize direct experience: new capabilities, cross-device or cross-platform workflows, visible UI/UX changes, reliability, search/history/session behavior, usage/cost visibility, auth/account behavior, remote control, performance, and fixes that remove obvious friction.
- De-prioritize internal plumbing, dependency bumps, wording-only changes, and tiny bug fixes unless they clearly change how someone uses the app.
- For each highlight, explain both what changed and why it matters in practice. When a highlight continues a recent arc, add a short natural callback such as "这也接上了前几版一直在补的 Windows / 远程控制能力".

The Xiaohongshu post must be paste-ready plain text, not Markdown. The saved file may be `.md` for project organization, but the content itself must avoid Markdown syntax: no `#` heading marker, no `**bold**`, no `-` bullet lists, no `>` quote blocks, no code fences, and no backticks around product terms. Hashtags at the end are the only acceptable `#` usage because they are Xiaohongshu tags.

Use a human, lightly opinionated voice inspired by `$vibe-writing`: preserve texture, emotional temperature, and small personal judgments. Do not sand the post into generic AI prose. Separate stronger writing from smoother writing: a concrete, slightly opinionated sentence is better than a polished but empty one.

Avoid AI-flavored filler such as "赋能", "显著提升", "全面升级", "多维度", "闭环", "深度优化", "值得关注的是" unless the changelog itself makes that phrasing unavoidable. Do not over-explain the workflow or say "以下是". Write like a real developer/product manager sharing what they noticed after reading the changelog.

Do not use a fixed transition sentence between the reference line and the numbered highlights. That sentence should be content-specific, or omitted entirely when the title and first highlight already carry the post. Vary the opening based on the release story: a big feature can start with a direct judgment, a maintenance release can start with "这版看起来不大，但...", a platform expansion can start with who now benefits, and a security/reliability release can start with the friction it removes. Repeated generic lines make the series feel templated.

The Xiaohongshu post should use this plain-text structure:

```text
Codex App <version>｜<one sharp, user-facing headline>

完整原版 ChangeLog 见图2（中文版）、图3（英文原版）。

<可选的一句内容化开场；也可以直接进入第 1 条。不要每篇都用同一句套话。>

1｜<最影响使用体验的更新>
<1-2 句：基于 changelog 说明具体变化，以及用户/开发者为什么会感受到它。可以带一点判断，但不要夸张。>

2｜<第二个关键变化>
<1-2 句：如果它延续最近 10 条里的某条产品线，就自然 call back；没有证据就不要硬连。>

3｜<第三个关键变化>
<1-2 句：把价值说成人话，避免复读 release note。>

我的判断：<一句收束：这是大功能更新、体验补齐、平台扩展、安全/稳定性修复，还是偏维护的一版；说清楚谁最该看。>

#CodexApp #OpenAI #AI编程 #开发工具
```

The standalone reference line must be the first non-title line and must be exactly this plain text line:

完整原版 ChangeLog 见图2（中文版）、图3（英文原版）。

Keep hashtags after the body when useful. The title should include the version number and may reuse the rednote cover title. Write in Chinese, conversational but precise: like a developer/product manager who has actually reviewed the changelog and is telling other users what to notice first.

The Xiaohongshu post is laid out as:

- 图1 -> cover generated via `$zenmux-image-generation` (prefer `.context/codex-app-changelog/assets/covers/<version>/<generated-or-returned-filename>.png` when bundling assets here)
- 图2 -> rendered Chinese changelog (`.context/codex-app-changelog/assets/rendered/<version>.zh.png`)
- 图3 -> rendered English changelog (`.context/codex-app-changelog/assets/rendered/<version>.png`)

Both rendered images are produced in Step 4, so the reference line is always accurate. Do not omit or paraphrase it.

### 6. Optional cover image

When the user asks for a cover / 头图 / poster, invoke `$zenmux-image-generation` and let that skill own image generation. Do not duplicate its current commands, setup steps, model routing, prompt-file format, confirmation rules, or troubleshooting details here.

This step requires the **`zenmux-image-generation`** skill. If `$zenmux-image-generation` is not available, install it with `npx skills add ZenMux/skills --skill zenmux-image-generation` before continuing. Do not attempt to hand-roll image generation without it.

Changelog-specific handoff brief:

- Goal: create a 3:4 portrait cover for OpenAI Codex App `<version>` as Xiaohongshu / rednote 图1.
- Literal text: include the rednote title and `Codex App <version>`; keep the version exact.
- Reference image: use `<skill-dir>/assets/openai.png` (the OpenAI logo bundled with this skill) as `[Image #1]`, and pass it to `$zenmux-image-generation` with `--reference-image <skill-dir>/assets/openai.png`. Place the OpenAI logo visibly but tastefully, preserving recognizable geometry and proportions as much as the model allows. Do not invent or fabricate an alternative OpenAI logo.
- Brand grounding: keep the OpenAI logo recognizable when it appears, but do not force every concept into monochrome, terminal UI, app-store screenshots, magazine covers, or any other fixed house style.
- Content grounding: before writing image prompts, distill the changelog into one sharp cover headline, 1-2 supporting phrases, 2-3 release-specific visual motifs, and one reason a developer should care. Do not make a generic "Codex App updated" poster when the release has a clearer product story.
- Style randomization: read `<skill-dir>/references/cover-style-pool.md`, randomly sample 4 different styles for this run, and record the selected style names in the handoff. Do not reuse the same four styles by habit. If one sampled style obviously fights the release story or brand/logo constraints, swap it for another random style and note the reason.
- Creative concept requirement: write 4 fresh, content-driven cover concepts for this specific release, one per sampled style. The styles should shape the visual language, but the changelog story still decides the headline, metaphor, and composition.
- For each concept, produce a compact handoff brief containing `concept_title`, `style_name`, `style_slug`, `cover_headline`, `supporting_text`, `visual_metaphor`, `composition`, `material_palette`, `reference_usage`, and `generation_params`.
- `style_slug` must be filesystem-safe and prefixed with `style-01-` through `style-04-`.
- `generation_params`: `1024x1536`, `quality=high`, `openai_n=1`, `gemini_n=1`, and distinct intended output folders for the two model/protocol runs.
- Model/protocol requirement: for every sampled style, generate exactly one image with `openai/gpt-image-2` via the OpenAI Images edit protocol, and exactly one image with `google/gemini-3.1-flash-image-preview` (or the exact current `google/gemini-3.1-flash-image` model id if `list_models.sh` shows that name) via the Gemini image edit protocol. Both calls must pass the OpenAI logo reference image so the request is an edit/reference-image workflow, not pure text-to-image.
- Handoff requirement: after drafting the 4 style briefs, hand them to `$zenmux-image-generation` and let that skill optimize each prompt using its current OpenAI and Gemini cookbooks, confirmation rules, API commands, and troubleshooting. This changelog skill should not hand-write final API prompts when `$zenmux-image-generation` can optimize them.
- Batch requirement: generate 8 total images: 4 sampled styles x 2 model/protocol variants. For each style, run one `gpt-image-2` OpenAI edit batch with `-n 1`, then one Gemini edit batch with `-n 1`, using distinct output folders such as `<style-slug>/openai-gpt-image-2/` and `<style-slug>/gemini-3.1-flash-image/`. Do not merge styles or models into a grid.
- Output preference: save or place final cover assets under `<project-dir>/.context/codex-app-changelog/assets/covers/<version>/<style-slug>/<model-slug>/` when bundling the rednote assets.
- **Post-process required — stamp a black metadata footer on every generated cover** (see below). Choose exactly one strategy for the run: process returned source paths after each successful batch (recommended), or process each source directory once after all 8 images exist. Never combine both strategies for the same files.
- After generation + footer stamping: report the stamped `*-footer` output paths only, not the preserved source paths. Do not rank, select, or recommend a final 图1 unless the user explicitly asks.
- Avoid: emoji, fake app screenshots, stock-photo people, malformed words, watermarks, invented logos, bland gradient backgrounds, busy small text, and multi-variant grids inside a single image.

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

Run the bundled script **once per generated source cover**. It preserves the original and writes `<name>-footer.<ext>` alongside it. Re-running the command safely rebuilds that same output from the unchanged source instead of stacking another footer:

```bash
# Single source cover -> <name>-footer.png
npx --yes tsx <skill-dir>/scripts/stamp_cover_footer.ts \
  --input <path-to-generated-cover.png> \
  --image-model "openai/gpt-image-2" \
  --prompt-model "<current-session-model-id>" \
  --date "YYYY-MM-DD"

# Or stamp every image in a model output folder
npx --yes tsx <skill-dir>/scripts/stamp_cover_footer.ts \
  --input-dir <project-dir>/.context/codex-app-changelog/assets/covers/<version>/<style-slug>/openai-gpt-image-2 \
  --image-model "openai/gpt-image-2" \
  --prompt-model "<current-session-model-id>"
```

Repeat for each style × model folder (8 source images total). The default suffix is `-footer`; `--suffix` may change it, and `--output` is for one explicit destination. `--input-dir` ignores files already ending in the selected suffix, so reruns do not treat derived outputs as new sources. In-place output is intentionally unsupported.

Requires the same Playwright Chromium setup as `render_changelog.ts` (`npx --yes playwright install chromium` once).

### 7. Report

Output a short summary: version, source entry URL, saved file paths, rendered PNG paths, optional rednote/cover paths, and a one-line headline of what the release contains.

## Output locations

Bundled code/assets live under `<skill-dir>`; generated runtime output lives under `<project-dir>/.context/codex-app-changelog/`.

```
<skill-dir>/
├── SKILL.md
├── scripts/
│   ├── fetch_latest_app_changelog.ts       # OpenAI Developers page -> curated markdown
│   ├── render_changelog.ts                 # Markdown -> dark-themed PNG
│   └── stamp_cover_footer.ts               # Append black model/date footer under covers
├── references/
│   └── cover-style-pool.md                 # 60 cover styles for random sampling
└── assets/
    └── openai.png                          # Bundled OpenAI logo reference for cover handoff

<project-dir>/.context/codex-app-changelog/
├── .gitignore                              # Runtime-created; ignores generated image/media files
├── assets/
│   ├── rendered/
│   │   ├── <version>.zh.png
│   │   └── <version>.png
│   └── covers/
│   │   └── <version>/
│   │       ├── style-01-<style-and-content-slug>/
│   │       │   ├── openai-gpt-image-2/
│   │       │   └── gemini-3.1-flash-image/
│   │       ├── style-02-<style-and-content-slug>/
│   │       ├── style-03-<style-and-content-slug>/
│   │       └── style-04-<style-and-content-slug>/
├── changelogs/
│   ├── <version>.md
│   └── <version>.zh.md
└── rednotes/
    └── codex-app-<version>.md
```

Files are version-named so re-running the skill for the same release is idempotent.
Generated image folders (`assets/rendered/` and `assets/covers/`) are gitignored inside `.context/codex-app-changelog/` because they are reproducible local/social assets and can become large.
