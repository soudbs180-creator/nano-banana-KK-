# .agent 文件夹

此目录用于存放 **KK Studio 项目级 AI 修改规则**，目标是让任何代理或代码助手在修改本项目时，都能优先遵循统一的工程、UI、版本与验证规范。

## 当前项目基线
- **项目版本**：`1.3.6`
- **最后更新**：`2026-03-09`
- **规则主文件**：`.agent/rules/skills/SKILL.md`

## 规则作用
- 统一 UI / 交互 / 文案风格
- 统一版本号维护方式
- 统一文档与代码同步策略
- 统一提交前验证动作

## 修改时必须同步的版本源
当项目版本发生变化时，优先同步以下文件：
- `package.json`
- `src/config/appInfo.ts`
- `README.md`
- `docs/development/session-handoff.md`
- `docs/development/progress.md`
- `payment-server/package.json`
- `payment-server/mcpClient.js`

## 修改时必须遵守的原则
1. **不要手写分散版本号**：UI 中展示版本时应优先读取统一常量。
2. **不要使用版本化绝对路径**：文档示例优先写 `<project-root>`，避免目录名与版本号绑定。
3. **不要只改代码不改文档**：涉及行为、结构、版本时必须同步说明文件。
4. **不要只改一个端**：影响前后端协议、支付、Supabase、存储时，要检查关联端。

## 推荐验证
```bash
npm run typecheck
npm run check:encoding
npm run build
```

## 说明
`SKILL.md` 是详细规则总纲；本 README 负责说明当前基线版本和“修改时必须同步什么”。
