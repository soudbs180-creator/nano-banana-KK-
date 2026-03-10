# KK Studio Project Handoff (v1.3.6)

## 1. 项目概览
- **项目名称**：KK Studio
- **当前稳定版本**：`v1.3.6`
- **当前状态**：可构建、可类型检查、文档版本口径已统一
- **定位**：面向图像/多模态创作的可视化 AI 工作台，核心交互为无限画布 + Prompt/Card 编排

## 2. 当前版本重点
- **版本统一**：主应用、前端展示、README、开发文档、`.agent` 规则与支付子服务版本已同步到 `1.3.6`
- **画布版本展示收口**：版本标识改为统一常量管理，避免 `v1.3.5 / v1.3.6` 混用
- **设置模块稳定化**：设置面板恢复到可维护状态，并对重型子面板增加懒加载
- **编码与可维护性**：新增/扩展乱码巡检，修复关键日志乱码，降低后续改动污染风险
- **打包组织优化**：对设置模块、体验面板、图标相关依赖做更细的分块处理

## 3. 当前架构
- **Frontend**：React 19 + TypeScript 5.8 + Vite 6 + Tailwind CSS 4
- **State**：React Context + localStorage / IndexedDB / File System Access API
- **Storage**：浏览器存储为默认方案，本地文件夹存储用于双层保护与恢复
- **Backend / Data**：Supabase（Auth / Database / Edge Functions）+ Vercel / Netlify 部署
- **Payment Sidecar**：`payment-server/` 独立维护支付与 MCP 相关能力

## 4. 当前版本的事实基线
- 版本源建议以 `package.json` 和 `src/config/appInfo.ts` 为准
- 文档基线建议以 `README.md`、`docs/development/progress.md`、本文件为准
- 修改规则基线建议以 `.agent/README.md` 与 `.agent/rules/skills/SKILL.md` 为准

## 5. 建议优先检查项
- **部署侧**：继续验证 Vercel 白屏问题是否已彻底消除
- **体积侧**：`@lobehub/icons` 相关 chunk 仍偏大，可继续做按需裁剪
- **数据库侧**：继续收敛 Supabase 表结构与权限策略，避免重复表/重复字段
- **移动端侧**：继续检查模型选择、参数面板、长文本输入在小屏上的边界表现

## 6. 推荐验证命令
```bash
npm run typecheck
npm run check:encoding
npm run build
```

## 7. 交接备注
- 文档中旧版 `V1.1.0 / V1.2.x / V1.3.1 / V1.3.5` 的“当前版本”定位已改为 `v1.3.6`
- 历史更新日志仍保留在 README 中用于追溯，但不再作为当前基线说明
- 路径示例优先使用 `<project-root>`，避免目录名再次与版本号耦合
