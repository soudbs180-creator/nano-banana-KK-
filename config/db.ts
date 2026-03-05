// Database connection helpers for physical separation (lazy-load pg)
// 目标：避免在没有安装 pg 的环境中直接触发编译/执行错误，部署时再加载真实数据库驱动

export const pointsPool: any = (function initPointsPool() {
  try {
    // Lazy require to avoid compile-time dependency on pg
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pg = require('pg')
    return new pg.Pool({ connectionString: process.env.POINTS_DB_CONN_STRING, max: 20 })
  } catch {
    return {
      connect: async () => { throw new Error('Points DB not configured') },
      end: async () => {},
      query: async () => { throw new Error('Points DB not configured') },
    }
  }
})()

export const tokenPool: any = (function initTokenPool() {
  try {
    // Lazy require to avoid compile-time dependency on pg
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pg = require('pg')
    return new pg.Pool({ connectionString: process.env.TOKEN_DB_CONN_STRING, max: 20 })
  } catch {
    return {
      connect: async () => { throw new Error('Token DB not configured') },
      end: async () => {},
      query: async () => { throw new Error('Token DB not configured') },
    }
  }
})()

export async function shutdownDbPools() {
  try { await pointsPool?.end?.() } catch { /* ignore */ }
  try { await tokenPool?.end?.() } catch { /* ignore */ }
}
