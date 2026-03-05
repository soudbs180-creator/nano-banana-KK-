import { BillingRequest } from '../router'

export class ThirdPartyEngine {
  private providerId: string
  constructor(providerId: string) {
    this.providerId = providerId
  }
  async handleChargePoints(_req: BillingRequest): Promise<any> {
    // 第三方供应商的 points 路由占位
    return { ok: true, engine_type: 'points', provider: this.providerId }
  }
  async handleTokenUsage(_req: BillingRequest): Promise<any> {
    // 第三方供应商的 token 路由占位
    return { ok: true, engine_type: 'token', provider: this.providerId }
  }
}
