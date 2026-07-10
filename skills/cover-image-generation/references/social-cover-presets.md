# Social Cover Presets

Use the preset matching the user's publishing surface. Platform interfaces change, so treat pixel dimensions as production defaults and verify current requirements when strict upload compliance matters.

The `openai/gpt-image-2` generation sizes below use edges divisible by 16. Its supported generation ratio is 1:3 through 3:1. A delivery ratio outside that range requires a safe crop after generation.

| Preset | Common use | Ratio | GPT generation size | Delivery size | Composition note |
| --- | --- | ---: | ---: | ---: | --- |
| `portrait-3x4` | Xiaohongshu, general portrait cover | 3:4 | 1152x1536 | 1152x1536 | Default; keep headline in the upper-middle area. |
| `portrait-4x5` | Instagram portrait feed | 4:5 | 1280x1600 | 1280x1600 | Keep key content away from the outer 5%. |
| `square-1x1` | Square social post | 1:1 | 1024x1024 | 1024x1024 | Center the focal subject and allow for thumbnail reduction. |
| `story-9x16` | Stories, Reels, TikTok, Douyin | 9:16 | 1152x2048 | 1152x2048 | Reserve top and bottom UI zones; keep copy in the central 60%. |
| `landscape-16x9` | Video thumbnail, landscape cover | 16:9 | 2048x1152 | 2048x1152 | Use a strong single focal point and large readable type. |
| `youtube-channel` | YouTube channel art | 16:9 | 2560x1440 | 2560x1440 | Keep logo and text inside the centered 1546x423 all-device safe area. |
| `landscape-3x2` | Editorial or blog hero | 3:2 | 1536x1024 | 1536x1024 | Protect the center for responsive crops. |
| `banner-2x1` | General web banner | 2:1 | 1600x800 | 1600x800 | Keep text and subject within the central 80%. |
| `og-191x100` | Open Graph, LinkedIn or Facebook link post | 1.91:1 | 3056x1600 | 1200x628 | Generate exact 191:100, then downsample for delivery. |
| `x-header-3x1` | X profile header | 3:1 | 1536x512 | 1500x500 | Leave the lower-left area quiet for avatar overlap. |
| `linkedin-cover-4x1` | LinkedIn personal background | 4:1 | 1536x512 | 1600x400 | Generate at the 3:1 model limit, reserve a centered horizontal safe band, then crop vertically. |
| `wechat-cover-47x20` | WeChat article cover | 47:20 | 1504x640 | 900x383 | Keep the title and subject centered for list-view crops. |
| `facebook-cover-205x78` | Facebook page cover | 205:78 | 3280x1248 | 1640x624 | Keep key content centered; mobile and desktop crops differ. |

## Selection rules

- Let explicit dimensions override every preset.
- Let an explicit ratio override a platform default while retaining that platform's safe-area guidance.
- Use `portrait-3x4` when no ratio or platform is specified.
- For a model other than `openai/gpt-image-2`, use only sizes supported by the current `$zenmux-image-generation` documentation. Generate at the nearest supported orientation and fit to the delivery size afterward.
- When generation and delivery sizes differ, preserve the generated source and create a separate clean final file with `scripts/fit_cover.ts`.
- Append the black metadata footer only after the clean exact-ratio file exists. Preserve both outputs.
- Do not promise exact platform compliance from memory when upload rejection would be costly; verify the platform's current specification first.
