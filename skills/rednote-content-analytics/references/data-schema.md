# Data schema

The canonical dataset is JSON and uses `schema_version: 1`.

## `notes.json`

```json
{
  "schema_version": 1,
  "platform": "xiaohongshu",
  "skill": "rednote-content-analytics",
  "username": "thinkthinking",
  "profile_url": "https://www.xiaohongshu.com/user/profile/...",
  "updated_at": "2026-07-14T05:00:00.000Z",
  "note_count": 1,
  "notes": [
    {
      "id": "6a51cd4f0000000006035cf4",
      "title": "第三方GPT-5.6 接入新版Codex报错解决方案",
      "title_source": "platform",
      "title_missing": false,
      "url": "https://www.xiaohongshu.com/explore/6a51cd4f0000000006035cf4",
      "creator_url": "https://creator.xiaohongshu.com/statistics/note-detail?noteId=...",
      "published_at": "2026-07-11T12:57:51+08:00",
      "metrics": {
        "views": 352,
        "likes": 8,
        "collects": 9,
        "comments": 5
      },
      "first_seen_at": "2026-07-14T05:00:00.000Z",
      "last_seen_at": "2026-07-14T05:00:00.000Z",
      "metrics_updated_at": "2026-07-14T05:00:00.000Z"
    }
  ]
}
```

## Field rules

- Use the platform note ID as the merge key.
- Use a public `/explore/<id>` URL in `url`; keep a creator-dashboard URL separately.
- Store Xiaohongshu publication time with an explicit `+08:00` offset when sourced from creator timestamps.
- Preserve zero as a real count. Use `null` only when the platform/source does not provide the metric.
- Use `title_source: platform` for a platform title, `content_prefix` for the normalized first 100 body characters, and `missing` only when neither is available.
- Update `last_seen_at` whenever a note appears in a fresh batch. Update `metrics_updated_at` only when the fresh source contains at least one metric.

## Derived files

- `summary.json` contains totals, averages, metric coverage, date range, missing-title count, and the top ten notes by views.
- `sync-state.json` records sync mode/source, requested boundary, fetched/added/updated counts, total local count, coverage range, and missing-title IDs.
- `snapshots/*.json` stores normalized fresh batches for audit and recovery. Retain ten by default.

The summary is derived and may be rebuilt from `notes.json`. Treat `notes.json` as the durable canonical dataset.
