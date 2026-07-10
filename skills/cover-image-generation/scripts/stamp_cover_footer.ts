#!/usr/bin/env -S npx --yes tsx

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

type Args = {
  inputs: string[];
  inputDir?: string;
  output?: string;
  imageModel: string;
  promptModel: string;
  date: string;
  suffix: string;
};

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { inputs: [], imageModel: "", promptModel: "", date: today(), suffix: "-footer" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i] ?? "";
    if (arg === "--input" || arg === "-i") args.inputs.push(next());
    else if (arg === "--input-dir") args.inputDir = next();
    else if (arg === "--output" || arg === "-o") args.output = next();
    else if (arg === "--image-model") args.imageModel = next();
    else if (arg === "--prompt-model") args.promptModel = next();
    else if (arg === "--date") args.date = next();
    else if (arg === "--suffix") args.suffix = next();
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write("Usage:\n  stamp_cover_footer.ts --input COVER.png --image-model ID --prompt-model ID [--date YYYY-MM-DD] [--output PATH]\n  stamp_cover_footer.ts --input-dir DIR --image-model ID --prompt-model ID\n");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.imageModel.trim()) throw new Error("--image-model is required");
  if (!args.promptModel.trim()) throw new Error("--prompt-model is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error("--date must use YYYY-MM-DD");
  if (!args.suffix && !args.output) throw new Error("--suffix must be non-empty unless --output is used");
  return args;
}

function collectInputs(args: Args): string[] {
  const files = new Set(args.inputs.filter(Boolean).map((value) => path.resolve(value)));
  if (args.inputDir) {
    const dir = path.resolve(args.inputDir);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`Input directory not found: ${dir}`);
    for (const name of fs.readdirSync(dir).sort()) {
      if (/\.(png|jpe?g|webp)$/i.test(name) && !name.includes(`${args.suffix}.`)) files.add(path.join(dir, name));
    }
  }
  const inputs = [...files];
  if (inputs.length === 0) throw new Error("Provide --input or --input-dir");
  for (const file of inputs) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Input file not found: ${file}`);
    const ext = path.extname(file);
    if (path.basename(file, ext).endsWith(args.suffix)) throw new Error(`Input already has footer suffix: ${file}`);
  }
  if (args.output && inputs.length !== 1) throw new Error("--output requires exactly one input");
  return inputs;
}

function outputPath(input: string, args: Args): string {
  if (args.output) return path.resolve(args.output);
  const ext = path.extname(input);
  return ext ? `${input.slice(0, -ext.length)}${args.suffix}${ext}` : `${input}${args.suffix}.png`;
}

function readWidth(file: string): number {
  const fd = fs.openSync(file, "r");
  try {
    const header = Buffer.alloc(24);
    fs.readSync(fd, header, 0, 24, 0);
    if (header.toString("ascii", 1, 4) === "PNG") return header.readUInt32BE(16);
  } finally {
    fs.closeSync(fd);
  }
  const result = spawnSync("sips", ["-g", "pixelWidth", file], { encoding: "utf8" });
  const width = Number(result.stdout.match(/pixelWidth:\s*(\d+)/)?.[1]);
  if (!(width > 0)) throw new Error(`Could not read image width: ${file}`);
  return width;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function html(input: string, width: number, args: Args): string {
  const footerHeight = Math.max(64, Math.round(width * 0.085));
  const fontSize = Math.max(13, Math.round(width * 0.0165));
  const labelSize = Math.max(10, Math.round(fontSize * 0.72));
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}html,body{width:${width}px;background:#000}body{font-family:-apple-system,BlinkMacSystemFont,"SF Mono",Menlo,"PingFang SC","Microsoft YaHei",sans-serif}.cover{display:block;width:${width}px;height:auto}footer{width:${width}px;height:${footerHeight}px;background:#0a0a0a;color:#f4f4f5;border-top:1px solid #1f1f22;display:flex;align-items:center;justify-content:space-between;padding:0 ${Math.round(width * 0.03)}px;gap:${Math.round(width * 0.02)}px;font-size:${fontSize}px}.item{display:flex;flex-direction:column;gap:2px;min-width:0}.item.center{align-items:center;text-align:center;flex:1}.item.right{align-items:flex-end;text-align:right}.label{color:#71717a;font-size:${labelSize}px;font-weight:600;letter-spacing:.04em}.value{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:${Math.floor(width * 0.42)}px}.date .value{color:#a1a1aa}
</style></head><body><img class="cover" src="${escapeHtml(pathToFileURL(input).href)}"><footer><div class="item"><span class="label">生图模型</span><span class="value">${escapeHtml(args.imageModel)}</span></div><div class="item center"><span class="label">提示词模型</span><span class="value">${escapeHtml(args.promptModel)}</span></div><div class="item right date"><span class="label">生成日期</span><span class="value">${args.date}</span></div></footer></body></html>`;
}

function stamp(input: string, output: string, args: Args): void {
  if (path.resolve(input) === path.resolve(output)) throw new Error("Refusing to overwrite source image");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const width = readWidth(input);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cover-footer-"));
  const htmlPath = path.join(tmpDir, "footer.html");
  const tmpOutput = path.join(tmpDir, `output${path.extname(output) || ".png"}`);
  try {
    fs.writeFileSync(htmlPath, html(input, width, args), "utf8");
    const result = spawnSync("npx", ["--yes", "playwright", "screenshot", "--browser=chromium", "--full-page", `--viewport-size=${width},100`, pathToFileURL(htmlPath).href, tmpOutput], { encoding: "utf8", timeout: 120_000 });
    if (result.status !== 0) throw new Error(`Playwright screenshot failed. Install Chromium with \`npx --yes playwright install chromium\`. ${(result.stderr || result.stdout).trim()}`);
    const staged = path.join(path.dirname(output), `.${path.basename(output)}.${process.pid}.tmp`);
    fs.copyFileSync(tmpOutput, staged);
    fs.renameSync(staged, output);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

const args = parseArgs(process.argv.slice(2));
for (const input of collectInputs(args)) {
  const output = outputPath(input, args);
  stamp(input, output, args);
  process.stdout.write(`SAVED: ${output}\n`);
}
