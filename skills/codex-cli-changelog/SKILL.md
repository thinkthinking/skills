---
name: codex-cli-changelog
description: >-
  Fetch, filter, archive, translate, and render the latest OpenAI Codex CLI
  changelog from the official GitHub releases page. Use when the user asks for
  Codex CLI release notes, Codex CLI changelog updates, the latest Codex CLI
  version, Codex CLI 更新日志, Codex CLI 最新版本, generate Codex CLI changelog
  images, draft a Xiaohongshu/rednote post about a Codex CLI update, or
  generate a Codex CLI release cover. It intentionally skips prereleases and
  rejects GitHub auto-generated PR-list release notes unless the user
  explicitly asks for them.
metadata:
  short-description: Archive, translate, render, and promote Codex CLI GitHub release notes
---

# Codex CLI Changelog

End-to-end workflow: pull the latest usable OpenAI Codex CLI GitHub release, archive it bilingually, render BOTH the Chinese and the English versions as paste-ready PNG images (图2 / 图3 in the rednote layout), and optionally draft a Xiaohongshu post with a 3:4 cover.

Codex CLI differs from Claude Code: there is no single upstream `CHANGELOG.md` to slice. The source of truth is the `openai/codex` GitHub releases feed, and this skill must filter release metadata carefully.

For Codex App changelog entries from OpenAI Developers, use `$codex-app-changelog` instead. Do not mix App page entries into this CLI GitHub-release workflow.

## Paths & dependencies

This skill can be installed into different agent directories, so **its absolute location is not fixed** — do not assume a project-root path or any specific install prefix.

Throughout this document, `<skill-dir>` means **the directory that contains this SKILL.md** (the installed `codex-cli-changelog/` folder). `<project-dir>` means the user's current project root: prefer `git rev-parse --show-toplevel`, otherwise use the current working directory.

Resolve bundled scripts and logo assets against `<skill-dir>`, but write runtime outputs under the user's project:

```text
<project-dir>/.context/codex-cli-changelog/
├── changelogs/
├── rednotes/
└── assets/
    ├── rendered/
    └── covers/
```

The bundled TypeScript scripts self-locate for code, then default to `<project-dir>/.context/codex-cli-changelog/...` for generated files based on the shell's current project. If you run a script from outside the intended project, pass `--output-dir` or `--output` explicitly. These runtime scripts create `<project-dir>/.context/codex-cli-changelog/.gitignore` on first write; this source skill repository must not contain a checked-in `.context/` directory.

The cover step (Step 6) depends on a separate skill, **`zenmux-image-generation`**. If it is not installed, install it before running that step:

```bash
npx skills add ZenMux/skills --skill zenmux-image-generation
```

## Source

- Browseable releases: https://github.com/openai/codex/releases
- GitHub CLI latest full release: `gh api repos/openai/codex/releases/latest`
- GitHub CLI release list scan: `gh api 'repos/openai/codex/releases?per_page=30'`

GitHub's latest-release endpoint returns the latest published full release, not drafts or prereleases. Still apply this skill's extra filters because the Codex repo may also publish dependency/tooling releases, prerelease-like names, or GitHub-generated PR rollups.

This skill intentionally uses `gh` only. Do not fall back to `curl`, `WebFetch`, browser scraping, or a direct HTTP client. If `gh` auth is missing or expired, stop and ask the user to run `gh auth login -h github.com` or provide `GH_TOKEN`.

## Hard Rules

- Only use OpenAI's `openai/codex` GitHub releases as the Codex CLI source.
- Do not archive releases marked `draft: true` or `prerelease: true`.
- Do not archive tag/name patterns containing `alpha`, `beta`, `rc`, `pre`, `preview`, `nightly`, `snapshot`, or `canary`.
- Do not archive dependency-only releases such as `rusty-v8-*`.
- Do not convert auto-generated PR lists into a user-facing changelog. If the body is only `What's Changed`, `New Contributors`, `Full Changelog`, PR numbers, and usernames, skip it and scan older releases.
- If the release body has a curated section before generated PR notes, keep the curated section and strip the generated sections.
- If no usable non-prerelease, non-generated CLI release exists in the scanned window, stop and report that no publishable Codex CLI changelog was found.

## Workflow

### 1. Fetch latest usable CLI release

Prefer the helper script. It invokes `gh api` as the only GitHub access path, tries `/releases/latest`, then scans recent releases with `gh api` if the latest body is unusable because it is empty, dependency-only, prerelease-like by name, or only GitHub-generated PR notes. Always run this upstream check first so the workflow knows the current latest usable version before deciding whether local artifacts are duplicates.

```bash
npx --yes tsx <skill-dir>/scripts/fetch_latest_release.ts --json
npx --yes tsx <skill-dir>/scripts/fetch_latest_release.ts --save
```

Default output for `--save`:

```
<project-dir>/.context/codex-cli-changelog/changelogs/<version>.md
```

Use `--max-pages <N>` if the recent release list is unusually noisy. Use `--allow-generated` only if the user explicitly asks to keep PR-generated notes.

The `--json` output includes `existing_local_path` and `archive_status` when `.context/codex-cli-changelog/changelogs/<version>.md` already exists. Treat `archive_status: "unchanged"` as the duplicate check result: reuse the local markdown and continue only with missing downstream artifacts.

If `gh` authentication is missing or expired, do not switch tools. Ask the user to authenticate:

```bash
gh auth login -h github.com
# or
GH_TOKEN=<token> npx --yes tsx <skill-dir>/scripts/fetch_latest_release.ts --save
```

### 2. Save English copy

The helper writes:

```markdown
---
version: <version>
tag: "<tag_name>"
source: https://github.com/openai/codex/releases/tag/<tag>
published: "<published_at>"
fetched: <YYYY-MM-DD>
language: en
generated_notes_handling: "<ok | kept curated sections and removed generated PR notes>"
---

# Codex CLI <version>

<release body, with generated PR sections removed>
```

If the helper output still says `# Codex <version>` because it came from an older script, normalize the saved H1 to `# Codex CLI <version>` before translating/rendering. If `--save` finds an existing file whose content matches apart from `fetched`, skip writing; if the release content differs, overwrite only this version's files.

### 3. Produce Chinese translation

Write to `<project-dir>/.context/codex-cli-changelog/changelogs/<version>.zh.md`:

```markdown
---
version: <version>
tag: "<tag_name>"
source: https://github.com/openai/codex/releases/tag/<tag>
published: "<published_at>"
fetched: <YYYY-MM-DD>
language: zh-CN
---

# Codex CLI <version>（中文版）

<translated release body>
```

If `.context/codex-cli-changelog/changelogs/<version>.zh.md` already exists for the latest version, reuse it and skip translation unless the English archive changed or the user asks for a retranslation.

Translation rules:

- Keep technical identifiers untouched: CLI flags, env vars, config keys, commands, file paths, model names, protocol names, JSON field names, error names, keybindings.
- Translate prose: feature descriptions, bug fix explanations, user-facing behavior.
- Prefer concise, technical Chinese — developer release notes, not marketing copy.
- Preserve bullet order one-to-one; do not merge or reorder.
- Use full-width punctuation `：` `，` `。` in prose; keep half-width inside code identifiers and URLs.
- Common mappings: "Fixed" -> "修复"; "Added" -> "新增"; "Changed" -> "变更"; "Improved" -> "优化"; "Security" -> "安全"; "TUI" stays `TUI`; "MCP" stays `MCP`.

### 4. Render changelog images (CN + EN, both required)

Produce dark-themed PNGs of BOTH the translated and upstream-English changelog so they can be pasted directly into chats, slides, or social posts. Always run this step after saving the `.md` and `.zh.md` files unless the user explicitly opts out — the rednote workflow assumes both images exist as 图2（中文版）+ 图3（英文原版）.

Run the renderer twice — once per language — and dispatch the two calls in parallel (independent inputs and outputs):

```bash
# Chinese
npx --yes tsx \
  <skill-dir>/scripts/render_changelog.ts \
  --input <project-dir>/.context/codex-cli-changelog/changelogs/<version>.zh.md

# English
npx --yes tsx \
  <skill-dir>/scripts/render_changelog.ts \
  --input <project-dir>/.context/codex-cli-changelog/changelogs/<version>.md
```

Outputs:

- `.context/codex-cli-changelog/assets/rendered/<version>.zh.png` — Chinese, retina 2x, ~1600px (becomes 图2 in the rednote)
- `.context/codex-cli-changelog/assets/rendered/<version>.png` — English, retina 2x, ~1600px (becomes 图3 in the rednote)

If `.context/codex-cli-changelog/assets/rendered/<version>.zh.png` and `.context/codex-cli-changelog/assets/rendered/<version>.png` already exist for the latest version, skip rendering. If only one image exists, render only the missing language. The renderer strips YAML frontmatter, removes `（中文版）` / `(中文版)` from the image title, converts markdown to HTML, and screenshots it with a dark theme.

First-time setup requires Chromium:

```bash
npx --yes --package playwright playwright install chromium
```

### 5. Optional Xiaohongshu post

When the user asks for a rednote / 小红书 post about the update, create a detailed but scannable post directly from the curated Codex CLI changelog content. The output goes under the current project's context folder:

```
<project-dir>/.context/codex-cli-changelog/rednotes/codex-cli-<version>.md
```

Before drafting, do a product-manager read of the release:

- Read the latest English archive and Chinese translation end to end. Do not write from the release title or the first bullet only.
- Review up to the 10 most recent prior Codex CLI changelog entries for continuity. Prefer `<project-dir>/.context/codex-cli-changelog/changelogs/`, then any bundled `<skill-dir>/changelogs/`, and if local history is thin, use the recent `gh api 'repos/openai/codex/releases?per_page=30'` release context while still respecting this skill's filtering rules. This history pass is for pattern recognition: a multi-release CLI workflow arc, a safety hardening sequence, a recurring Windows/TUI/MCP/auth fix line, or whether the latest release is mostly maintenance. Do not invent a callback when the evidence is weak.
- Pick 3-5 numbered highlights that a user, developer, or product manager would immediately care about. Prioritize direct experience: new commands, changed defaults, approval/sandbox/security behavior, TUI interaction, session/history/resume behavior, remote control, MCP/config compatibility, Windows support, auth stability, performance, and fixes that remove obvious workflow friction.
- De-prioritize internal refactors, dependency bumps, PR-list trivia, and invisible implementation changes unless they directly affect how someone uses the CLI.
- For each highlight, explain both what changed and why it matters in practice. When a highlight continues a recent arc, add a short natural callback such as "这也接上了前几版一直在收紧的远程控制/安全边界".
- Do not summarize generated PR lists. If the source body was rejected as PR-generated, do not write a rednote from it.

The Xiaohongshu post must be paste-ready plain text, not Markdown. The saved file may be `.md` for project organization, but the content itself must avoid Markdown syntax: no `#` heading marker, no `**bold**`, no `-` bullet lists, no `>` quote blocks, no code fences, and no backticks around commands, flags, or product terms. Hashtags at the end are the only acceptable `#` usage because they are Xiaohongshu tags.

Use a human, lightly opinionated voice inspired by `$vibe-writing`: preserve texture, emotional temperature, and small personal judgments. Do not sand the post into generic AI prose. Separate stronger writing from smoother writing: a concrete, slightly opinionated sentence is better than a polished but empty one.

Avoid AI-flavored filler such as "赋能", "显著提升", "全面升级", "多维度", "闭环", "深度优化", "值得关注的是" unless the changelog itself makes that phrasing unavoidable. Do not over-explain the workflow or say "以下是". Write like a real developer/product manager sharing what they noticed after reading the changelog.

Do not use a fixed transition sentence between the reference line and the numbered highlights. That sentence should be content-specific, or omitted entirely when the title and first highlight already carry the post. Vary the opening based on the release story: a big feature can start with a direct judgment, a maintenance release can start with "这版看起来不大，但...", a platform expansion can start with who now benefits, and a safety/reliability release can start with the friction or risk it removes. Repeated generic lines make the series feel templated.

The Xiaohongshu post should use this plain-text structure:

```text
Codex CLI <version>｜<one sharp, user-facing headline>

完整原版 ChangeLog 见图2（中文版）、图3（英文原版）。

<可选的一句内容化开场；也可以直接进入第 1 条。不要每篇都用同一句套话。>

1｜<最影响使用体验的更新>
<1-2 句：基于 changelog 说明具体变化，以及用户/开发者为什么会感受到它。可以带一点判断，但不要夸张。>

2｜<第二个关键变化>
<1-2 句：如果它延续最近 10 条里的某条产品线，就自然 call back；没有证据就不要硬连。>

3｜<第三个关键变化>
<1-2 句：把价值说成人话，避免复读 release note。>

我的判断：<一句收束：这是大功能更新、体验补齐、安全/稳定性修复，还是偏维护的一版；说清楚谁最该看。>

#CodexCLI #OpenAI #AI编程 #开发工具
```

The standalone reference line must be the first non-title line and must be exactly this plain text line:

完整原版 ChangeLog 见图2（中文版）、图3（英文原版）。

Keep hashtags after the body when useful. The title should include the version number and may reuse the rednote cover title. Write in Chinese, conversational but precise: like a developer/product manager who has actually reviewed the changelog and is telling other CLI users what to notice first.

The Xiaohongshu post is laid out as:

- 图1 -> cover generated via `$zenmux-image-generation` (prefer `.context/codex-cli-changelog/assets/covers/<version>/<generated-or-returned-filename>.png` when bundling assets here)
- 图2 -> rendered Chinese changelog (`.context/codex-cli-changelog/assets/rendered/<version>.zh.png`)
- 图3 -> rendered English changelog (`.context/codex-cli-changelog/assets/rendered/<version>.png`)

Both rendered images are produced in Step 4, so the reference line is always accurate. Do not omit or paraphrase it.

### 6. Optional cover image

When the user asks for a cover / 头图 / poster, invoke `$zenmux-image-generation` and let that skill own image generation. Do not duplicate its current commands, setup steps, model routing, prompt-file format, confirmation rules, or troubleshooting details here.

This step requires the **`zenmux-image-generation`** skill. If `$zenmux-image-generation` is not available, install it with `npx skills add ZenMux/skills --skill zenmux-image-generation` before continuing. Do not attempt to hand-roll image generation without it.

Changelog-specific handoff brief:

- Goal: create a 3:4 portrait cover for OpenAI Codex CLI `<version>` as Xiaohongshu / rednote 图1.
- Literal text: include the rednote title and `Codex CLI <version>`; keep the version exact.
- Reference image: use `<skill-dir>/assets/openai.png` (the OpenAI logo bundled with this skill) as `[Image #1]`, and pass it to `$zenmux-image-generation` with `--reference-image <skill-dir>/assets/openai.png`. Place the OpenAI logo visibly but tastefully in the poster, preserving its recognizable geometry and proportions as much as the model allows. Do not invent or fabricate an alternative OpenAI logo.
- Brand grounding: keep the OpenAI logo recognizable when it appears, but do not force every concept into monochrome, terminal UI, architecture diagrams, magazine covers, or any other fixed house style.
- Content grounding: before writing image prompts, distill the changelog into one sharp cover headline, 1-2 supporting phrases, 2-3 release-specific visual motifs, and one reason a developer should care. Do not make a generic "Codex CLI updated" poster when the changelog has a stronger story.
- Style randomization: read `<skill-dir>/references/cover-style-pool.md`, randomly sample 4 different styles for this run, and record the selected style names in the handoff. Do not reuse the same four styles by habit. If one sampled style obviously fights the release story or brand/logo constraints, swap it for another random style and note the reason.
- Creative concept requirement: write 4 fresh, content-driven cover concepts for this specific release, one per sampled style. The styles should shape the visual language, but the changelog story still decides the headline, metaphor, and composition.
- For each concept, produce a compact handoff brief containing:
  - `concept_title`: a memorable name derived from the release story.
  - `style_name`: the sampled style from `references/cover-style-pool.md`.
  - `style_slug`: a filesystem-safe slug derived from the sampled style and concept title, prefixed with `style-01-` through `style-04-`.
  - `cover_headline`: the exact short title to place on the cover.
  - `supporting_text`: 1-2 optional short phrases; keep text minimal.
  - `visual_metaphor`: the central image idea tied to the changelog.
  - `composition`: framing, focal object, depth, negative space, and text placement.
  - `material_palette`: color, texture, lighting, and medium choices; vary these across the four concepts.
  - `reference_usage`: how to use the bundled OpenAI logo reference without turning the cover into a generic brand poster.
  - `generation_params`: `1024x1536`, `quality=high`, `openai_n=1`, `gemini_n=1`, and distinct intended output folders for the two model/protocol runs.
- Model/protocol requirement: for every sampled style, generate exactly one image with `openai/gpt-image-2` via the OpenAI Images edit protocol, and exactly one image with `google/gemini-3.1-flash-image-preview` (or the exact current `google/gemini-3.1-flash-image` model id if `list_models.sh` shows that name) via the Gemini image edit protocol. Both calls must pass the OpenAI logo reference image so the request is an edit/reference-image workflow, not pure text-to-image.
- Optimization requirement: after drafting the four style briefs, hand them to `$zenmux-image-generation` and let that skill optimize each prompt using its current OpenAI and Gemini cookbooks, confirmation rules, API commands, and troubleshooting. This changelog skill should not hand-write final API prompts when `$zenmux-image-generation` can optimize them.
- Batch requirement: generate 8 total images: 4 sampled styles x 2 model/protocol variants. For each style, run one `gpt-image-2` OpenAI edit batch with `-n 1`, then one Gemini edit batch with `-n 1`, using distinct output folders such as `<style-slug>/openai-gpt-image-2/` and `<style-slug>/gemini-3.1-flash-image/`. Do not merge styles or models into a grid.
- Execution note: use `1024x1536` with `quality=high` for both model/protocol variants. Avoid parallel same-folder runs because timestamp-based filenames can collide.
- Output preference: save or place final cover assets under `<project-dir>/.context/codex-cli-changelog/assets/covers/<version>/<style-slug>/<model-slug>/` when bundling the rednote assets.
- **Post-process required — stamp a black metadata footer on every generated cover** (see below). Do this after each successful generation batch (or after all 8 images exist), before reporting paths.
- After generation + footer stamping: report the stamped output paths only. Do not rank, select, or recommend a final 图1 unless the user explicitly asks.
- Avoid: emoji, fake GitHub screenshots, stock-photo people, malformed words, watermarks, invented logos, bland gradient backgrounds, busy small text, and multi-variant grids inside a single image.

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
  --input-dir <project-dir>/.context/codex-cli-changelog/assets/covers/<version>/<style-slug>/openai-gpt-image-2 \
  --image-model "openai/gpt-image-2" \
  --prompt-model "<current-session-model-id>"
```

Repeat for each style × model folder (8 images total). Optional `--suffix -footer` writes alongside instead of overwriting; optional `--output` is for a single explicit destination.

Requires the same Playwright Chromium setup as `render_changelog.ts` (`npx --yes playwright install chromium` once).

Operational rules:

- Follow `$zenmux-image-generation` exactly for prompt optimization, user confirmation, model choice, API invocation, references, output count, dependencies, and error handling.
- For this changelog cover workflow, request 4 sampled styles and 8 total one-image batches: `openai/gpt-image-2` via OpenAI image edit protocol and `google/gemini-3.1-flash-image-preview` via Gemini image edit protocol for each style. Do not run batches in parallel unless every batch has a distinct output folder or otherwise cannot collide.
- After every successful batch, stamp the footer on the returned paths before considering the cover step complete.
- If `$zenmux-image-generation` defaults change, use its current defaults rather than older assumptions in archived changelog runs.
- If the generated files land in `$zenmux-image-generation`'s own output folder, stamp the footer on those paths first; only copy or reorganize them into this skill's cover folder when the user asks or the current run explicitly needs the rednote asset bundle.

### 7. Report

Output a short summary: version, source release URL, saved file paths, rendered PNG paths, optional rednote/cover paths, and a one-line headline of what the release contains.

## Output locations

Bundled code/assets live under `<skill-dir>`; generated runtime output lives under `<project-dir>/.context/codex-cli-changelog/`.

```
<skill-dir>/
├── SKILL.md
├── scripts/
│   ├── fetch_latest_release.ts             # GitHub releases -> curated markdown
│   ├── render_changelog.ts                 # Markdown -> dark-themed PNG
│   └── stamp_cover_footer.ts               # Append black model/date footer under covers
├── references/
│   └── cover-style-pool.md                 # 60 cover styles for random sampling
└── assets/
    └── openai.png                          # Bundled OpenAI logo reference for cover handoff

<project-dir>/.context/codex-cli-changelog/
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
    └── codex-cli-<version>.md
```

Files are version-named so re-running the skill for the same release is idempotent.
Generated image folders (`assets/rendered/` and `assets/covers/`) are gitignored inside `.context/codex-cli-changelog/` because they are reproducible local/social assets and can become large.
