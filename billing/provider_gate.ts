import { BillingRequest } from './router'
import { PointsChargeHandler } from './points/charge_points'
import { GoogleOfficialEngine } from './engines/google_official'
import { ProxyVendorEngine } from './engines/proxy_vendor'
import { ThirdPartyEngine } from './engines/third_party'

export class ProviderGate {
  private pointsEngine: PointsChargeHandler
  private googleEngine: GoogleOfficialEngine
  private proxyVendorEngine: ProxyVendorEngine
  private thirdPartyEngines: Map<string, ThirdPartyEngine> = new Map()

  constructor(pointsEngine: PointsChargeHandler, googleEngine: GoogleOfficialEngine, proxyVendorEngine: ProxyVendorEngine) {
    this.pointsEngine = pointsEngine
    this.googleEngine = googleEngine
    this.proxyVendorEngine = proxyVendorEngine
  }

  async dispatchCharge(req: BillingRequest, providerId: string) {
    switch (providerId) {
      case 'embedded_points':
        return this.pointsEngine.handleChargePoints(req)
      case 'google_official':
        return this.googleEngine.handleChargePoints(req)
      case 'proxy_vendor':
        return this.proxyVendorEngine.handleChargePoints(req)
      default:
        let eng = this.thirdPartyEngines.get(providerId)
        if (!eng) {
          eng = new ThirdPartyEngine(providerId)
          this.thirdPartyEngines.set(providerId, eng)
        }
        return eng.handleChargePoints(req)
    }
  }
}
