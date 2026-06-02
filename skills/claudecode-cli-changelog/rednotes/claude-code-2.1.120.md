---
title: Claude Code 2.1.120 ultrareview 进 CI
date: 2026-04-25
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
version: 2.1.120
---

Claude Code 2.1.120 来了。两条值得点名的主线：`claude ultrareview` 子命令上线，可以在 CI / 脚本里非交互式跑代码深审；以及 Windows 上不再硬性要求 Git for Windows——没装时直接用 PowerShell 顶上。

👨‍💻 开发者视角（日常手感）

命令与浮层：

- `/rewind` 等交互浮层在 `claude --resume` 启动后终于能响应键盘了
- 斜杠命令选择器输入时不再抖动，蓝色高亮只覆盖连续匹配的子串
- 自动模式的拒绝消息现在带配置文档链接
- auto 模式下 auto-compact 显示 `auto`（小写、无 token 数），不再放误导性数字

终端体感：

- 非全屏 scrollback 不再因为 resize、关对话框、长会话出现重复
- 全屏下长选择菜单不再被底部裁掉——焦点项跟随滚动
- Write 工具点「+N lines」会展开而不是折叠
- 终端把滚轮当方向键时，会提示「用 PgUp/PgDn 滚动」

VSCode：

- `/usage` 改为打开原生 Account & Usage 对话框，不再返回纯文本
- 语音听写遵循 `~/.claude/settings.json` 里的 `language` 设置

杂项：

- 已经装了桌面应用 / 建过 skills/agents 的人，相关 spinner 推荐提示就不再骚扰你
- Skills 内容里可以用 `${CLAUDE_EFFORT}` 引用当前思考预算
- 配了一堆未授权的 claude.ai 连接器时，会话启动更快了

🏗️ 产品视角（架构与底盘）

平台与 CI 入口：

- Windows：Git for Windows 不再是硬依赖——没装时 Claude Code 用 PowerShell 当 shell 工具
- 新增 `claude ultrareview [target]`：CI / 脚本里非交互式跑 `/ultrareview`，findings 打到 stdout（`--json` 出原始数据），完成 exit 0、失败 1
- 给子进程注入 `AI_AGENT` 环境变量，`gh` 能把流量归因到 Claude Code

安全与稳定性：

- 原生 macOS / Linux 构建里，`find` 在大目录树上耗尽文件描述符、把整机搞崩的问题修了
- 自动模式下含管道 + 重定向的多行命令被误判 "Dangerous rm operation" 的告警修了
- 在 stdio MCP 工具调用过程中按 Esc 会把整条 server 连接打死的回归（2.1.105 引入）修了
- `DISABLE_TELEMETRY` / `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` 终于真正抑制 API 和企业用户的用量遥测

插件市场韧性：

- `/plugin` 市场遇到不认识的 source 格式时，不再让整个 marketplace 加载失败——那条目仍展示，安装时提示更新
- `claude plugin validate` 接受 `marketplace.json` 顶层的 `$schema` / `version` / `description`，以及 `plugin.json` 顶层的 `$schema`

主线两条都很明确：Windows 装一步少了门槛，CI 多了一个非交互的 ultrareview 入口。`find` 整机崩溃这种属于硬伤，原生构建用户这版别拖。

# ZenMuxAI #ClaudeCode #Anthropic #vibecoding #开发者工具 #mcp #更新日志 #ai #大模型
