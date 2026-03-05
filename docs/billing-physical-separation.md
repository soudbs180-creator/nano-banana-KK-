# Billing Physical Separation (Two Independent Databases)
- 目标：实现两条计费线的完全物理分离，避免混用，提升可靠性与可观测性。
- 核心原则
  - 两套计费系统分别拥有独立的数据库实例（或独立数据库）和服务实例。
  - 通过独立的数据库连接、独立的事务及寘审日志，确保两者完全隔离。
  - 路由层通过 BillingRouter 将请求按 engine_type 分发到对应引擎实现。
- 数据层设计
  - Points Engine: billing_points 数据库/schema，包含 accounts、point_transactions、point_invoices、point_logs 等表。
  - Token Engine: billing_token 数据库/schema，包含 token_accounts、token_usage、token_invoices、token_pricing、tax_rules 等表。
- 部署建议
  - 优先在 staging 环境落地物理分离，验证对账、发票、幂等、回滚等流程。
  - 生产环境使用两套数据库集群或独立实例，确保故障时互不影响。
- 迁移策略
  - 双写阶段：在切换期间，保留旧系统的路由以兼容，逐步引入新路由与写入目标。
  - 全量迁移后切换至仅两套独立路由和数据库。
- 监控与审计
  - 分别采集 Points 与 Token 的指标与错误日志，避免混淆。
- 接口演变要点
  - 外部入口保持现有 API 语义，但内部路由与数据写入走两套独立引擎。
- 下一步
  1) 提前确定两套数据库的实际部署方式（同机房的两台实例，还是两套云数据库）。
  2) 准备两套数据库的 Initial SQL 并迁移当前历史数据。 
