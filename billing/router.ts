import { PointsChargeHandler } from './points/charge_points'
export interface BillingRequest { headers: Record<string, string>; body: any; }
import { TokenUsageHandler } from './token/usage_token'
import { GoogleOfficialEngine } from './engines/google_official'
import { ProxyVendorEngine } from './engines/proxy_vendor'
import { ProviderGate } from './provider_gate'

export type BillingMode = 'points' | 'token'

export interface PointsEngineHandler {
  handleChargePoints(req: BillingRequest): Promise<any>
}

export interface TokenEngineHandler {
  handleTokenUsage(req: BillingRequest): Promise<any>
}

export class BillingRouter {
  private pointsEngine: PointsEngineHandler
  private tokenEngine: TokenEngineHandler
  private providerGate: ProviderGate

  constructor(pointsEngine: PointsEngineHandler, tokenEngine: TokenEngineHandler) {
    this.pointsEngine = pointsEngine
    this.tokenEngine = tokenEngine
    this.providerGate = new ProviderGate(
      pointsEngine as any,
      new GoogleOfficialEngine() as any,
      new ProxyVendorEngine() as any
    )
  }

  async route(req: BillingRequest): Promise<any> {
    const providerHeader = (req.headers?.['x-provider-id'] || req.headers?.['X-Provider-Id'] || (req.body && (req.body as any).provider_id))
    if (providerHeader) {
      return this.providerGate.dispatchCharge(req, providerHeader as any)
    }
    const mode = this.extractMode(req)
    if (mode === 'points') return this.pointsEngine.handleChargePoints(req)
    if (mode === 'token') return this.tokenEngine.handleTokenUsage(req)
    throw new Error('Invalid billing mode. Must be "points" or "token".')
  }

  private extractMode(req: BillingRequest): BillingMode | undefined {
    const h = req.headers || {}
    const modeHeader = h['x-billing-mode'] || h['X-Billing-Mode']
    if (modeHeader === 'points' || modeHeader === 'token') return modeHeader
    const body = req.body || {}
    if ((body as any).billing_mode === 'points' || (body as any).billing_mode === 'token') return (body as any).billing_mode
    return undefined
  }
}
