// 简单集成测试：路由分发到不同引擎并验证引擎标识
import { BillingRouter } from '../../billing/router'
import { PointsChargeHandler } from '../../billing/points/charge_points'
import { TokenUsageHandler } from '../../billing/token/usage_token'

class MockDb {
  query(_text: string, _params?: any[]) { return Promise.resolve({ rows: [] }) }
  connect() { return Promise.resolve() }
  end() {}
}

describe('Billing Physical Separation - Routing', () => {
  const router = new BillingRouter(new PointsChargeHandler(new MockDb() as any), new TokenUsageHandler(new MockDb() as any))

  test('route to points engine when billing_mode=points', async () => {
    const req: any = { headers: { 'x-billing-mode': 'points' }, body: {} }
    const res = await router.route(req)
    expect(res.engine_type).toBe('points')
  })

  test('route to token engine when billing_mode=token', async () => {
    const req: any = { headers: { 'x-billing-mode': 'token' }, body: {} }
    const res = await router.route(req)
    expect(res.engine_type).toBe('token')
  })
})
