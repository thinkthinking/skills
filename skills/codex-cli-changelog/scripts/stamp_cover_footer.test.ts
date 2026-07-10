#!/usr/bin/env -S npx --yes tsx
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  assertSafeOutputs,
  collectInputs,
  parseArgs,
  resolveOutputPath,
  type Args,
} from "./stamp_cover_footer.ts";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stamp-cover-footer-test-"));

function touch(name: string): string {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, name);
  return filePath;
}

function args(overrides: Partial<Args> = {}): Args {
  return {
    inputs: [],
    inputDir: null,
    output: null,
    imageModel: null,
    promptModel: "claude-opus-4-8",
    date: null,
    suffix: "-footer",
    ...overrides,
  };
}

function sha256(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

try {
  const source = touch("cover.png");
  const derived = touch("cover-footer.png");
  const second = touch("second.webp");
  touch("notes.txt");

  const defaults = parseArgs(["--input", source, "--prompt-model", "claude-opus-4-8"]);
  assert.equal(defaults.suffix, "-footer");
  assert.equal(resolveOutputPath(source, defaults), derived);

  const directoryInputs = collectInputs(args({ inputDir: tmpDir }));
  assert.deepEqual(directoryInputs, [source, second]);

  const deduped = collectInputs(args({ inputs: [source, source], inputDir: tmpDir }));
  assert.deepEqual(deduped, [source, second]);

  assert.throws(
    () => collectInputs(args({ inputs: [derived] })),
    /already has the output suffix/,
  );
  assert.throws(
    () => parseArgs(["--input", source, "--prompt-model", "model", "--in-place"]),
    /no longer supported/,
  );

  const explicitOutput = args({ inputs: [source], output: path.join(tmpDir, "final.png") });
  assert.equal(resolveOutputPath(source, explicitOutput), path.join(tmpDir, "final.png"));
  assert.doesNotThrow(() => assertSafeOutputs([source], explicitOutput));
  assert.throws(
    () => assertSafeOutputs([source], args({ inputs: [source], output: source })),
    /refusing to overwrite source image/,
  );
  const symlinkOutput = path.join(tmpDir, "source-link.png");
  fs.symlinkSync(source, symlinkOutput);
  assert.throws(
    () => assertSafeOutputs([source], args({ inputs: [source], output: symlinkOutput })),
    /refusing to overwrite source image/,
  );
  const hardlinkOutput = path.join(tmpDir, "source-hardlink.png");
  fs.linkSync(source, hardlinkOutput);
  assert.throws(
    () => assertSafeOutputs([source], args({ inputs: [source], output: hardlinkOutput })),
    /refusing to overwrite source image/,
  );

  const extensionlessDerived = touch("poster-footer");
  assert.throws(
    () => collectInputs(args({ inputs: [extensionlessDerived] })),
    /already has the output suffix/,
  );

  const customSuffix = parseArgs([
    "--input",
    source,
    "--prompt-model",
    "model",
    "--suffix",
    "-meta",
  ]);
  assert.equal(resolveOutputPath(source, customSuffix), path.join(tmpDir, "cover-meta.png"));

  const scriptPaths = [
    path.resolve(scriptDir, "../../claudecode-cli-changelog/scripts/stamp_cover_footer.ts"),
    path.resolve(scriptDir, "stamp_cover_footer.ts"),
    path.resolve(scriptDir, "../../codex-app-changelog/scripts/stamp_cover_footer.ts"),
  ];
  assert.equal(new Set(scriptPaths.map(sha256)).size, 1, "the three footer scripts must stay identical");

  process.stdout.write("stamp_cover_footer tests passed\n");
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
