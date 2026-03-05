import { BillingRequest } from '../router'

export class ProxyVendorEngine {
  async handleChargePoints(_req: BillingRequest): Promise<any> {
    // 简单占位实现，实际对接代理服务商的积分扣除逻辑
    return { ok: true, engine_type: 'points', provider: 'proxy_vendor' }
  }

  async handleTokenUsage(_req: BillingRequest): Promise<any> {
    // 代理服务商的 token 计费路径占位
    return { ok: true, engine_type: 'token', provider: 'proxy_vendor' }
  }
}
