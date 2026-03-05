// Token 引擎：处理按 tokens/费用计费逻辑，物理分离友好实现
import { BillingRequest } from '../router'
import { logBillingEvent } from '../observability'
import { tokenPool } from '../../config/db'

export class TokenUsageHandler {
  constructor(db?: any) {
    this.db = db || tokenPool
  }
  private db: any

  async handleTokenUsage(req: BillingRequest): Promise<any> {
    const body = req.body || {}
    const user_account_id = body.user_account_id
    const tokens_used = body.tokens_used
    const action_id = body.action_id || null
    const cost_usd = body.cost_usd
    const usage_id = body.usage_id || null
    const provider = (req.headers?.['x-provider-id'] || req.headers?.['X-Provider-Id'] || (body as any).provider_id) || 'unknown'

    if (!user_account_id || typeof tokens_used !== 'number' || typeof cost_usd !== 'number') {
      throw new Error('Missing required fields: user_account_id, tokens_used, cost_usd')
    }

    // Observability: log initiation
    logBillingEvent('token_usage_initiated', { provider, user_account_id, tokens_used, cost_usd, action_id, usage_id, mode: 'token' })

    const client = await (this.db as any).connect()
    try {
      await client.query('BEGIN')
      const upd = await client.query(
        `UPDATE billing_token.token_accounts SET current_balance_usd = current_balance_usd - $1, updated_at = NOW() WHERE id = $2 RETURNING current_balance_usd`,
        [cost_usd, user_account_id]
      )
      if (!upd || upd.rows.length === 0) {
        throw new Error('Token account not found')
      }
      const newBalance = upd.rows[0].current_balance_usd
      await client.query(
        `INSERT INTO billing_token.token_usage (user_account_id, tokens_used, cost_usd, action_id, timestamp, engine_type) VALUES ($1, $2, $3, $4, NOW(), 'token')`,
        [user_account_id, tokens_used, cost_usd, action_id]
      )
      await client.query('COMMIT')
      client.release()
      // Observability: log completion
      logBillingEvent('token_usage_completed', { provider, user_account_id, tokens_used, cost_usd, new_balance_usd: newBalance, usage_id, mode: 'token' })
      return {
        ok: true,
        engine_type: 'token',
        usage_id: usage_id,
        new_balance_usd: newBalance
      }
    } catch (e) {
      try { await client.query('ROLLBACK') } catch { /* ignore */ }
      client.release()
      throw e
    }
  }

  private extractId(req: any): string {
    const body = req.body || {}
    if (body.usage_id) return body.usage_id
    const h = req.headers || {}
    return h['x-token-usage-id'] || h['X-Token-Usage-Id'] || 'unknown'
  }
}
