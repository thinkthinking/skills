#!/usr/bin/env -S npx --yes tsx

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

type Gravity = "center" | "top" | "bottom" | "left" | "right";
type Args = { input: string; output: string; width: number; height: number; gravity: Gravity };

function parseArgs(argv: string[]): Args {
  let input = "";
  let output = "";
  let width = 0;
  let height = 0;
  let gravity: Gravity = "center";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i] ?? "";
    if (arg === "--input" || arg === "-i") input = next();
    else if (arg === "--output" || arg === "-o") output = next();
    else if (arg === "--width") width = Number(next());
    else if (arg === "--height") height = Number(next());
    else if (arg === "--gravity") gravity = next() as Gravity;
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write("Usage:\n  fit_cover.ts --input SOURCE --output DEST --width PX --height PX [--gravity center|top|bottom|left|right]\n");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!input || !output) throw new Error("--input and --output are required");
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) throw new Error("--width and --height must be positive integers");
  if (!["center", "top", "bottom", "left", "right"].includes(gravity)) throw new Error(`Unsupported gravity: ${gravity}`);
  return { input: path.resolve(input), output: path.resolve(output), width, height, gravity };
}

function commandExists(command: string): boolean {
  return spawnSync("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" }).status === 0;
}

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout;
}

function assertSafe(args: Args): void {
  if (!fs.existsSync(args.input) || !fs.statSync(args.input).isFile()) throw new Error(`Input file not found: ${args.input}`);
  if (args.input === args.output) throw new Error("Refusing to overwrite the source image; use a distinct --output path");
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
}

function fitWithMagick(command: "magick" | "convert", args: Args): void {
  const gravity = { center: "center", top: "north", bottom: "south", left: "west", right: "east" }[args.gravity];
  run(command, [args.input, "-auto-orient", "-resize", `${args.width}x${args.height}^`, "-gravity", gravity, "-extent", `${args.width}x${args.height}`, args.output]);
}

function readSipsSize(filePath: string): { width: number; height: number } {
  const output = run("sips", ["-g", "pixelWidth", "-g", "pixelHeight", filePath]);
  const width = Number(output.match(/pixelWidth:\s*(\d+)/)?.[1]);
  const height = Number(output.match(/pixelHeight:\s*(\d+)/)?.[1]);
  if (!(width > 0 && height > 0)) throw new Error(`Could not read image dimensions from sips output: ${output}`);
  return { width, height };
}

function readOutputSize(filePath: string): { width: number; height: number } {
  if (commandExists("sips")) return readSipsSize(filePath);
  if (commandExists("magick")) {
    const output = run("magick", ["identify", "-format", "%w %h", filePath]).trim();
    const [width, height] = output.split(/\s+/).map(Number);
    if (width > 0 && height > 0) return { width, height };
  }
  if (commandExists("identify")) {
    const output = run("identify", ["-format", "%w %h", filePath]).trim();
    const [width, height] = output.split(/\s+/).map(Number);
    if (width > 0 && height > 0) return { width, height };
  }
  throw new Error("Could not verify output dimensions; install ImageMagick or use macOS sips");
}

function fitWithSips(args: Args): void {
  const source = readSipsSize(args.input);
  const scale = Math.max(args.width / source.width, args.height / source.height);
  const scaledWidth = Math.max(args.width, Math.ceil(source.width * scale));
  const scaledHeight = Math.max(args.height, Math.ceil(source.height * scale));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fit-cover-"));
  const tmpPath = path.join(tmpDir, `scaled${path.extname(args.output) || ".png"}`);
  try {
    run("sips", ["--resampleHeightWidth", String(scaledHeight), String(scaledWidth), args.input, "--out", tmpPath]);
    let offsetX = Math.max(0, Math.floor((scaledWidth - args.width) / 2));
    let offsetY = Math.max(0, Math.floor((scaledHeight - args.height) / 2));
    if (args.gravity === "top") offsetY = 0;
    if (args.gravity === "bottom") offsetY = Math.max(0, scaledHeight - args.height);
    if (args.gravity === "left") offsetX = 0;
    if (args.gravity === "right") offsetX = Math.max(0, scaledWidth - args.width);
    run("sips", ["--cropOffset", String(offsetY), String(offsetX), "--cropToHeightWidth", String(args.height), String(args.width), tmpPath, "--out", args.output]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

const args = parseArgs(process.argv.slice(2));
assertSafe(args);

if (commandExists("magick")) fitWithMagick("magick", args);
else if (commandExists("convert")) fitWithMagick("convert", args);
else if (commandExists("sips")) fitWithSips(args);
else throw new Error("No supported image tool found. Install ImageMagick or run on macOS with sips.");

const actual = readOutputSize(args.output);
if (actual.width !== args.width || actual.height !== args.height) throw new Error(`Output has ${actual.width}x${actual.height}; expected ${args.width}x${args.height}`);
process.stdout.write(`OUTPUT: ${args.output}\nSIZE: ${actual.width}x${actual.height}\n`);
