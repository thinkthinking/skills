---
title: Claude Code 2.1.113 换原生二进制了
date: 2026-04-19
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
  - codex
  - ai
  - 大模型
  - 开发者工具
notes: ""
version: 2.1.113
hotfix: 2.1.114
---

🎯 Claude Code 2.1.113 这一轮是架构级更新。一句话：CLI 从打包的 JavaScript 换成了各平台原生二进制。紧跟的 2.1.114 是 hotfix（修复 agent teams 协作者请求工具权限时弹窗崩溃），建议一起升。

👨‍💻 开发者视角（日常手感）

1. 交互向 readline 对齐
· 多行输入 Ctrl+A / Ctrl+E 回到逻辑行首尾
· 全屏模式 Shift+↑/↓ 在选区延伸时滚动视口
· Windows Ctrl+Backspace 按单词删除
· 长 URL 换行后保留可点击（需终端支持 OSC 8）

2. 工作流更聪明
· /loop 待触发的 wakeup 按 Esc 取消
· /ultrareview 并行化启动，启动弹窗带 diffstat
· 子 agent 卡流 10 分钟明确报错，不再静默挂起

3. Remote Control 日常可用
· @-file 自动补全在移动端/Web 端可用
· 子 agent transcript 支持流式传输
· Claude Code 退出时 session 正确归档

🏗️ 产品视角（架构与安全底盘）

1. 原生二进制分发
CLI 不再是打包的 JavaScript，改为通过各平台 optional dependency 分发原生 Claude Code 二进制——启动速度、资源占用、后续功能演进空间都会明显变化。

2. 沙箱与安全加固
· sandbox.network.deniedDomains：即便 allowedDomains 通配符已放开，也能精确拦截指定域名
· Bash deny 规则能识别 env / sudo / watch / ionice / setsid 等 exec 包装
· Bash(find:*) allow 规则不再自动放行 find -exec / -delete
· macOS 下 /private/{etc,var,tmp,home} 被视为 rm 高危目标
· dangerouslyDisableSandbox 绕过权限提示的漏洞修复

💡 一句话：这次把 Coding Agent 从「能用」推向「可以当主力托付」，稳定性与安全是底色。

🚀 在 ZenMuxAI 订阅制里用 Claude Code 的同学可直接升到 2.1.114，服务端已同步兼容。
