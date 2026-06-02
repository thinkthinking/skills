---
title: Claude Code 2.1.126 网关也能列模型了
date: 2026-05-01
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
version: 2.1.126
---

Claude Code 2.1.126 来了。一整版主线是稳定性，但也塞了几样新东西：网关 `/v1/models` 接进 `/model` 选择器、`claude project purge` 一键清空项目状态、`--dangerously-skip-permissions` 适用范围扩大，剩下大半把 OAuth、Stream 超时、Windows 那一片硬伤一并修齐。

完整原版 ChangeLog 见图2（中文版）、图3（英文原版）。

👨‍💻 开发者视角（日常手感）

新能力：

- `ANTHROPIC_BASE_URL` 指向兼容 Anthropic 协议的网关时，`/model` 现在会列出该网关 `/v1/models` 的全部模型——ZenMux 用户直接面板里选，不用再手敲名字
- `claude project purge [path]` 一键清空项目对应的会话、任务、文件历史、配置项，支持 `--dry-run` / `-y` / `-i` / `--all`，开新分支前清理上下文很顺
- 浏览器回调够不到 localhost（WSL2 / SSH / 容器）时，`claude auth login` 现可直接把 OAuth code 粘到终端完成登录

权限与体感：

- `--dangerously-skip-permissions` 跳过范围扩到 `.claude/`、`.git/`、`.vscode/`、Shell 配置文件，灾难性删除命令仍兜底确认
- Auto 模式权限检查卡住时 spinner 会变红，不再被误以为工具仍在跑
- `Ctrl+L` 不再清空输入框，行为对齐 readline，只强制重绘屏幕

硬伤修复：

- 粘贴 >2000px 图片不再炸会话，超大图自动降采样并重试
- Mac 睡眠唤醒后的「Stream idle timeout」修了；后台与远程会话在长「思考」期间也不再被误中止

🏗️ 产品视角（架构与底盘）

- **安全：** 高优先级托管设置源缺失 `sandbox` 块时，`allowManagedDomainsOnly` / `allowManagedReadPathsOnly` 不再被静默忽略
- Windows：启用 PowerShell 工具后 PS 升为主 Shell，并且能识别 Microsoft Store / 无 PATH 的 MSI / `.NET global tool` 装的 PS7
- Windows：剪贴板写入不再把内容塞进命令行参数（不再被 EDR/SIEM 采集），同时修 >22KB 选区进不了剪贴板
- `claude_code.skill_activated` OTel 事件现也会在用户手动输入斜杠命令时触发，新增 `invocation_trigger` 区分 user-slash / claude-proactive / nested-skill
- Read 工具去掉了逐文件的恶意软件评估提示——这条之前让旧模型莫名拒读并输出「这不是恶意软件」之类的多余说明

稳定性、新能力、合规底盘三线齐推，OAuth 和 Windows 重度用户这一版直接更。

#ZenMuxAI #ClaudeCode #Anthropic #vibecoding #开发者工具 #mcp #ai #大模型 #更新日志
