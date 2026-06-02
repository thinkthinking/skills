---
title: Claude Code 2.1.121 重点修复内存泄漏
date: 2026-04-28
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
version: 2.1.121
---

Claude Code 2.1.121 来了。一整版主线是修内功——3 个内存泄漏一并修齐，外加 Bash 工具几个边角崩溃和滚动相关补丁。同时塞了几个新东西：MCP `alwaysLoad`、`claude plugin prune`、`/skills` 筛选搜索框。

完整原版 ChangeLog 见图2（中文版）、图3（英文原版）。

👨‍💻 开发者视角（日常手感）

内存（本版主线，三处一并修齐）：

- 一次会话处理大量图片，RSS 不再无限增长
- `/usage` 在历史 transcript 多的机器上不再泄漏最多 ~2GB
- 长任务工具没发明确进度事件时的内存泄漏修了

滚动与 Bash 硬伤：

- 全屏向上滚动后，往输入框打字不再把滚动条甩回底部——你没看错，这条 bug 终于修了
- 启动目录被中途删除或移动后，Bash 工具不再永久不可用
- 超出终端高度的对话框终于能滚了，方向键 / PgUp/PgDn / 鼠标滚轮全屏非全屏都行

新功能：

- `/skills` 加了「输入即筛选」搜索框，技能列表长也能秒搜
- `claude plugin prune` 清理孤儿插件依赖；`plugin uninstall --prune` 会级联

🏗️ 产品视角（架构与底盘）

- 新增 MCP `alwaysLoad`，设为 `true` 时该 server 的所有工具跳过工具搜索延迟加载，始终可用
- `PostToolUse` 钩子可通过 `hookSpecificOutput.updatedToolOutput` 替换任意工具输出，不再仅限 MCP
- Vertex AI 支持基于 X.509 证书的 mTLS Workload Identity Federation
- MCP server 启动遇瞬时错误现在自动重试 3 次，不再直接断线

看条目数像补丁版，但「图片内存爆」「启动目录被删 Bash 就废」「滚动跳底部」这几条都是真会被反复撞上的硬伤，重度用户这版直接更。

#ZenMuxAI #ClaudeCode #Anthropic #vibecoding #开发者工具 #mcp #ai #大模型 #更新日志
