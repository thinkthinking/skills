# Skills

> A personal collection of [Agent Skills](https://skills.sh) — reusable, install-on-demand capabilities for AI coding agents.

This repo grows over time. Each skill is self-contained under [`skills/`](./skills), documented by its own `SKILL.md`, and installable individually or all at once.

## Quick start

Install every skill in this repo:

```bash
npx skills add thinkthinking/skills
```

Or install a single skill:

```bash
npx skills add thinkthinking/skills --skill claudecode-cli-changelog
```

Once installed, just describe the task to your agent — each skill triggers on its own keywords.

## Skills

### Changelog

End-to-end pipelines that track an AI coding tool's releases: fetch the latest entry → archive it bilingually (EN + 精炼中文) → render dark-themed PNG cards → optionally draft a Xiaohongshu/rednote post with a 3:4 cover.

| Skill | Tracks | Source |
| --- | --- | --- |
| [`claudecode-cli-changelog`](./skills/claudecode-cli-changelog/SKILL.md) | Claude Code | Anthropic `CHANGELOG.md` |
| [`codex-cli-changelog`](./skills/codex-cli-changelog/SKILL.md) | OpenAI Codex CLI | `openai/codex` GitHub Releases |
| [`codex-app-changelog`](./skills/codex-app-changelog/SKILL.md) | OpenAI Codex App | OpenAI Developers Changelog |

See each `SKILL.md` for the full workflow, flags, and output layout.

> The optional cover-image step depends on the separate `zenmux-image-generation` skill:
> `npx skills add ZenMux/skills --skill zenmux-image-generation`

### Writing

Human-led writing workflows that keep the author in charge while the agent acts
as a conversational editor, mirror, challenger, and memory-bearing collaborator.

| Skill | Use case |
| --- | --- |
| [`vibe-writing`](./skills/vibe-writing/SKILL.md) | Human-led AI co-writing with user-level memory, MBTI cold-start, mirror-persona feedback, and project-local outputs under `results/vibe-writing` |

## License

[MIT](./LICENSE)
