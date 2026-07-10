#!/usr/bin/env -S npx --yes tsx

type Size = { width: number; height: number };
type Preset = {
  key: string;
  aliases: string[];
  ratio: [number, number];
  generation: Size;
  delivery: Size;
  safeArea: string;
};
type Args = { preset?: string; ratio?: string; model: string; json: boolean };

const PRESETS: Preset[] = [
  { key: "portrait-3x4", aliases: ["3:4", "xiaohongshu", "rednote", "xhs"], ratio: [3, 4], generation: { width: 1152, height: 1536 }, delivery: { width: 1152, height: 1536 }, safeArea: "Keep headline and focal subject inside the central 90%." },
  { key: "portrait-4x5", aliases: ["4:5", "instagram", "instagram-feed", "ig-feed"], ratio: [4, 5], generation: { width: 1280, height: 1600 }, delivery: { width: 1280, height: 1600 }, safeArea: "Keep key content away from the outer 5%." },
  { key: "square-1x1", aliases: ["1:1", "square"], ratio: [1, 1], generation: { width: 1024, height: 1024 }, delivery: { width: 1024, height: 1024 }, safeArea: "Center the focal subject and allow for thumbnail reduction." },
  { key: "story-9x16", aliases: ["9:16", "story", "reels", "tiktok", "douyin"], ratio: [9, 16], generation: { width: 1152, height: 2048 }, delivery: { width: 1152, height: 2048 }, safeArea: "Reserve top and bottom UI zones; keep copy in the central 60%." },
  { key: "landscape-16x9", aliases: ["16:9", "youtube-thumbnail", "thumbnail"], ratio: [16, 9], generation: { width: 2048, height: 1152 }, delivery: { width: 2048, height: 1152 }, safeArea: "Use one strong focal point and large readable type." },
  { key: "youtube-channel", aliases: ["youtube-channel-art", "youtube-banner"], ratio: [16, 9], generation: { width: 2560, height: 1440 }, delivery: { width: 2560, height: 1440 }, safeArea: "Keep logo and text inside the centered 1546x423 all-device safe area." },
  { key: "landscape-3x2", aliases: ["3:2", "blog-hero", "editorial-hero"], ratio: [3, 2], generation: { width: 1536, height: 1024 }, delivery: { width: 1536, height: 1024 }, safeArea: "Protect the center for responsive crops." },
  { key: "banner-2x1", aliases: ["2:1", "banner", "web-banner"], ratio: [2, 1], generation: { width: 1600, height: 800 }, delivery: { width: 1600, height: 800 }, safeArea: "Keep text and subject within the central 80%." },
  { key: "og-191x100", aliases: ["1.91:1", "og", "open-graph", "linkedin-post", "facebook-post"], ratio: [191, 100], generation: { width: 3056, height: 1600 }, delivery: { width: 1200, height: 628 }, safeArea: "Keep important content inside the central 90%." },
  { key: "x-header-3x1", aliases: ["3:1", "x-header", "twitter-header"], ratio: [3, 1], generation: { width: 1536, height: 512 }, delivery: { width: 1500, height: 500 }, safeArea: "Leave the lower-left area quiet for avatar overlap." },
  { key: "linkedin-cover-4x1", aliases: ["4:1", "linkedin-cover", "linkedin-header"], ratio: [4, 1], generation: { width: 1536, height: 512 }, delivery: { width: 1600, height: 400 }, safeArea: "Reserve a centered horizontal band; the final crop removes vertical content." },
  { key: "wechat-cover-47x20", aliases: ["47:20", "wechat-cover", "wechat-article"], ratio: [47, 20], generation: { width: 1504, height: 640 }, delivery: { width: 900, height: 383 }, safeArea: "Keep title and subject centered for list-view crops." },
  { key: "facebook-cover-205x78", aliases: ["205:78", "facebook-cover", "fb-cover"], ratio: [205, 78], generation: { width: 3280, height: 1248 }, delivery: { width: 1640, height: 624 }, safeArea: "Keep key content centered because mobile and desktop crops differ." },
];

function parseArgs(argv: string[]): Args {
  const args: Args = { model: "openai/gpt-image-2", json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i] ?? "";
    if (arg === "--preset") args.preset = next();
    else if (arg === "--ratio") args.ratio = next();
    else if (arg === "--model") args.model = next();
    else if (arg === "--json") args.json = true;
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write("Usage:\n  resolve_cover_size.ts [--preset NAME | --ratio W:H] [--model ID] [--json]\n\nDefaults to portrait-3x4 and openai/gpt-image-2.\n");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.preset && args.ratio) throw new Error("Use either --preset or --ratio, not both");
  return args;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, "-");
}

function findPreset(value: string): Preset {
  const key = normalize(value);
  const preset = PRESETS.find((item) => item.key === key || item.aliases.some((alias) => normalize(alias) === key));
  if (!preset) throw new Error(`Unknown preset ${JSON.stringify(value)}. Available: ${PRESETS.map((item) => item.key).join(", ")}`);
  return preset;
}

function parseRatio(value: string): number {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/i);
  if (!match) throw new Error(`Invalid ratio ${JSON.stringify(value)}; use W:H, for example 3:4`);
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!(width > 0 && height > 0)) throw new Error("Ratio values must be positive");
  return width / height;
}

function closestGptSize(targetRatio: number): Size {
  const constrainedRatio = Math.min(3, Math.max(1 / 3, targetRatio));
  let best: { score: number; size: Size } | null = null;
  for (let width = 256; width <= 2560; width += 16) {
    for (let height = 256; height <= 2560; height += 16) {
      const pixels = width * height;
      if (pixels < 655_360 || pixels > 8_294_400) continue;
      const ratio = width / height;
      if (ratio < 1 / 3 || ratio > 3) continue;
      const ratioError = Math.abs(Math.log(ratio / constrainedRatio));
      const scaleError = Math.abs(Math.max(width, height) - 1600) / 1600;
      const score = ratioError * 100 + scaleError;
      if (!best || score < best.score) best = { score, size: { width, height } };
    }
  }
  if (!best) throw new Error("Could not resolve a valid gpt-image-2 canvas");
  return best.size;
}

function deliveryForRatio(ratio: number): Size {
  return ratio >= 1
    ? { width: 1600, height: Math.max(1, Math.round(1600 / ratio)) }
    : { width: Math.max(1, Math.round(1600 * ratio)), height: 1600 };
}

function nearestPresetSize(ratio: number): Size {
  if (Math.abs(ratio - 1) < 0.02) return { width: 1024, height: 1024 };
  return ratio < 1 ? { width: 1024, height: 1536 } : { width: 1536, height: 1024 };
}

function sameSize(a: Size, b: Size): boolean {
  return a.width === b.width && a.height === b.height;
}

function formatSize(size: Size): string {
  return `${size.width}x${size.height}`;
}

const args = parseArgs(process.argv.slice(2));
const isGpt = /(?:^|\/)gpt-image-(?:2|1\.5)$/i.test(args.model);
let preset: Preset | null = null;
let ratioLabel: string;
let ratioValue: number;
let generation: Size;
let delivery: Size;
let safeArea: string;

if (args.ratio) {
  ratioLabel = args.ratio.replace(/\s+/g, "");
  ratioValue = parseRatio(args.ratio);
  delivery = deliveryForRatio(ratioValue);
  generation = isGpt ? closestGptSize(ratioValue) : nearestPresetSize(ratioValue);
  safeArea = ratioValue > 3 || ratioValue < 1 / 3
    ? "Keep all important content in the centered band that survives the final crop."
    : "Keep important content inside the central 90%.";
  if (Math.abs(generation.width / generation.height - ratioValue) < 0.0005) delivery = generation;
} else {
  preset = findPreset(args.preset ?? "portrait-3x4");
  ratioLabel = `${preset.ratio[0]}:${preset.ratio[1]}`;
  ratioValue = preset.ratio[0] / preset.ratio[1];
  delivery = preset.delivery;
  generation = isGpt ? preset.generation : nearestPresetSize(ratioValue);
  safeArea = preset.safeArea;
}

const result = {
  preset: preset?.key ?? "custom",
  ratio: ratioLabel,
  model: args.model,
  generation_size: formatSize(generation),
  delivery_size: formatSize(delivery),
  requires_postprocess: !sameSize(generation, delivery),
  safe_area: safeArea,
};

if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
else for (const [key, value] of Object.entries(result)) process.stdout.write(`${key}: ${value}\n`);
