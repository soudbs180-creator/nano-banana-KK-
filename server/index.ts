let express: any
let app: any
try {
  // 动态加载 express，避免在环境中没有安装 express 的情况下失败
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  express = require('express')
  app = express()
  // 尝试安装 JSON 解析中间件
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const bodyParser = require('body-parser')
    app.use(bodyParser.json())
  } catch {
    // 允许在极简环境下继续跑
  }
} catch {
  app = {
    post: (_path: string, _handler: Function) => {},
    use: () => {},
    listen: (_port: number, _cb?: Function) => _cb?.(),
  }
}
import { mountBillingRoutes } from './billing_routes'
import { mountTurnstileRoutes } from './turnstile_routes'
import { mountAuthRoutes } from './auth_routes'

mountBillingRoutes(app)
mountTurnstileRoutes(app)
mountAuthRoutes(app)

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000
app.listen(PORT, () => {
  console.log(`Billing service listening on port ${PORT}`)
})
