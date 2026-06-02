---
title: Claude Code 2.1.117 更新速读
date: 2026-04-22
likes: 0
comments: 0
collects: 0
tags:
  - ZenMuxAI
  - zenmuxai
  - ClaudeCode
  - claudecode
  - Anthropic
  - codingagent
  - vibecoding
  - codex
  - ai
  - 大模型
  - 开发者工具
notes: ""
---

Claude Code 2.1.117 发布了，一次信息密度挺高的版本更新，开发者手感和底层架构都在动。挑两个视角说一下值得关注的点。完整更新见图2。

👨‍💻 开发者视角（日常手感）

/model 选择跨重启持久化——项目固定了其他模型也不会覆盖手动选择，启动时会标注当前模型来源
/resume 大会话（40MB+）读入前会先问要不要总结，和 --resume 行为对齐
插件不再是死胡同：plugin install 对已装插件补装缺失依赖；依赖错误带「未安装」提示和自动拉取
Opus 4.6 / Sonnet 4.6 上 Pro / Max 订阅默认 effort 从 medium 提到 high
WebFetch 遇超大 HTML 不再卡死——先截断再转 markdown
Plain-CLI OAuth token 中途过期不再崩，401 时响应式刷新
输入框撤销（Ctrl+_）刚输入后立即可用，不再跳状态

🏗️ 产品视角（架构与底盘）

macOS / Linux 原生构建的搜索换了底座：Glob 和 Grep 被替换为通过 Bash 调用的内嵌 bfs 和 ugrep，少一次工具往返，搜索更快（Windows / npm 安装版不变）
Opus 4.7 的 /context 百分比终于按原生 1M 窗口计算了——此前一直按 200K 算，导致百分比虚高、过早触发自动压缩。长上下文场景直接受益
OpenTelemetry 维度更细：user_prompt 带 command_name / command_source，cost.usage / token.usage / api_request 带 effort 属性；自定义和 MCP 命令名默认脱敏，OTEL_LOG_TOOL_DETAILS=1 才展开
外部构建可通过 CLAUDE_CODE_FORK_SUBAGENT=1 启用 Forked subagents；Agent frontmatter 的 mcpServers 在主线程 --agent 里也会加载
受管设置的 blockedMarketplaces / strictKnownMarketplaces 在安装、更新、刷新、autoupdate 全路径生效
原生构建顺手修了一堆边缘 Bug：Bedrock Opus 4.7 禁 thinking 报 400、MCP elicitation/create 在 print/SDK 模式下被提前取消、Linux 空闲重渲染循环导致内存缓慢增长

如果你是 Opus 4.7 长上下文用户，这一版建议直接升——/context 误算修掉后手感会明显不一样。
