#!/usr/bin/env -S npx --yes tsx
/**
 * Append a black metadata footer bar below a generated cover image.
 *
 * Footer shows:
 *   - image model (生图模型)
 *   - prompt model (提示词模型)
 *   - generation date (生成日期)
 *
 * Pure post-process — does not re-run image generation.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

interface Args {
  inputs: string[];
  inputDir: string | null;
  output: string | null;
  imageModel: string | null;
  promptModel: string | null;
  date: string | null;
  inPlace: boolean;
  suffix: string;
}

function expandHome(value: string): string {
  if (value === "~") return process.env.HOME ?? value;
  if (value.startsWith("~/")) return path.join(process.env.HOME ?? "", value.slice(2));
  return value;
}

function todayLocalDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Infer image model id from path segments / filenames produced by zenmux-image-generation. */
function inferImageModel(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  const candidates: Array<[RegExp, string]> = [
    [/openai[-_/]?gpt[-_]?image[-_]?2/, "openai/gpt-image-2"],
    [/openai[-_/]?gpt[-_]?image[-_]?1\.5/, "openai/gpt-image-1.5"],
    [/google[-_/]?gemini[-_]?3\.1[-_]?flash[-_]?image[-_]?preview/, "google/gemini-3.1-flash-image-preview"],
    [/google[-_/]?gemini[-_]?3\.1[-_]?flash[-_]?image/, "google/gemini-3.1-flash-image"],
    [/gemini[-_]?3\.1[-_]?flash[-_]?image[-_]?preview/, "google/gemini-3.1-flash-image-preview"],
    [/gemini[-_]?3\.1[-_]?flash[-_]?image/, "google/gemini-3.1-flash-image"],
  ];
  for (const [re, model] of candidates) {
    if (re.test(normalized)) return model;
  }
  return null;
}

/** Prefer YYYY-MM-DD from zenmux filename timestamps like 20260709-144019. */
function inferDateFromPath(filePath: string): string | null {
  const base = path.basename(filePath);
  const match = base.match(/(?:^|[-_])(\d{4})(\d{2})(\d{2})(?:[-_]\d{6})?/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    inputs: [],
    inputDir: null,
    output: null,
    imageModel: null,
    promptModel: null,
    date: null,
    inPlace: true,
    suffix: "",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i] ?? "";
    if (arg === "--input" || arg === "-i") {
      const value = next();
      if (value) args.inputs.push(value);
    } else if (arg === "--input-dir") {
      args.inputDir = next();
    } else if (arg === "--output" || arg === "-o") {
      args.output = next();
      args.inPlace = false;
    } else if (arg === "--image-model") {
      args.imageModel = next();
    } else if (arg === "--prompt-model") {
      args.promptModel = next();
    } else if (arg === "--date") {
      args.date = next();
    } else if (arg === "--suffix") {
      args.suffix = next();
      args.inPlace = false;
    } else if (arg === "--in-place") {
      args.inPlace = true;
      args.output = null;
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write(`Usage:
  stamp_cover_footer.ts --input COVER.png --prompt-model <id> [--image-model <id>] [--date YYYY-MM-DD]
  stamp_cover_footer.ts --input-dir DIR --prompt-model <id> [--image-model <id>]

Append a black footer bar under each cover with image model / prompt model / date.

Options:
  --input, -i PATH       Cover PNG/JPEG/WebP (repeatable)
  --input-dir DIR        Stamp every image file under DIR (non-recursive)
  --image-model ID       e.g. openai/gpt-image-2 (inferred from path if omitted)
  --prompt-model ID      e.g. claude-opus-4-8 / grok-4.5  (required)
  --date YYYY-MM-DD      Generation date (default: today local, or filename timestamp)
  --output, -o PATH      Write to PATH (single --input only); default is in-place
  --suffix STR           Write alongside as <name><suffix>.<ext> (e.g. -footer)
  --in-place             Overwrite each input (default)
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.promptModel) {
    throw new Error(
      "--prompt-model is required (pass the current session model that wrote the image prompt, e.g. claude-opus-4-8 or grok-4.5)",
    );
  }

  return args;
}

function collectInputs(args: Args): string[] {
  const files: string[] = [];
  for (const raw of args.inputs) {
    const p = path.resolve(expandHome(raw));
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) {
      throw new Error(`input file not found: ${p}`);
    }
    files.push(p);
  }
  if (args.inputDir) {
    const dir = path.resolve(expandHome(args.inputDir));
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      throw new Error(`input dir not found: ${dir}`);
    }
    for (const name of fs.readdirSync(dir).sort()) {
      if (!/\.(png|jpe?g|webp)$/i.test(name)) continue;
      files.push(path.join(dir, name));
    }
  }
  if (files.length === 0) {
    throw new Error("provide --input and/or --input-dir with at least one image");
  }
  if (args.output && files.length !== 1) {
    throw new Error("--output can only be used with a single --input");
  }
  return files;
}

function resolveOutputPath(inputPath: string, args: Args): string {
  if (args.output) return path.resolve(expandHome(args.output));
  if (args.suffix) {
    const ext = path.extname(inputPath);
    const base = inputPath.slice(0, -ext.length);
    return `${base}${args.suffix}${ext}`;
  }
  return inputPath;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch,
  );
}

function fileUrl(filePath: string): string {
  const resolved = path.resolve(filePath);
  // Encode each path segment so spaces / non-ASCII stay valid in file:// URLs.
  const parts = resolved.split(path.sep).map((part, idx) => {
    if (idx === 0 && part === "") return "";
    // Keep Windows drive letters readable (C:).
    if (/^[A-Za-z]:$/.test(part)) return part;
    return encodeURIComponent(part);
  });
  return `file://${parts.join("/")}`;
}

function readPngSize(filePath: string): { width: number; height: number } | null {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(24);
    fs.readSync(fd, buf, 0, 24, 0);
    fs.closeSync(fd);
    if (buf.toString("ascii", 1, 4) !== "PNG") return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } catch {
    return null;
  }
}

function buildHtml(opts: {
  imagePath: string;
  imageModel: string;
  promptModel: string;
  date: string;
  width: number;
}): string {
  const footerHeight = Math.max(64, Math.round(opts.width * 0.085));
  const fontSize = Math.max(13, Math.round(opts.width * 0.0165));
  const padX = Math.max(16, Math.round(opts.width * 0.03));
  const gap = Math.max(12, Math.round(opts.width * 0.02));

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    background: #000000;
    width: ${opts.width}px;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "SF Mono", "JetBrains Mono",
      Menlo, Monaco, Consolas, "PingFang SC", "Helvetica Neue", "Segoe UI",
      "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif;
  }
  .stack {
    width: ${opts.width}px;
    display: flex;
    flex-direction: column;
  }
  .cover {
    display: block;
    width: ${opts.width}px;
    height: auto;
  }
  footer {
    width: ${opts.width}px;
    height: ${footerHeight}px;
    background: #0a0a0a;
    color: #d4d4d8;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 ${padX}px;
    gap: ${gap}px;
    border-top: 1px solid #1f1f22;
    font-size: ${fontSize}px;
    letter-spacing: 0.01em;
    -webkit-font-smoothing: antialiased;
  }
  .item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .item.center { align-items: center; text-align: center; flex: 1; }
  .item.right { align-items: flex-end; text-align: right; }
  .label {
    color: #71717a;
    font-size: ${Math.max(10, Math.round(fontSize * 0.72))}px;
    font-weight: 600;
    text-transform: none;
    letter-spacing: 0.04em;
  }
  .value {
    color: #f4f4f5;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: ${Math.floor(opts.width * 0.42)}px;
  }
  .date .value {
    font-size: ${Math.max(12, Math.round(fontSize * 0.95))}px;
    color: #a1a1aa;
  }
</style>
</head>
<body>
  <div class="stack">
    <img class="cover" src="${escapeHtml(fileUrl(opts.imagePath))}" alt="cover">
    <footer>
      <div class="item">
        <span class="label">生图模型</span>
        <span class="value">${escapeHtml(opts.imageModel)}</span>
      </div>
      <div class="item center">
        <span class="label">提示词模型</span>
        <span class="value">${escapeHtml(opts.promptModel)}</span>
      </div>
      <div class="item right date">
        <span class="label">生成日期</span>
        <span class="value">${escapeHtml(opts.date)}</span>
      </div>
    </footer>
  </div>
</body>
</html>`;
}

function stampOne(
  inputPath: string,
  outputPath: string,
  imageModel: string,
  promptModel: string,
  date: string,
): void {
  const size = readPngSize(inputPath);
  // Fallback width for non-PNG or unreadable headers — 3:4 covers are usually 1024 wide.
  const width = size?.width && size.width > 0 ? size.width : 1024;

  const html = buildHtml({
    imagePath: inputPath,
    imageModel,
    promptModel,
    date,
    width,
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stamp-cover-footer-"));
  const htmlPath = path.join(tmpDir, "stamp.html");
  // Write to a sibling temp file first when overwriting, then rename — avoids
  // reading a partially-written destination if playwright fails mid-way.
  const tmpOut = path.join(tmpDir, `out${path.extname(outputPath) || ".png"}`);
  fs.writeFileSync(htmlPath, html, "utf8");

  const proc = spawnSync(
    "npx",
    [
      "--yes",
      "playwright",
      "screenshot",
      "--browser=chromium",
      "--full-page",
      `--viewport-size=${width},100`,
      `file://${htmlPath}`,
      tmpOut,
    ],
    { encoding: "utf8", timeout: 120_000 },
  );

  if (proc.status !== 0) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const details = (proc.stderr || proc.stdout || "").trim();
    throw new Error(
      `playwright screenshot failed. Run \`npx --yes playwright install chromium\` if Chromium is missing. ${details}`,
    );
  }

  fs.copyFileSync(tmpOut, outputPath);
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  const inputs = collectInputs(args);
  const promptModel = args.promptModel!.trim();
  if (!promptModel) throw new Error("--prompt-model must be non-empty");

  for (const inputPath of inputs) {
    const imageModel =
      (args.imageModel && args.imageModel.trim()) ||
      inferImageModel(inputPath) ||
      "unknown";
    const date =
      (args.date && args.date.trim()) ||
      inferDateFromPath(inputPath) ||
      todayLocalDate();
    const outputPath = resolveOutputPath(inputPath, args);

    process.stdout.write(
      `Stamping footer: ${path.basename(inputPath)} ` +
        `[image=${imageModel} | prompt=${promptModel} | date=${date}] ` +
        `-> ${outputPath}\n`,
    );
    stampOne(inputPath, outputPath, imageModel, promptModel, date);
    process.stdout.write(`Saved: ${outputPath}\n`);
  }

  return 0;
}

try {
  process.exit(main());
} catch (error) {
  process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
}
