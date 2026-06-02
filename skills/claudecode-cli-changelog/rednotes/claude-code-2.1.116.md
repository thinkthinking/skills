---
title: Claude Code 2.1.116 大会话不卡了
date: 2026-04-21
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
  - CLI
  - ai
  - 大模型
  - 更新日志
notes: ""
---

Claude Code 2.1.116 更新，主线是性能和终端体验。大会话 /resume 最高快 67%，MCP 启动更快，Kitty 键盘协议里一批老 bug 这次修齐了。

👨‍💻 开发者视角（日常手感）

终端/键位修复：
- Kitty 协议下 Ctrl+- 撤销终于生效（iTerm2、Ghostty、kitty、WezTerm、Windows Terminal 全中）
- Warp 全屏、kitty、Ghostty、WezTerm 里 Cmd+Left/Right 恢复跳行首/行尾
- 通过 npx、bun run 等包装进程启动时 Ctrl+Z 不再卡死
- VS Code 集成终端滚动时不再出现空白单元和 composer 边框消失
- inline 模式下 scrollback 重复会话历史的问题修了

workflow UX：
- 思考 spinner 直接内联显示进度（still thinking → thinking more → almost done thinking），少占一行
- /doctor 不用等当前轮次结束就能打开
- /config 搜索现在匹配选项值——搜 vim 就能找到 Editor mode
- 斜杠命令菜单空匹配时显示 "No commands match"，不再整体消失

🏗️ 产品视角（架构与底盘）

性能：
- 大会话 /resume 提速 67%（40MB+ 场景），含大量 dead-fork 条目的会话处理更高效
- 多 stdio MCP 服务启动更快，resources/templates/list 延迟到首次 @ 引用再加载
- /terminal-setup 现会自动配置 VS Code / Cursor / Windsurf 的编辑器滚动灵敏度

安全：
- 沙箱自动放行不再绕过 /、$HOME 等关键目录的 rm/rmdir 危险路径校验
- Bash 工具在 gh 触发 GitHub 限流时给提示，让 agent 退避而不是反复重试

可观测性：
- Usage 标签页立即显示 5h + 每周用量，接口限流时不再整体失败

这一版没有大功能，但每一条修复都是每天会遇到的痛点，值得更。
