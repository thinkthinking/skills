---
title: Claude Code 2.1.128 Worktree 不再吃掉本地未推送提交
date: 2026-05-05
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
version: 2.1.128
---

Claude Code 2.1.128 来了。没有大新能力，但修了一堆活雷区——Worktree 吃本地提交、并行 shell 一条失败拖死同批兄弟、子代理跑空也烧 token、1M 模型被假性挡在「Prompt is too long」之外。

完整原版 ChangeLog 见图2（中文版）、图3（英文原版）。

👨‍💻 开发者视角（日常手感）

- `EnterWorktree` 现在按文档说明从本地 HEAD 切新分支，不再从 `origin/<default-branch>`——本地未推送的提交不会再被悄悄丢掉
- 并行 shell 调用里，一条只读命令（`grep` / `git diff` / `ls`）失败不再连带取消同批次的兄弟调用
- 1M 上下文模型用更小自动压缩窗口时，不再没到 API 上限就被「Prompt is too long」误挡
- 通过 stdin 给 `claude -p` 灌 >10 MB 内容不再崩溃循环
- vim NORMAL 下的 `Space` 现在向右移光标，对齐原生 vi/vim
- `/mcp` 显示已连服务器工具数并标出「连上但 0 工具」的；`--plugin-dir` 也认 `.zip` 归档

🏗️ 产品视角（架构与底盘）

- **OTEL 隔离：** 子进程（Bash / hooks / MCP / LSP）不再继承 `OTEL_*`，被 Bash 跑起来的 OTEL 应用不会再误连到 CLI 自己的 OTLP 端点
- **MCP 收敛：** `workspace` 成保留服务器名；重连时不再把完整工具清单刷进会话，按服务器前缀汇总
- **子代理省钱：** 进度摘要命中 prompt cache（`cache_creation` 约降 3×），且 transcript 没变化时不再反复触发，封顶空闲子代理 token 成本
- **SDK 权限持久化：** Bash「Always allow」现在通过 SDK 写入 `.claude/settings.local.json`

bug 修干净的一版，Worktree、并行工具、1M 上下文重度用户优先更。

#ZenMuxAI #ClaudeCode #Anthropic #vibecoding #开发者工具 #mcp #ai #大模型 #更新日志
