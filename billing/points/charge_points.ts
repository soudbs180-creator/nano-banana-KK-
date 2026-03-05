// Points 引擎：处理内置积分扣除逻辑，物理分离友好实现
import { BillingRequest } from '../router'
import { logBillingEvent } from '../observability'
import { pointsPool } from '../../config/db'

export class PointsChargeHandler {
  constructor(db?: any) {
    // 物理分离：默认使用独立的连接池 pointsPool
    this.db = db || pointsPool
  }
  private db: any

  async handleChargePoints(req: BillingRequest): Promise<any> {
    const body = req.body || {}
    const provider = (req.headers?.['x-provider-id'] || req.headers?.['X-Provider-Id'] || (body as any).provider_id) || 'unknown'
    const idempotentKey = this.extractIdempotentKey(req)
    const account_id = body.account_id
    const amount_points = body.amount_points
    const action = body.action || 'points_deduction'
    const reference_id = body.reference_id || null

    if (!account_id || typeof amount_points !== 'number') {
      throw new Error('Missing required fields: account_id and numeric amount_points')
    }

    let newBalance: any = null
    const client = await (this.db as any).connect()
    try {
      // Observability: log initiation
      logBillingEvent('points_charge_initiated', { provider, account_id, amount_points, idempotentKey, mode: 'points' })
      await client.query('BEGIN')
      const upd = await client.query(
        `UPDATE billing_points.points_accounts SET balance_points = balance_points + $1, updated_at = NOW() WHERE id = $2 RETURNING balance_points`,
        [amount_points, account_id]
      )
      if (!upd || upd.rows.length === 0) {
        throw new Error('Points account not found')
      }
      newBalance = upd.rows[0].balance_points
      await client.query(
        `INSERT INTO billing_points.points_transactions (account_id, amount_points, reason, reference_id, timestamp, engine_type) VALUES ($1, $2, $3, $4, NOW(), 'points')`,
        [account_id, amount_points, action, reference_id]
      )
      await client.query('COMMIT')
      logBillingEvent('points_charge_completed', { provider, account_id, amount_points, new_balance_points: newBalance, mode: 'points' })
      client.release()
    } catch (e) {
      try { await client.query('ROLLBACK') } catch { /* ignore */ }
      client.release()
      throw e
    }
    return {
      ok: true,
      engine_type: 'points',
      id: idempotentKey,
      new_balance_points: newBalance,
    }
  }

  private extractIdempotentKey(req: BillingRequest): string {
    const body = req.body || {}
    if (body.points_request_id) return body.points_request_id
    const h = req.headers || {}
    return h['x-points-request-id'] || h['X-Points-Request-Id'] || 'unknown'
  }
}
