---
title: Claude Code 2.1.119 设置终于存硬盘了
date: 2026-04-24
likes: 0
comments: 0
collects: 0
tags:
  - ZenMuxAI
  - zenmuxai
  - ClaudeCode
  - claudecode
  - Anthropic
  - vibecoding
  - 开发者工具
  - mcp
  - ai
  - 大模型
  - 更新日志
notes: ""
version: 2.1.119
---

Claude Code 2.1.119 来了。几乎一整版都是 bug 修复和体感打磨，但有两条值得单独点名：`/config` 设置终于落盘了，以及对自建代码审阅平台（GitLab / Bitbucket / GHE）的支持一次性补齐。

👨‍💻 开发者视角（日常手感）

配置与输入：

- `/config` 里调的 theme、editor mode、verbose 等现在会持久化到 `~/.claude/settings.json`，并且遵循 project / local / policy 的覆盖顺序
- verbose 输出设置重启后不丢了
- 新增 `CLAUDE_CODE_HIDE_CWD`，启动 logo 里不再暴露工作目录
- Vim INSERT 态按 Esc，不会再把队列里的消息拉回输入框；再按一次才中断

粘贴与滚动：

- 粘贴 CRLF 内容（Windows 剪贴板、Xcode 控制台）不再每行多插一个空行
- kitty 键盘协议终端下多行粘贴不再丢换行
- 全屏模式下向上滚动，不再每次工具结束就被甩回底部

命令与 UI：

- 斜杠命令建议会高亮匹配到的字符，长描述换行而不是截断
- `/usage` 进度条不再和 "Resets …" 标签叠在一起
- `/skills` 按 Enter 现在会把 `/<skill-name>` 预填到 prompt，而不是直接关掉对话框
- `/export` 显示的是会话实际使用的模型，不再是当前默认值
- `owner/repo#N` 简写会跟随你 git remote 的 host，不再一律跳 github.com

🏗️ 产品视角（架构与底盘）

自建平台友好化：

- `--from-pr` 现在吃 GitLab merge-request、Bitbucket pull-request 和 GitHub Enterprise 的 PR 链接
- 新增 `prUrlTemplate` 设置，页脚的 PR 徽章可以指向你内部的代码审阅地址

权限与 agent 一致性：

- `--print` 模式现在会读取 agent 的 `tools:` 和 `disallowedTools:` frontmatter，和交互模式行为对齐
- `--agent <name>` 会尊重内置 agent 定义里的 `permissionMode`
- PowerShell 工具命令现可在权限模式下自动批准，和 Bash 打平

Hooks 与 MCP：

- `PostToolUse` / `PostToolUseFailure` 的 hook 输入加了 `duration_ms`，只算工具执行时间，不含权限提示和 PreToolUse
- 子代理和 SDK MCP 服务器重配时，现在并行连接而不是串行

可观测性：

- OpenTelemetry 的 `tool_result` / `tool_decision` 事件加了 `tool_use_id`；`tool_result` 还带上了 `tool_input_size_bytes`
- 状态栏 stdin JSON 多出 `effort.level` 和 `thinking.enabled`
- Vertex AI 默认关闭 Tool search，需要可通过 `ENABLE_TOOL_SEARCH` 开回来

整版几十个修复里，最能直接改善日常手感的就是配置持久化和粘贴/滚动那几条，企业化用户则是自建平台三连最香。

# ZenMuxAI #ClaudeCode #Anthropic #vibecoding #开发者工具 #mcp #更新日志 #ai #大模型
