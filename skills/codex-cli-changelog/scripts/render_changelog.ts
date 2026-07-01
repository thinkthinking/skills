#!/usr/bin/env -S npx --yes tsx
/**
 * Render a Codex CLI changelog markdown file to a PNG image.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";

const SKILL_NAME = "codex-cli-changelog";

const CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
    background: #111316;
    color: #f4f4f5;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC",
        "Helvetica Neue", "Segoe UI", "Noto Sans CJK SC",
        "Source Han Sans SC", "Microsoft YaHei", sans-serif;
    font-size: 26px;
    line-height: 1.65;
    -webkit-font-smoothing: antialiased;
}
main { padding: 80px 88px 88px 88px; }
h1 {
    font-size: 78px;
    font-weight: 800;
    line-height: 1.1;
    margin: 0 0 44px 0;
    color: #ffffff;
}
h2 {
    font-size: 44px;
    font-weight: 700;
    margin: 40px 0 20px 0;
    color: #ffffff;
}
h3 {
    font-size: 32px;
    font-weight: 700;
    margin: 32px 0 16px 0;
    color: #ffffff;
}
p { margin: 0 0 18px 0; }
ul, ol { margin: 0; padding-left: 36px; }
li { margin-bottom: 14px; line-height: 1.6; }
li::marker { color: #8b949e; }
code {
    background: #262a30;
    color: #f4f4f5;
    border-radius: 6px;
    padding: 2px 9px;
    font-family: "SF Mono", "JetBrains Mono", Menlo, Monaco, Consolas,
        "Liberation Mono", monospace;
    font-size: 0.86em;
    font-weight: 500;
    white-space: nowrap;
}
pre {
    background: #0a0c0f;
    border-radius: 10px;
    padding: 20px 24px;
    overflow-x: auto;
    margin: 0 0 24px 0;
}
pre code { background: transparent; padding: 0; font-size: 0.82em; white-space: pre; }
a { color: #9ad0ff; text-decoration: none; }
strong { font-weight: 700; color: #ffffff; }
em { font-style: italic; color: #e4e4e7; }
blockquote {
    border-left: 3px solid #52525b;
    margin: 16px 0;
    padding: 4px 0 4px 20px;
    color: #d4d4d8;
}
hr { border: none; border-top: 1px solid #27272a; margin: 32px 0; }
`;

interface Args {
  input: string;
  output: string | null;
  width: number;
  scale: number;
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

function defaultRuntimeDir(): string {
  return path.join(projectRoot(), ".context", SKILL_NAME);
}

function defaultOutDir(): string {
  return path.join(defaultRuntimeDir(), "assets", "rendered");
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
  const args: Args = { input: "", output: null, width: 1600, scale: 2 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--input") args.input = argv[++i] ?? "";
    else if (arg === "--output") args.output = argv[++i] ?? null;
    else if (arg === "--width") args.width = Number.parseInt(argv[++i] ?? "1600", 10);
    else if (arg === "--scale") args.scale = Number.parseInt(argv[++i] ?? "2", 10);
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write("Usage: render_changelog.ts --input FILE [--output PNG] [--width PX] [--scale N]\n");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.input) throw new Error("--input is required");
  return args;
}

function expandHome(value: string): string {
  if (value === "~") return process.env.HOME ?? value;
  if (value.startsWith("~/")) return path.join(process.env.HOME ?? "", value.slice(2));
  return value;
}

function stripFrontmatter(text: string): string {
  const stripped = text.trimStart();
  if (!stripped.startsWith("---")) return text;
  const end = stripped.indexOf("\n---", 3);
  if (end === -1) return text;
  return stripped.slice(end + 4).trimStart();
}

function extractTitleAndBody(text: string): [string, string] {
  const body: string[] = [];
  let title = "";
  let titleTaken = false;
  for (const line of text.split(/\r?\n/)) {
    if (!titleTaken) {
      const match = line.match(/^\s*#\s+(.+?)\s*$/);
      if (match) {
        title = match[1].replace(/[（(]\s*中文版\s*[）)]/g, "").trim();
        titleTaken = true;
        continue;
      }
    }
    body.push(line);
  }
  return [title, body.join("\n").trim()];
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}

function renderHtml(title: string, bodyHtml: string): string {
  const safeTitle = escapeHtml(title);
  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>${safeTitle}</h1>
${bodyHtml}
</main>
</body>
</html>`;
}

function formatInline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return out;
}

function markdownToHtml(markdown: string): string {
  const html: string[] = [];
  let inList = false;
  let inCode = false;
  const codeLines: string[] = [];
  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines.length = 0;
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(raw);
      continue;
    }
    if (!line.trim()) {
      closeList();
      continue;
    }
    const heading = line.match(/^(#{2,6})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${formatInline(heading[2].trim())}</h${level}>`);
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${formatInline(bullet[1])}</li>`);
      continue;
    }
    closeList();
    html.push(`<p>${formatInline(line.trim())}</p>`);
  }
  closeList();
  if (inCode) html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  return html.join("\n");
}

function renderToPng(htmlText: string, outPath: string, width: number, scale: number): void {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-cli-changelog-"));
  const htmlPath = path.join(tmpDir, "render.html");
  fs.writeFileSync(htmlPath, htmlText, "utf8");
  const proc = spawnSync(
    "npx",
    [
      "--yes",
      "playwright",
      "screenshot",
      "--browser=chromium",
      "--full-page",
      `--viewport-size=${width},1200`,
      `file://${htmlPath}`,
      outPath,
    ],
    { encoding: "utf8", timeout: 120_000 },
  );
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (proc.status !== 0) {
    const details = (proc.stderr || proc.stdout || "").trim();
    throw new Error(`playwright screenshot failed. Run \`npx --yes playwright install chromium\` if Chromium is missing. ${details}`);
  }
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const inPath = path.resolve(expandHome(args.input));
  if (!fs.existsSync(inPath)) throw new Error(`input file not found: ${inPath}`);

  const text = stripFrontmatter(fs.readFileSync(inPath, "utf8"));
  let [title, bodyMd] = extractTitleAndBody(text);
  if (!title) title = path.basename(inPath, path.extname(inPath));
  const bodyHtml = markdownToHtml(bodyMd);
  const outPath = args.output
    ? path.resolve(expandHome(args.output))
    : path.join(defaultOutDir(), `${path.basename(inPath, path.extname(inPath))}.png`);

  if (isInside(outPath, defaultRuntimeDir())) ensureRuntimeGitignore();
  process.stdout.write(`Rendering: ${path.basename(inPath)} -> ${outPath}\n`);
  renderToPng(renderHtml(title, bodyHtml), outPath, args.width, args.scale);
  process.stdout.write(`Saved: ${outPath}\n`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  },
);
