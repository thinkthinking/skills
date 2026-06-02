---
title: Claude Code 2.1.118 vim 视觉模式来了
date: 2026-04-23
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
version: 2.1.118
---

Claude Code 2.1.118 来了。这次一半是开发者可见的新能力——vim 视觉模式上线、/cost 和 /stats 合并进 /usage、自定义主题——另一半是对 MCP OAuth 的一次彻底加固。

👨‍💻 开发者视角（日常手感）

编辑体验：
- 新增 vim 视觉模式 `v` 和视觉行模式 `V`，支持选区、operator 与视觉反馈
- Alt+K / Alt+X / Alt+^ / Alt+_ 不再冻结键盘输入
- 粘贴以 `/` 开头的文件路径，typeahead 不再报 "No commands match"

命令与主题：
- /cost 和 /stats 合并为 /usage，两个老入口保留为输入快捷方式，分别打开对应标签页
- /theme 支持创建并切换命名主题，也能手编 ~/.claude/themes/ 下的 JSON；插件可通过 themes/ 目录附带主题
- Remote Control 连接时 /color 会把会话强调色同步到 claude.ai/code

工程侧修复：
- /fork 不再为每个 fork 全量复制父会话到磁盘，改为写指针、读取时再水合
- --continue / --resume 现在能找到通过 /add-dir 关联当前目录的会话
- 连接远程会话不再覆盖本地 settings.json 里的 model 设置

🏗️ 产品视角（架构与底盘）

Hooks × MCP：
- Hooks 现可通过 `type: "mcp_tool"` 直接调用 MCP 工具，不必再走 shell 中转

更新与策略：
- 新增 DISABLE_UPDATES，连手动 `claude update` 也一并封死，比 DISABLE_AUTOUPDATER 更严格
- Windows 的 WSL 现可通过 wslInheritsWindowsSettings 继承 Windows 端的托管设置
- Auto mode：autoMode.allow / soft_deny / environment 里写 "$defaults"，即可在内置规则之外追加自定义，而不是整体覆盖

MCP OAuth 加固（本版重点之一）：
- macOS 钥匙串竞态：并发 token 刷新互相覆盖，会莫名其妙跳 "Please run /login"
- 服务器返回不带 expires_in → 过去每小时都要重认证，这次修了
- insufficient_scope 403 过去是静默刷新，改为重新请求同意
- 跨进程锁在高并发下失效的问题修了
- Linux/Windows 下凭证保存崩溃损坏 .credentials.json 的问题修了
- OAuth 流程超时/取消时的未处理 promise rejection 也修了

功能亮点 + 底层加固各占一半。MCP 重度用户这一版尤其建议更。
