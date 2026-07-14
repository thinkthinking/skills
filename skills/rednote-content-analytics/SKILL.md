---
name: rednote-content-analytics
description: Collect, normalize, summarize, and incrementally update a user's Xiaohongshu/Rednote published-content analytics through OpenCLI. Use when the user asks to list or audit their Xiaohongshu posts, export titles and links, analyze posting history, calculate views/likes/collects/comments, compare content performance, refresh previously collected Rednote data, or persist creator analytics as project-local JSON. Also trigger for Xiaohongshu profile URLs and requests mentioning 小红书数据、笔记统计、浏览量、点赞、收藏、评论、爆文、内容复盘、账号使用情况、增量更新, or Rednote analytics.
---

# Rednote Content Analytics

Use OpenCLI as the collection layer, preserve platform values without guessing, and maintain one incremental JSON dataset per user.

## Resolve paths

Resolve `<skill-dir>` as the directory containing this `SKILL.md`. Resolve `<project-dir>` with `git rev-parse --show-toplevel`, falling back to the current working directory.

Write all runtime data to the consuming project, never to the installed skill or the skills source repository:

```text
<project-dir>/.context/rednote-content-analytics/<username>/
├── notes.json
├── summary.json
├── sync-state.json
└── snapshots/
    └── <sync-time>.json
```

Read [references/data-schema.md](references/data-schema.md) when writing another consumer, changing fields, or interpreting missing values.

## 1. Check OpenCLI first

Run these checks before inspecting the profile or collecting data:

```bash
command -v opencli
opencli doctor
```

If `opencli` is missing, consult the current official installation instructions at [jackwener/OpenCLI](https://github.com/jackwener/OpenCLI) before installing. Do not assume an old command is still current. The commonly documented npm route is `npm install -g @jackwener/opencli` and requires a supported Node.js version; verify both against the current README, install only with the user's normal package-manager authority, then rerun `opencli doctor`.

If `doctor` reports a browser bridge problem, follow its exact diagnostic. Browser-dependent Xiaohongshu commands require Chrome, the OpenCLI extension, and a logged-in session. Do not replace a failed OpenCLI flow with an unrelated scraper.

Load `$opencli-usage` when available. Discover the installed Xiaohongshu surface instead of assuming command names:

```bash
opencli list -f json
opencli xiaohongshu --help
```

Prefer a current dedicated adapter over raw browser driving.

## 2. Identify the account and scope

Capture the requested profile URL, username, date boundary, requested metrics, and whether the user wants a normal incremental refresh or a full current refresh.

Use `opencli xiaohongshu whoami -f json` and, when available, `creator-profile` to identify the logged-in creator. Verify it matches the requested personal profile before using private creator analytics.

- For the logged-in owner, use creator analytics for views, likes, collects, and comments.
- For another public profile, collect only fields exposed by the public adapter/page. Save unavailable metrics as `null`, never `0`.
- Treat all counts as a point-in-time snapshot. State the sync timestamp in the result.

If the user omits some metric names, still collect the canonical fields when available: title, public link, publication time, views, likes, collects, and comments.

## 3. Choose incremental or full collection

Inspect `<project-dir>/.context/rednote-content-analytics/<username>/sync-state.json` and `notes.json` before fetching.

### First collection

Fetch enough descending pages to cross the requested start date. For an unbounded request, fetch the full available history. A common dedicated command is:

```bash
opencli xiaohongshu creator-notes --limit <N> -f json
```

Confirm that the oldest returned note is at or before the requested boundary. Do not call a partial first page complete.

### Incremental refresh

Fetch recent notes until the result overlaps at least 20 already-known note IDs, or fetch 50 recent notes when the adapter exposes only a limit. This adds new posts and refreshes metrics on the returned known posts while preserving all older local records.

Use a full refresh when the user asks for exact current totals across all historical posts, when local coverage does not reach the requested boundary, or when the local state is missing/corrupt.

Never replace the dataset with a shorter response. Merge by stable note ID.

## 4. Handle adapter pagination gaps

If a dedicated adapter rejects partial results or cannot cross a pagination boundary, rerun once with `--trace retain-on-failure` and inspect the trace summary. Do not present the partial response as complete.

For a read-only browser fallback, use `$opencli-browser` when available and follow its inspect-before-act rules:

1. Open `https://creator.xiaohongshu.com/statistics/data-analysis?source=official` in a stable named session.
2. Run `state` before interacting.
3. Inspect `network --filter "note_infos,total"` to confirm the analytics response.
4. Advance one page at a time with the page's actual next control. On the current creator UI, the scoped selector is `.d-pagination .d-pagination-page:last-child`; re-inspect if the UI differs.
5. Stop when the next control is disabled or the captured unique note count reaches the API `total`.
6. Export the filtered network result with bodies using `network --filter "note_infos,total" --raw`.
7. Close the owned session.

Cap the loop using the API total/page size plus two guard iterations. Never use an unbounded click loop. Prefer the platform's official “导出数据” action if it provides a complete machine-readable file for the requested range.

## 5. Fill missing titles

Treat an empty title as missing data, not an empty-string final title.

For every missing title, read the note body with the dedicated note adapter or a signed note URL obtained from the profile result. Collapse whitespace and use the first 100 Unicode characters of body text as the title. Pass these values through `--content-map` when merging.

If the body is unavailable, keep `title: null`, `title_missing: true`, and report the affected IDs. Do not invent a title from metrics, cover URLs, or the note ID.

## 6. Normalize and merge JSON

Save the fresh OpenCLI JSON to a temporary file or the user's data directory, then run:

```bash
npx --yes tsx <skill-dir>/scripts/merge_rednote_data.ts \
  --input <fresh-opencli.json> \
  --project-root <project-dir> \
  --username <username> \
  --profile-url <profile-url> \
  --since <YYYY-MM-DD> \
  --mode incremental \
  --source opencli-creator-notes
```

For a first/full pull, use `--mode full`. For missing-title enrichment, create a temporary JSON object shaped as `{ "<note-id>": "<body text>" }` and add `--content-map <file>`.

The script accepts:

- OpenCLI creator-note arrays;
- creator API objects with `note_infos`;
- OpenCLI browser-network cache/export objects with `entries[].body.data.note_infos`;
- the canonical `notes` array for migrations.

It writes atomically, merges by note ID, updates available metrics, preserves older records absent from the fresh batch, recomputes `summary.json`, records `sync-state.json`, and retains the latest ten normalized snapshots.

## 7. Validate and report

Validate every run before summarizing:

- Confirm JSON parses successfully.
- Confirm note IDs are unique.
- Confirm `note_count` equals `notes.length`.
- Confirm the oldest date crosses the requested boundary for a full pull.
- Confirm unavailable metrics remain `null`.
- Confirm `<project-dir>/.context/rednote-content-analytics/<username>/` is the only runtime output root.

Report the output path, sync mode, fetched/added/updated counts, coverage range, missing-title count, totals for available metrics, and top posts relevant to the request. Link to `notes.json` and `summary.json` when the client supports local-file links.

Do not expose cookies, signed request headers, xsec tokens, or raw browser credentials in saved JSON or the final response.
