#!/usr/bin/env -S npx --yes tsx
/**
 * Find an existing Claude Code changelog archive for a known upstream version.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

const SKILL_NAME = "claudecode-cli-changelog";

interface Args {
  changelogDir: string;
  version: string;
  json: boolean;
}

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

function defaultChangelogDir(): string {
  return path.join(projectRoot(), ".context", SKILL_NAME, "changelogs");
}

function expandHome(value: string): string {
  if (value === "~") return process.env.HOME ?? value;
  if (value.startsWith("~/")) return path.join(process.env.HOME ?? "", value.slice(2));
  return value;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { changelogDir: defaultChangelogDir(), version: "", json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--changelog-dir") args.changelogDir = expandHome(argv[++i] ?? "");
    else if (arg === "--version") args.version = argv[++i] ?? "";
    else if (arg === "--json") args.json = true;
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write("Usage: find_existing_changelog.ts --version VERSION [--changelog-dir DIR] [--json]\n");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.version) throw new Error("--version is required");
  return args;
}

function parseSimpleFrontmatter(text: string): Record<string, string> {
  if (!text.startsWith("---\n")) return {};
  const end = text.indexOf("\n---\n");
  if (end === -1) return {};
  const raw = text.slice(4, end);
  const data: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    data[key] = value;
  }
  return data;
}

function versionSortKey(value: string): number[] {
  const parts = value.match(/\d+/g)?.map((part) => Number.parseInt(part, 10)) ?? [];
  return parts.length ? parts : [0];
}

function compareVersions(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

function isArchiveMarkdown(file: string): boolean {
  return file.endsWith(".md") && !file.endsWith(".zh.md");
}

function findArchives(changelogDir: string, version: string): Array<{ path: string; frontmatter: Record<string, string>; mtime: number }> {
  if (!fs.existsSync(changelogDir)) return [];
  return fs
    .readdirSync(changelogDir)
    .filter((file) => isArchiveMarkdown(file) && path.basename(file, ".md") === version)
    .map((file) => {
      const full = path.join(changelogDir, file);
      const text = fs.readFileSync(full, "utf8");
      return { path: full, frontmatter: parseSimpleFrontmatter(text), mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => {
      const versionCmp = compareVersions(
        versionSortKey(b.frontmatter.version || path.basename(b.path, ".md")),
        versionSortKey(a.frontmatter.version || path.basename(a.path, ".md")),
      );
      return versionCmp || b.mtime - a.mtime;
    });
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  const changelogDir = path.resolve(expandHome(args.changelogDir));
  const archives = findArchives(changelogDir, args.version);
  if (!archives.length) {
    process.stderr.write("No existing Claude Code changelog archive found.\n");
    return 1;
  }

  const archive = archives[0];
  if (args.json) {
    const payload = {
      version: archive.frontmatter.version || path.basename(archive.path, ".md"),
      source: archive.frontmatter.source,
      fetched: archive.frontmatter.fetched,
      language: archive.frontmatter.language || "en",
      reused_local: true,
      local_path: archive.path,
      status: "local archive found for the selected upstream version",
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write(`${archive.path}\n`);
  }
  return 0;
}

try {
  process.exit(main());
} catch (error) {
  process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
}
