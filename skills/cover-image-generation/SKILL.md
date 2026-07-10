---
name: cover-image-generation
description: Create platform-ready social media cover images, headers, thumbnails, and posters with selectable aspect ratios and safe-area-aware compositions. Use when the user asks for a cover image, social cover, Xiaohongshu or Instagram cover, story or reel cover, YouTube thumbnail or channel art, X or LinkedIn header, WeChat article cover, Open Graph image, banner, hero image, or any image that must fit a named platform or ratio. Default to a 3:4 portrait cover and openai/gpt-image-2 when the user does not specify a ratio or model.
---

# Cover Image Generation

Create content-driven cover images and deliver them at the requested social-media ratio. Compose `$zenmux-image-generation` for prompt optimization and image API calls; keep model routing, authentication, current API commands, and generation troubleshooting in that skill.

## Paths and dependency

Resolve `<skill-dir>` as the directory containing this `SKILL.md`. Resolve `<project-dir>` with `git rev-parse --show-toplevel`, falling back to the current working directory.

Write runtime prompts and generated covers under the consuming project, never inside this source skill:

```text
<project-dir>/.context/cover-image-generation/<job-slug>/
├── briefs/
└── covers/
    └── <ratio-slug>/<style-slug>/<model-slug>/
```

Save the cover-specific concept batch under `briefs/`. Let `$zenmux-image-generation` keep its optimized API prompt files in its own project-local `.context/prompts/zenmux-image-generation/` path.

Require `$zenmux-image-generation`. If it is unavailable, install it before generating:

```bash
npx skills add ZenMux/skills --skill zenmux-image-generation
```

Do not hand-roll an image API call. Let `$zenmux-image-generation` refresh its references, optimize and save prompts, ask for confirmation, choose the protocol-specific script, and handle API errors.

## Defaults

Use these values unless the user overrides them:

- Ratio: `3:4`
- Preset: `portrait-3x4`
- Generation size for `openai/gpt-image-2`: `1152x1536` (an exact 3:4 canvas that satisfies its multiple-of-16 rule)
- Model: `openai/gpt-image-2`
- Quality: `high` when the cover contains literal text or a logo; otherwise `medium`
- Format: PNG
- Exploration: four total outputs. With no requested style, use four different sampled styles and one output per style. With an explicit style, generate four variants in that direction. Respect an explicit count.
- Footer: preserve the clean exact-ratio cover and also create an annotated `-footer` copy with a black metadata footer.

Do not inherit the old changelog-cover assumption that `1024x1536` is 3:4; it is 2:3.

## Workflow

### 1. Extract the cover brief

Capture the purpose and platform, content story, exact headline, optional supporting text, brand rules, references, ratio or pixel size, safe area, model, quality, format, output count, and style preferences.

Ask only for information that materially blocks the cover. The subject is required. Infer the platform, style, and supporting text when the user has supplied enough context.

Treat quoted copy as literal. Keep cover text short: prefer one headline and at most two small supporting phrases. Never invent a logo or wordmark when no trustworthy reference is available.

### 2. Resolve the ratio and canvas

Apply this precedence:

1. Explicit pixel dimensions
2. Explicit aspect ratio
3. Named platform preset
4. Default `3:4`

Read [references/social-cover-presets.md](references/social-cover-presets.md) for supported presets, safe areas, and model constraints. Resolve a known preset or custom ratio with the bundled TypeScript helper:

```bash
npx --yes tsx <skill-dir>/scripts/resolve_cover_size.ts --preset portrait-3x4 --model openai/gpt-image-2
npx --yes tsx <skill-dir>/scripts/resolve_cover_size.ts --ratio 9:16 --model openai/gpt-image-2 --json
```

Use the returned `generation_size` for generation and `delivery_size` for the clean final file. If `requires_postprocess` is true, reserve a centered safe zone in the prompt and fit the generated image after generation.

For an explicit size, validate it against the current `$zenmux-image-generation` rules before saving prompts. For `openai/gpt-image-2`, each edge must be a multiple of 16, the ratio must stay between 1:3 and 3:1, and the pixel count must remain within the supported range. Do not silently change an explicit user size; explain the nearest valid generation size and final crop.

### 3. Distill the content

Reduce the source material to one sharp headline, zero to two supporting phrases, two or three content-specific visual motifs, one reason the audience should care, and the focal subject, brand invariants, and safe zone.

Ground the concept in the supplied article, release, product, event, or campaign. Avoid generic "new update" artwork when the source has a clearer story.

### 4. Choose styles and concepts

Honor a user-selected style. Otherwise read [references/cover-style-pool.md](references/cover-style-pool.md), sample up to four different styles without replacement, and record them in the batch brief. Match a smaller explicit output count; for counts above four, distribute the additional variants across the four sampled directions. Replace a sampled style only when it conflicts with the subject, brand rules, literal text, or platform crop; record the reason.

Create one content-driven concept per style. Record `concept_title`, `style_name`, `style_slug`, `cover_headline`, `supporting_text`, `visual_metaphor`, `composition`, `material_palette`, `reference_usage`, invariants, ratio, generation and delivery sizes, crop plan, model, quality, output count, and output folder.

Do not make four cosmetic color swaps. Vary the visual language while keeping the same content truth and brand constraints.

### 5. Hand off to image generation

Invoke `$zenmux-image-generation` with the exact concept brief, model, generation size, quality, count, references, and output folder. Let that skill consult the current model cookbook and own the optimized-prompt format.

For reference images, number them `[Image #1]`, `[Image #2]`, and so on in generation order. State what to use from each image and what to ignore. Repeat invariants for identity, geometry, brand marks, product shape, and layout. Use the edit/reference-image protocol; do not degrade a reference-driven request into text-to-image.

Save each concept to a distinct folder:

```text
<project-dir>/.context/cover-image-generation/<job-slug>/covers/
└── <ratio-slug>/<style-slug>/<model-slug>/
```

Default to `openai/gpt-image-2`. Generate with multiple models only when the user requests a comparison or the chosen model cannot satisfy the brief. Keep model outputs separate. Avoid concurrent calls into the same output folder because timestamp-based filenames can collide.

Show the optimized prompt or batch of prompts and parameters, then follow `$zenmux-image-generation`'s confirmation checkpoint. Do not call the image API before confirmation.

### 6. Fit and verify delivery files

When the plan requires a crop or exact delivery dimensions, run:

```bash
npx --yes tsx <skill-dir>/scripts/fit_cover.ts \
  --input <generated.png> \
  --output <clean-delivery.png> \
  --width <delivery-width> \
  --height <delivery-height> \
  --gravity center
```

The helper prefers ImageMagick and falls back to macOS `sips`. It preserves the source and uses cover-fit behavior: scale to fill, then crop overflow. Use `top`, `bottom`, `left`, or `right` only when the composition reserved that crop.

Verify the clean file's actual dimensions and inspect it for text correctness, malformed logos, crop damage, safe-area violations, unintended watermarks, and duplicate variants. Retry a failed direction as an edit of the best source image, preserving everything except the named defect.

### 7. Stamp the black metadata footer

After the clean exact-ratio file is ready, create a separate annotated copy:

```bash
npx --yes tsx <skill-dir>/scripts/stamp_cover_footer.ts \
  --input <clean-delivery.png> \
  --image-model openai/gpt-image-2 \
  --prompt-model <current-session-model-id> \
  --date <YYYY-MM-DD>
```

The footer must show `生图模型`, `提示词模型`, and `生成日期`. Use the actual image model for `--image-model` and the exact interactive model that authored the optimized prompt for `--prompt-model`; do not confuse the two. The default output is `<name>-footer.<ext>` and the clean source remains unchanged.

Stamp each file exactly once and never feed a `-footer` file back into the footer script. The annotated copy is for provenance and review; the clean copy is the platform-ready exact-ratio asset. If the user explicitly wants the footer inside the publishable ratio, reserve an internal footer area during concept design instead of appending after generation.

Avoid emoji, fabricated brand marks, cluttered fake screenshots, dense small text, accidental watermarks, and multi-variant grids unless explicitly requested.

### 8. Report

Report the selected preset or ratio, clean pixel dimensions, image model, prompt model, style names, and absolute paths to both clean and `-footer` outputs. Do not rank or declare a winner unless the user asks.

If generation stopped at confirmation, report the saved brief and prompt paths plus the exact pending parameters instead of claiming that images exist.
