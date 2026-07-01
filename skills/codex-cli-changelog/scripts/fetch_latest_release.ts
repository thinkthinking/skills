#!/usr/bin/env -S npx --yes tsx
/**
 * Fetch the latest usable OpenAI Codex release notes with GitHub CLI.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const OWNER = "openai";
const REPO = "codex";
const SKILL_NAME = "codex-cli-changelog";

const PRERELEASE_RE = /(?:^|[-_.])(alpha|beta|rc|pre|preview|nightly|snapshot|canary)(?:[-_.]|\d|$)/i;
const VERSION_RE = /(?:codex[-_])?(?:rust[-_])?v?(\d+\.\d+\.\d+(?:\.\d+)?)/i;
const GENERATED_SECTION_RE = /^\s*#{1,3}\s+(what'?s changed|new contributors|contributors|full changelog|changelog)\b/i;
const FULL_CHANGELOG_RE = /^\s*(?:\*\*)?full changelog(?:\*\*)?\s*:/i;
const PR_BULLET_RE = /^\s*[-*]\s+.*#\d{2,}.*@\S+/i;

interface Args {
  save: boolean;
  outputDir: string;
  json: boolean;
  allowGenerated: boolean;
  maxPages: number;
}

type Release = Record<string, unknown>;

class FetchError extends Error {}

function projectRoot(): string {
  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
    return root ? path.resolve(root) : process.cwd();
  } catch {
    return process.cwd();
  }
}

function defaultRuntimeDir(): string {
  return path.join(projectRoot(), ".context", SKILL_NAME);
}

function defaultOutputDir(): string {
  return path.join(defaultRuntimeDir(), "changelogs");
}

function ensureRuntimeGitignore(): void {
  const runtimeDir = defaultRuntimeDir();
  fs.mkdirSync(runtimeDir, { recursive: true });
  const gitignore = path.join(runtimeDir, ".gitignore");
  if (fs.existsSync(gitignore)) return;
  fs.writeFileSync(
    gitignore,
    [
      "assets/rendered/",
      "assets/covers/",
      "*.png",
      "*.jpg",
      "*.jpeg",
      "*.webp",
      "*.gif",
      "*.mp4",
      "*.mov",
      ".DS_Store",
      "__pycache__/",
      "",
    ].join("\n"),
    "utf8",
  );
}

function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    save: false,
    outputDir: defaultOutputDir(),
    json: false,
    allowGenerated: false,
    maxPages: 3,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--save") args.save = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--allow-generated") args.allowGenerated = true;
    else if (arg === "--max-pages") args.maxPages = Number.parseInt(argv[++i] ?? "3", 10);
    else if (arg === "--output-dir") args.outputDir = expandHome(argv[++i] ?? "");
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new FetchError(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function printHelp(): void {
  process.stdout.write(`Usage: fetch_latest_release.ts [--json] [--save] [--output-dir DIR] [--allow-generated] [--max-pages N]\n`);
}

function expandHome(value: string): string {
  if (value === "~") return process.env.HOME ?? value;
  if (value.startsWith("~/")) return path.join(process.env.HOME ?? "", value.slice(2));
  return value;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function comparableMarkdown(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => !line.startsWith("fetched:"))
    .join("\n")
    .trim();
}

function requestJson(apiPath: string, query?: Record<string, string | number>): unknown {
  let endpoint = `repos/${OWNER}/${REPO}${apiPath}`;
  if (query) endpoint += `?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString()}`;
  const proc = spawnSync("gh", ["api", endpoint], {
    encoding: "utf8",
    timeout: 60_000,
  });

  if (proc.error && (proc.error as NodeJS.ErrnoException).code === "ENOENT") {
    throw new FetchError("GitHub CLI `gh` is not installed or not on PATH.");
  }
  if (proc.error) throw new FetchError(`gh api ${endpoint} failed: ${proc.error.message}`);
  if (proc.status !== 0) {
    const stderr = (proc.stderr || proc.stdout || "").trim();
    if (stderr.includes("gh auth login") || stderr.includes("GH_TOKEN") || stderr.includes("Bad credentials")) {
      throw new FetchError(
        "GitHub CLI authentication is missing or expired. Run `gh auth login -h github.com` or set `GH_TOKEN`, then retry. " +
          `gh said: ${stderr}`,
      );
    }
    throw new FetchError(`gh api ${endpoint} failed: ${stderr}`);
  }

  try {
    return JSON.parse(proc.stdout);
  } catch {
    throw new FetchError(`gh api ${endpoint} returned invalid JSON: ${proc.stdout.slice(0, 500)}`);
  }
}

function str(value: unknown): string {
  return value == null ? "" : String(value);
}

function releaseLabel(release: Release): string {
  return [release.tag_name, release.name, release.html_url].map(str).join(" ").trim();
}

function canonicalVersion(release: Release): string {
  const match = releaseLabel(release).match(VERSION_RE);
  if (match) return match[1];
  return str(release.tag_name || release.name || release.id);
}

function isNonCodexRelease(release: Release): boolean {
  const label = releaseLabel(release).toLowerCase();
  return label.includes("rusty-v8") || label.includes("librusty");
}

function stripGeneratedSections(body: string): [string, string[]] {
  const kept: string[] = [];
  const removed: string[] = [];
  let skipping = false;

  for (const line of body.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
    if (GENERATED_SECTION_RE.test(line) || FULL_CHANGELOG_RE.test(line)) {
      removed.push(line.trim() || line);
      skipping = true;
      continue;
    }
    if (skipping) {
      if (/^\s*#{1,3}\s+/.test(line)) {
        if (GENERATED_SECTION_RE.test(line) || FULL_CHANGELOG_RE.test(line)) {
          removed.push(line.trim() || line);
          continue;
        }
        skipping = false;
        kept.push(line);
      } else {
        removed.push(line.trim() || line);
      }
      continue;
    }
    kept.push(line);
  }
  return [kept.join("\n").trim(), removed.filter(Boolean)];
}

function looksLikeGeneratedPrNotes(body: string): boolean {
  const lines = body.split("\n").filter((line) => line.trim());
  if (!lines.length) return true;
  const prBullets = lines.filter((line) => PR_BULLET_RE.test(line));
  const generatedHeadingCount = lines.filter((line) => GENERATED_SECTION_RE.test(line)).length;
  const hasFullChangelog = lines.some((line) => FULL_CHANGELOG_RE.test(line));
  if (generatedHeadingCount || hasFullChangelog) {
    const nonHeading = lines.filter((line) => !GENERATED_SECTION_RE.test(line) && !FULL_CHANGELOG_RE.test(line));
    if (nonHeading.length && prBullets.length / nonHeading.length >= 0.6) return true;
  }
  return prBullets.length >= 8 && prBullets.length / lines.length >= 0.7;
}

function usableRelease(release: Release, allowGenerated: boolean): [boolean, string, string, string[]] {
  if (release.draft) return [false, "", "draft release", []];
  if (release.prerelease || PRERELEASE_RE.test(releaseLabel(release))) return [false, "", "prerelease release", []];
  if (isNonCodexRelease(release)) return [false, "", "non-Codex dependency release", []];

  const body = str(release.body).trim();
  if (!body) return [false, "", "empty release body", []];

  const [cleaned, removed] = stripGeneratedSections(body);
  if (!allowGenerated && looksLikeGeneratedPrNotes(body)) {
    if (cleaned && !looksLikeGeneratedPrNotes(cleaned)) return [true, cleaned, "kept curated sections and removed generated PR notes", removed];
    return [false, "", "generated PR release notes only", removed];
  }
  if (!cleaned) return [false, "", "no content left after removing generated sections", removed];
  return [true, cleaned, "ok", removed];
}

function findLatestRelease(allowGenerated: boolean, maxPages: number): [Release, string, string, string[]] {
  const skipped: string[] = [];
  const latest = requestJson("/releases/latest") as Release;
  const latestUsable = usableRelease(latest, allowGenerated);
  if (latestUsable[0]) return [latest, latestUsable[1], latestUsable[2], latestUsable[3]];
  skipped.push(`${str(latest.tag_name)}: ${latestUsable[2]}`);

  for (let page = 1; page <= maxPages; page++) {
    const releases = requestJson("/releases", { per_page: 30, page }) as Release[];
    if (!Array.isArray(releases) || !releases.length) break;
    for (const release of releases) {
      const [ok, body, reason, removed] = usableRelease(release, allowGenerated);
      if (ok) {
        if (skipped.length) release._codex_changelog_skipped = skipped;
        return [release, body, reason, removed];
      }
      skipped.push(`${str(release.tag_name)}: ${reason}`);
    }
  }
  throw new FetchError(`No usable latest Codex release found. Skipped: ${skipped.slice(0, 20).join("; ")}`);
}

function markdownForRelease(release: Release, body: string, reason: string): string {
  const version = canonicalVersion(release);
  const source = str(release.html_url || `https://github.com/${OWNER}/${REPO}/releases`);
  const tag = str(release.tag_name);
  const published = str(release.published_at);
  return [
    "---",
    `version: ${version}`,
    `tag: ${JSON.stringify(tag)}`,
    `source: ${source}`,
    `published: ${JSON.stringify(published)}`,
    `fetched: ${today()}`,
    "language: en",
    `generated_notes_handling: ${JSON.stringify(reason)}`,
    "---",
    "",
    `# Codex CLI ${version}`,
    "",
    body.trim(),
    "",
  ].join("\n");
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(expandHome(args.outputDir));
  const [release, body, reason, removed] = findLatestRelease(args.allowGenerated, args.maxPages);
  const version = canonicalVersion(release);
  const markdown = markdownForRelease(release, body, reason);
  const outPath = path.join(outDir, `${version}.md`);

  if (args.json) {
    const payload: Record<string, unknown> = {
      version,
      tag_name: release.tag_name,
      name: release.name,
      html_url: release.html_url,
      published_at: release.published_at,
      generated_notes_handling: reason,
      removed_generated_lines: removed.slice(0, 20),
      skipped: release._codex_changelog_skipped ?? [],
    };
    if (fs.existsSync(outPath)) {
      const existing = fs.readFileSync(outPath, "utf8");
      payload.existing_local_path = outPath;
      payload.archive_status = comparableMarkdown(existing) === comparableMarkdown(markdown) ? "unchanged" : "different";
    }
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write(markdown);
  }

  if (args.save) {
    if (isInside(outDir, defaultRuntimeDir())) ensureRuntimeGitignore();
    fs.mkdirSync(outDir, { recursive: true });
    if (fs.existsSync(outPath)) {
      const existing = fs.readFileSync(outPath, "utf8");
      if (comparableMarkdown(existing) === comparableMarkdown(markdown)) {
        process.stderr.write(`Skipped unchanged: ${outPath}\n`);
        return 0;
      }
    }
    fs.writeFileSync(outPath, markdown, "utf8");
    process.stderr.write(`Saved: ${outPath}\n`);
  }
  return 0;
}

try {
  process.exit(main());
} catch (error) {
  process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
}
