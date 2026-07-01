#!/usr/bin/env -S npx --yes tsx
/**
 * Fetch the latest Codex App changelog entry from OpenAI Developers.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const SOURCE_URL = "https://developers.openai.com/codex/changelog?type=codex-app";
const BASE_SOURCE_URL = "https://developers.openai.com/codex/changelog";
const TOPIC = "codex-app";
const SKILL_NAME = "codex-app-changelog";
const VERSION_RE = /\b(\d{2}\.\d{3}(?:\.\d+)?)\b/g;

interface Entry {
  entryId: string;
  topics: string[];
  published: string;
  title: string;
  body: string;
}

interface Args {
  save: boolean;
  outputDir: string;
  json: boolean;
  entryId: string | null;
  url: string;
}

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
    entryId: null,
    url: SOURCE_URL,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--save") args.save = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--entry-id") args.entryId = argv[++i] ?? null;
    else if (arg === "--url") args.url = argv[++i] ?? SOURCE_URL;
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
  process.stdout.write(`Usage: fetch_latest_app_changelog.ts [--json] [--save] [--output-dir DIR] [--entry-id ID] [--url URL]\n`);
}

function expandHome(value: string): string {
  if (value === "~") return process.env.HOME ?? value;
  if (value.startsWith("~/")) return path.join(process.env.HOME ?? "", value.slice(2));
  return value;
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

function collapseSpace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function decodeHtml(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    const named: Record<string, string> = {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: '"',
      apos: "'",
      nbsp: " ",
      mdash: "—",
      ndash: "–",
      hellip: "…",
    };
    return named[entity] ?? match;
  });
}

function addText(buffer: string[], data: string): void {
  const text = collapseSpace(decodeHtml(data));
  if (!text) return;
  const previous = buffer.at(-1) ?? "";
  if (
    buffer.length > 0 &&
    !["`", "**", "*"].includes(previous) &&
    !/[ \n]$/.test(previous) &&
    !/^[.,:;)\]]/.test(text)
  ) {
    buffer.push(" ");
  }
  buffer.push(text);
}

function addInlineMarker(buffer: string[], marker: string, closing: boolean): void {
  if (closing && buffer.length > 0) {
    buffer[buffer.length - 1] = `${buffer[buffer.length - 1]}${marker}`;
    return;
  }
  if (buffer.length > 0 && !/[ \n([]$/.test(buffer[buffer.length - 1])) buffer.push(" ");
  buffer.push(marker);
}

function parseAttrs(rawTag: string): Record<string, string> {
  const body = rawTag
    .replace(/^<\s*\/?\s*[^\s/>]+/, "")
    .replace(/\/?\s*>$/, "");
  const attrs: Record<string, string> = {};
  const re = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) {
    attrs[match[1]] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function trimBlankLines(lines: string[]): string[] {
  const result = [...lines];
  while (result.length && !result[0]) result.shift();
  while (result.length && !result[result.length - 1]) result.pop();
  return result;
}

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

class CodexChangelogParser {
  entries: Entry[] = [];
  private inEntry = false;
  private entryDepth = 0;
  private entryMatches = false;
  private entryId = "";
  private entryTopics: string[] = [];
  private inArticle = false;
  private articleDepth = 0;
  private timeDepth = 0;
  private titleDepth = 0;
  private headingDepth = 0;
  private paraDepth = 0;
  private listDepth = 0;
  private itemDepth = 0;
  private published: string[] = [];
  private title: string[] = [];
  private articleLines: string[] = [];
  private headingText: string[] = [];
  private paraText: string[] = [];
  private itemText: string[] = [];

  constructor(private topic: string) {}

  parse(html: string): Entry[] {
    const tokens = html.match(/<[^>]+>|[^<]+/g) ?? [];
    for (const token of tokens) {
      if (token.startsWith("</")) this.handleEnd(token);
      else if (token.startsWith("<")) this.handleStart(token);
      else this.handleData(token);
    }
    return this.entries;
  }

  private handleStart(rawTag: string): void {
    const tag = this.tagName(rawTag);
    if (!tag) return;
    const attrs = parseAttrs(rawTag);
    const isVoid = VOID_TAGS.has(tag) || rawTag.endsWith("/>");

    if (tag === "li" && "data-codex-topics" in attrs) {
      this.inEntry = true;
      this.entryDepth = 1;
      this.entryTopics = attrs["data-codex-topics"].split(/\s+/).filter(Boolean);
      this.entryMatches = this.entryTopics.includes(this.topic);
      this.entryId = attrs.id ?? "";
      this.published = [];
      this.title = [];
      this.articleLines = [];
      return;
    }

    if (!this.inEntry) return;
    if (!isVoid) this.entryDepth += 1;
    if (!this.entryMatches) return;

    if (this.inArticle) {
      if (!isVoid) this.articleDepth += 1;
      this.handleArticleStart(tag);
      return;
    }

    if (tag === "article") {
      this.inArticle = true;
      this.articleDepth = 1;
    } else if (tag === "time") {
      this.timeDepth += 1;
    } else if (tag === "h3") {
      this.titleDepth += 1;
    }
  }

  private handleEnd(rawTag: string): void {
    const tag = this.tagName(rawTag);
    if (!tag || !this.inEntry) return;

    if (this.entryMatches) {
      if (this.inArticle) {
        this.handleArticleEnd(tag);
        this.articleDepth -= 1;
        if (this.articleDepth === 0) this.inArticle = false;
      } else if (tag === "time" && this.timeDepth) {
        this.timeDepth -= 1;
      } else if (tag === "h3" && this.titleDepth) {
        this.titleDepth -= 1;
      }
    }

    this.entryDepth -= 1;
    if (this.entryDepth === 0) {
      if (this.entryMatches) {
        this.entries.push({
          entryId: this.entryId,
          topics: this.entryTopics,
          published: collapseSpace(this.published.join("")),
          title: collapseSpace(this.title.join("")),
          body: trimBlankLines(this.articleLines).join("\n").trim(),
        });
      }
      this.inEntry = false;
      this.entryMatches = false;
    }
  }

  private handleData(data: string): void {
    if (!this.inEntry || !this.entryMatches) return;
    if (this.timeDepth) addText(this.published, data);
    else if (this.titleDepth && !this.inArticle) addText(this.title, data);
    else if (this.inArticle) this.addArticleText(data);
  }

  private handleArticleStart(tag: string): void {
    if (/^h[2-6]$/.test(tag)) {
      this.headingDepth += 1;
      this.headingText = [];
    } else if (tag === "p") {
      this.paraDepth += 1;
      this.paraText = [];
    } else if (tag === "ul" || tag === "ol") {
      this.listDepth += 1;
    } else if (tag === "li") {
      this.itemDepth += 1;
      this.itemText = [];
    } else if (tag === "br") {
      this.addArticleText("\n");
    } else if (tag === "code") {
      this.addArticleMarker("`", false);
    } else if (tag === "strong" || tag === "b") {
      this.addArticleMarker("**", false);
    } else if (tag === "em" || tag === "i") {
      this.addArticleMarker("*", false);
    }
  }

  private handleArticleEnd(tag: string): void {
    if (tag === "strong" || tag === "b") this.addArticleMarker("**", true);
    else if (tag === "em" || tag === "i") this.addArticleMarker("*", true);
    else if (tag === "code") this.addArticleMarker("`", true);

    if (/^h[2-6]$/.test(tag) && this.headingDepth) {
      const heading = collapseSpace(this.headingText.join(""));
      if (heading) this.appendBlock(`## ${heading}`);
      this.headingDepth -= 1;
      this.headingText = [];
    } else if (tag === "p" && this.paraDepth) {
      const paragraph = collapseSpace(this.paraText.join(""));
      if (paragraph) this.appendBlock(paragraph);
      this.paraDepth -= 1;
      this.paraText = [];
    } else if (tag === "li" && this.itemDepth) {
      const item = collapseSpace(this.itemText.join(""));
      if (item) this.articleLines.push(`- ${item}`);
      this.itemDepth -= 1;
      this.itemText = [];
    } else if ((tag === "ul" || tag === "ol") && this.listDepth) {
      this.listDepth -= 1;
      this.appendBlank();
    }
  }

  private addArticleText(data: string): void {
    if (this.headingDepth) addText(this.headingText, data);
    else if (this.itemDepth) addText(this.itemText, data);
    else if (this.paraDepth) addText(this.paraText, data);
  }

  private addArticleMarker(marker: string, closing: boolean): void {
    if (this.headingDepth) addInlineMarker(this.headingText, marker, closing);
    else if (this.itemDepth) addInlineMarker(this.itemText, marker, closing);
    else if (this.paraDepth) addInlineMarker(this.paraText, marker, closing);
  }

  private appendBlock(text: string): void {
    this.appendBlank();
    this.articleLines.push(text);
    this.appendBlank();
  }

  private appendBlank(): void {
    if (this.articleLines.length && this.articleLines[this.articleLines.length - 1] !== "") {
      this.articleLines.push("");
    }
  }

  private tagName(rawTag: string): string {
    return rawTag.match(/^<\s*\/?\s*([a-zA-Z0-9]+)/)?.[1].toLowerCase() ?? "";
  }
}

async function fetchHtml(url: string): Promise<string> {
  const curl = spawnSync("curl", ["-fsSL", "-A", "Mozilla/5.0", url], {
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (!curl.error && curl.status === 0 && curl.stdout) return curl.stdout;

  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
  });
  if (!response.ok) {
    const curlError = curl.error ? curl.error.message : (curl.stderr || curl.stdout || "").trim();
    throw new FetchError(`Failed to fetch ${url}: HTTP ${response.status}${curlError ? `; curl said: ${curlError}` : ""}`);
  }
  return response.text();
}

async function fetchEntries(url: string, topic: string): Promise<Entry[]> {
  return new CodexChangelogParser(topic).parse(await fetchHtml(url));
}

function selectEntry(entries: Entry[], entryId: string | null): Entry {
  if (!entries.length) throw new FetchError(`No Codex app changelog entries found for topic \`${TOPIC}\`.`);
  if (!entryId) return entries[0];
  const entry = entries.find((item) => item.entryId === entryId);
  if (!entry) throw new FetchError(`No Codex app changelog entry found with id \`${entryId}\`.`);
  return entry;
}

function sourceForEntry(entryId: string): string {
  return `${BASE_SOURCE_URL}#${entryId}`;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function versionFromTitle(title: string, entryId: string): string {
  const versions = [...title.matchAll(VERSION_RE)].map((m) => m[1]);
  if (versions.length) return versions.join("-");
  if (entryId) return entryId.replace(/^codex-/, "");
  return today();
}

function markdownForEntry(entry: Entry): string {
  const version = versionFromTitle(entry.title, entry.entryId);
  const body = entry.body.trim();
  return [
    "---",
    `version: ${JSON.stringify(version)}`,
    `entry_id: ${JSON.stringify(entry.entryId)}`,
    `title: ${JSON.stringify(entry.title)}`,
    `source: ${sourceForEntry(entry.entryId)}`,
    `published: ${JSON.stringify(entry.published)}`,
    `fetched: ${today()}`,
    "language: en",
    `topic: ${TOPIC}`,
    "---",
    "",
    `# Codex App ${version}`,
    "",
    `## ${entry.title}`,
    "",
    body,
    "",
  ].join("\n");
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(expandHome(args.outputDir));
  const entry = selectEntry(await fetchEntries(args.url, TOPIC), args.entryId);
  const version = versionFromTitle(entry.title, entry.entryId);
  const markdown = markdownForEntry(entry);
  const outPath = path.join(outDir, `${version}.md`);

  if (args.json) {
    const payload: Record<string, unknown> = {
      version,
      entry_id: entry.entryId,
      title: entry.title,
      source: sourceForEntry(entry.entryId),
      published: entry.published,
      topics: entry.topics,
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

main().then(
  (code) => process.exit(code),
  (error) => {
    process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  },
);
