#!/usr/bin/env -S npx --yes tsx

import * as fs from "node:fs";
import * as path from "node:path";

type Metric = number | null;
type Metrics = { views: Metric; likes: Metric; collects: Metric; comments: Metric };
type Note = {
  id: string;
  title: string | null;
  title_source: "platform" | "content_prefix" | "missing";
  title_missing: boolean;
  url: string;
  creator_url?: string;
  published_at: string | null;
  metrics: Metrics;
  first_seen_at: string;
  last_seen_at: string;
  metrics_updated_at: string | null;
};
type Args = {
  input: string;
  projectRoot: string;
  username: string;
  profileUrl: string;
  contentMap?: string;
  since?: string;
  mode: "incremental" | "full";
  source: string;
  now: string;
  snapshotRetention: number;
};

const SKILL_NAME = "rednote-content-analytics";
const SCHEMA_VERSION = 1;

function usage(): never {
  process.stdout.write(`Usage:
  merge_rednote_data.ts --input RAW.json --username NAME [options]

Options:
  --project-root DIR           Consuming project root (default: cwd)
  --profile-url URL            Public profile URL
  --content-map FILE           JSON object mapping note id to body text
  --since YYYY-MM-DD           Ignore newly fetched notes older than this date
  --mode incremental|full      Sync label (default: incremental)
  --source NAME                Provenance label (default: opencli)
  --now ISO                    Deterministic sync timestamp for tests
  --snapshot-retention N       Keep the latest N normalized snapshots (default: 10)
`);
  process.exit(0);
}

function parseArgs(argv: string[]): Args {
  const result: Args = {
    input: "",
    projectRoot: process.cwd(),
    username: "",
    profileUrl: "",
    mode: "incremental",
    source: "opencli",
    now: new Date().toISOString(),
    snapshotRetention: 10,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i] ?? "";
    if (arg === "--input" || arg === "-i") result.input = next();
    else if (arg === "--project-root") result.projectRoot = next();
    else if (arg === "--username" || arg === "-u") result.username = next();
    else if (arg === "--profile-url") result.profileUrl = next();
    else if (arg === "--content-map") result.contentMap = next();
    else if (arg === "--since") result.since = next();
    else if (arg === "--mode") result.mode = next() as Args["mode"];
    else if (arg === "--source") result.source = next();
    else if (arg === "--now") result.now = next();
    else if (arg === "--snapshot-retention") result.snapshotRetention = Number(next());
    else if (arg === "--help" || arg === "-h") usage();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!result.input) throw new Error("--input is required");
  if (!result.username.trim()) throw new Error("--username is required");
  if (!result.projectRoot) throw new Error("--project-root must not be empty");
  if (!result.input || !fs.existsSync(result.input)) throw new Error(`Input file not found: ${result.input}`);
  if (!['incremental', 'full'].includes(result.mode)) throw new Error("--mode must be incremental or full");
  if (result.since && !/^\d{4}-\d{2}-\d{2}$/.test(result.since)) throw new Error("--since must use YYYY-MM-DD");
  if (!Number.isInteger(result.snapshotRetention) || result.snapshotRetention < 0) throw new Error("--snapshot-retention must be a non-negative integer");
  if (Number.isNaN(Date.parse(result.now))) throw new Error("--now must be a valid ISO timestamp");
  result.input = path.resolve(result.input);
  result.projectRoot = path.resolve(result.projectRoot);
  if (result.contentMap) result.contentMap = path.resolve(result.contentMap);
  return result;
}

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function parseMaybeJson(value: unknown): any {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return null; }
}

function candidatesFrom(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.notes)) return raw.notes;
  if (Array.isArray(raw?.data?.note_infos)) return raw.data.note_infos;
  if (Array.isArray(raw?.note_infos)) return raw.note_infos;
  if (Array.isArray(raw?.entries)) {
    const rows: any[] = [];
    for (const entry of raw.entries) {
      if (!String(entry?.url ?? "").includes("/note/analyze/list")) continue;
      const body = parseMaybeJson(entry?.body);
      const notes = body?.data?.note_infos;
      if (Array.isArray(notes)) rows.push(...notes);
    }
    return rows;
  }
  throw new Error("Unsupported input shape: expected an OpenCLI adapter array, browser network cache, or object with notes/note_infos");
}

function metric(value: unknown): Metric {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "string" ? Number(value.replace(/,/g, "")) : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function contentPrefix(value: unknown, max = 100): string {
  return [...normalizeText(value)].slice(0, max).join("");
}

function xhsIsoFromEpoch(value: number): string {
  const localClock = new Date(value + 8 * 3600_000).toISOString().slice(0, 19);
  return `${localClock}+08:00`;
}

function normalizePublishedAt(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return xhsIsoFromEpoch(value > 1e12 ? value : value * 1000);
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  const zh = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s+(\d{1,2}):(\d{2}))?/);
  if (zh) {
    const [, year, month, day, hour = "00", minute = "00"] = zh;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}:00+08:00`;
  }
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function safeUsername(value: string): string {
  const slug = value.normalize("NFKC").trim().replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^[-.]+|[-.]+$/g, "");
  if (!slug || slug === "." || slug === "..") throw new Error("Username does not contain a safe path segment");
  return slug;
}

function normalizeCandidate(raw: any, now: string, contentMap: Record<string, string>): Note | null {
  const id = normalizeText(firstDefined(raw?.id, raw?.note_id, raw?.noteId));
  if (!id) return null;
  const platformTitle = normalizeText(raw?.title);
  const body = firstDefined(contentMap[id], raw?.content, raw?.desc, raw?.description, raw?.body);
  const fallback = contentPrefix(body);
  const title = platformTitle || fallback || null;
  const rawUrl = normalizeText(firstDefined(raw?.url, raw?.public_url));
  const creatorUrl = rawUrl.includes("creator.xiaohongshu.com") ? rawUrl : undefined;
  const metrics: Metrics = {
    views: metric(firstDefined(raw?.read_count, raw?.views, raw?.metrics?.views)),
    likes: metric(firstDefined(raw?.like_count, raw?.likes, raw?.metrics?.likes)),
    collects: metric(firstDefined(raw?.fav_count, raw?.collects, raw?.favorites, raw?.metrics?.collects)),
    comments: metric(firstDefined(raw?.comment_count, raw?.comments, raw?.metrics?.comments)),
  };
  return {
    id,
    title,
    title_source: platformTitle ? "platform" : fallback ? "content_prefix" : "missing",
    title_missing: !title,
    url: `https://www.xiaohongshu.com/explore/${encodeURIComponent(id)}`,
    ...(creatorUrl ? { creator_url: creatorUrl } : {}),
    published_at: normalizePublishedAt(firstDefined(raw?.post_time, raw?.published_at, raw?.date)),
    metrics,
    first_seen_at: now,
    last_seen_at: now,
    metrics_updated_at: Object.values(metrics).some((value) => value !== null) ? now : null,
  };
}

function noteChanged(before: Note, after: Note): boolean {
  return JSON.stringify({ title: before.title, published_at: before.published_at, metrics: before.metrics }) !==
    JSON.stringify({ title: after.title, published_at: after.published_at, metrics: after.metrics });
}

function mergeNote(previous: Note, fresh: Note, now: string): Note {
  const mergedMetrics: Metrics = {
    views: fresh.metrics.views ?? previous.metrics.views,
    likes: fresh.metrics.likes ?? previous.metrics.likes,
    collects: fresh.metrics.collects ?? previous.metrics.collects,
    comments: fresh.metrics.comments ?? previous.metrics.comments,
  };
  const useFreshTitle = Boolean(fresh.title) && (fresh.title_source === "platform" || !previous.title);
  const sameMinute = Boolean(previous.published_at && fresh.published_at && previous.published_at.slice(0, 16) === fresh.published_at.slice(0, 16));
  const freshLostSeconds = sameMinute && /:00(?:Z|[+-]\d{2}:\d{2})$/.test(fresh.published_at ?? "") && !/:00(?:Z|[+-]\d{2}:\d{2})$/.test(previous.published_at ?? "");
  return {
    ...previous,
    ...fresh,
    title: useFreshTitle ? fresh.title : previous.title,
    title_source: useFreshTitle ? fresh.title_source : previous.title_source,
    title_missing: !(useFreshTitle ? fresh.title : previous.title),
    creator_url: fresh.creator_url ?? previous.creator_url,
    published_at: freshLostSeconds ? previous.published_at : fresh.published_at ?? previous.published_at,
    metrics: mergedMetrics,
    first_seen_at: previous.first_seen_at || now,
    last_seen_at: now,
    metrics_updated_at: Object.values(fresh.metrics).some((value) => value !== null) ? now : previous.metrics_updated_at,
  };
}

function atomicWrite(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temp, file);
}

function total(notes: Note[], key: keyof Metrics): number {
  return notes.reduce((sum, note) => sum + (note.metrics[key] ?? 0), 0);
}

function coverage(notes: Note[], key: keyof Metrics): number {
  return notes.filter((note) => note.metrics[key] !== null).length;
}

function summarize(notes: Note[], username: string, now: string): Record<string, unknown> {
  const metricKeys: (keyof Metrics)[] = ["views", "likes", "collects", "comments"];
  const totals = Object.fromEntries(metricKeys.map((key) => [key, total(notes, key)]));
  const metricCoverage = Object.fromEntries(metricKeys.map((key) => [key, coverage(notes, key)]));
  const topByViews = [...notes]
    .filter((note) => note.metrics.views !== null)
    .sort((a, b) => (b.metrics.views ?? -1) - (a.metrics.views ?? -1))
    .slice(0, 10)
    .map(({ id, title, url, published_at, metrics }) => ({ id, title, url, published_at, metrics }));
  const dates = notes.map((note) => note.published_at).filter((value): value is string => Boolean(value)).sort();
  return {
    schema_version: SCHEMA_VERSION,
    platform: "xiaohongshu",
    username,
    generated_at: now,
    note_count: notes.length,
    title_missing_count: notes.filter((note) => note.title_missing).length,
    date_range: { oldest: dates[0] ?? null, newest: dates.at(-1) ?? null },
    totals,
    metric_coverage: metricCoverage,
    averages: Object.fromEntries(metricKeys.map((key) => [key, metricCoverage[key] ? totals[key] / metricCoverage[key] : null])),
    top_by_views: topByViews,
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const username = safeUsername(args.username);
  const now = new Date(args.now).toISOString();
  const contentMap = args.contentMap ? readJson(args.contentMap) : {};
  if (contentMap === null || Array.isArray(contentMap) || typeof contentMap !== "object") throw new Error("--content-map must contain a JSON object");
  const deduped = new Map<string, Note>();
  for (const candidate of candidatesFrom(readJson(args.input))) {
    const note = normalizeCandidate(candidate, now, contentMap);
    if (!note) continue;
    if (args.since && note.published_at && note.published_at.slice(0, 10) < args.since) continue;
    deduped.set(note.id, note);
  }

  const outputDir = path.join(args.projectRoot, ".context", SKILL_NAME, username);
  const notesPath = path.join(outputDir, "notes.json");
  const existingRoot = fs.existsSync(notesPath) ? readJson(notesPath) : { notes: [] };
  const existingNotes: Note[] = Array.isArray(existingRoot?.notes) ? existingRoot.notes : [];
  const merged = new Map(existingNotes.map((note) => [note.id, note]));
  let added = 0;
  let updated = 0;
  for (const fresh of deduped.values()) {
    const previous = merged.get(fresh.id);
    if (!previous) {
      merged.set(fresh.id, fresh);
      added++;
      continue;
    }
    const next = mergeNote(previous, fresh, now);
    if (noteChanged(previous, next)) updated++;
    merged.set(fresh.id, next);
  }
  const notes = [...merged.values()].sort((a, b) => String(b.published_at ?? "").localeCompare(String(a.published_at ?? "")) || a.id.localeCompare(b.id));
  const root = {
    schema_version: SCHEMA_VERSION,
    platform: "xiaohongshu",
    skill: SKILL_NAME,
    username: args.username,
    profile_url: args.profileUrl || existingRoot?.profile_url || null,
    updated_at: now,
    note_count: notes.length,
    notes,
  };
  const state = {
    schema_version: SCHEMA_VERSION,
    last_sync_at: now,
    mode: args.mode,
    source: args.source,
    requested_since: args.since ?? null,
    fetched_count: deduped.size,
    added_count: added,
    updated_count: updated,
    retained_count: notes.length - added,
    total_note_count: notes.length,
    missing_title_ids: notes.filter((note) => note.title_missing).map((note) => note.id),
    newest_published_at: notes[0]?.published_at ?? null,
    oldest_published_at: notes.at(-1)?.published_at ?? null,
  };
  atomicWrite(notesPath, root);
  atomicWrite(path.join(outputDir, "summary.json"), summarize(notes, args.username, now));
  atomicWrite(path.join(outputDir, "sync-state.json"), state);

  if (args.snapshotRetention > 0) {
    const snapshotsDir = path.join(outputDir, "snapshots");
    const stamp = now.replace(/[:.]/g, "-");
    atomicWrite(path.join(snapshotsDir, `${stamp}.json`), { synced_at: now, source: args.source, mode: args.mode, notes: [...deduped.values()] });
    const snapshots = fs.readdirSync(snapshotsDir).filter((name) => name.endsWith(".json")).sort().reverse();
    for (const stale of snapshots.slice(args.snapshotRetention)) fs.rmSync(path.join(snapshotsDir, stale));
  }
  process.stdout.write(`${JSON.stringify({ output_dir: outputDir, ...state }, null, 2)}\n`);
}

main();
