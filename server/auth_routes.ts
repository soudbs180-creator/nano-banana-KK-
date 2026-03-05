/**
 * 轻量级用户认证路由
 * 防护：Turnstile + 简单频率限制 + 邮箱黑名单
 */

import { verifyTurnstileToken } from './turnstile_routes'

// 简单的内存频率限制（生产环境建议用 Redis）
const ipAttempts = new Map<string, { count: number; resetTime: number }>()
const emailAttempts = new Map<string, { count: number; resetTime: number }>()

// 垃圾邮箱域名黑名单（常见临时邮箱）
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'tempmail.com', '10minutemail.com', 'guerrillamail.com',
  'mailinator.com', 'yopmail.com', 'throwawaymail.com',
  'temp-mail.org', 'fake-email.net', 'sharklasers.com',
  'getairmail.com', 'burnermail.io', 'tempail.com',
  'gmail.cn', 'qq.com.cn',  // 常见伪造域名
])

// 频率限制配置（宽松）
const RATE_LIMIT = {
  ip: { max: 10, window: 60 * 60 * 1000 },      // 每小时 10 次
  email: { max: 3, window: 60 * 60 * 1000 },    // 每小时 3 次/邮箱
}

interface RegisterData {
  email: string
  password: string
  turnstileToken: string
}

/**
 * 检查频率限制
 */
function checkRateLimit(store: Map<string, { count: number; resetTime: number }>, key: string, limit: { max: number; window: number }): boolean {
  const now = Date.now()
  const record = store.get(key)

  if (!record || now > record.resetTime) {
    store.set(key, { count: 1, resetTime: now + limit.window })
    return true
  }

  if (record.count >= limit.max) {
    return false
  }

  record.count++
  return true
}

/**
 * 验证邮箱格式和域名
 */
function validateEmail(email: string): { valid: boolean; error?: string } {
  // 基础格式验证
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return { valid: false, error: '邮箱格式不正确' }
  }

  // 检查是否为临时邮箱
  const domain = email.split('@')[1].toLowerCase()
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return { valid: false, error: '请使用真实邮箱地址' }
  }

  return { valid: true }
}

/**
 * 挂载认证路由
 */
export function mountAuthRoutes(app: any) {
  // ========== 注册 ==========
  app.post('/api/auth/register', async (req: any, res: any) => {
    const { email, password, turnstileToken }: RegisterData = req.body
    const ip = req.ip || req.connection?.remoteAddress || 'unknown'

    // 1. 基础参数检查
    if (!email || !password || !turnstileToken) {
      return res.status(400).json({
        success: false,
        error: '请填写完整信息',
      })
    }

    // 2. 邮箱验证
    const emailCheck = validateEmail(email)
    if (!emailCheck.valid) {
      return res.status(400).json({
        success: false,
        error: emailCheck.error,
      })
    }

    // 3. Turnstile 人机验证
    const turnstileResult = await verifyTurnstileToken(turnstileToken, ip)
    if (!turnstileResult.success) {
      return res.status(403).json({
        success: false,
        error: turnstileResult.error || '人机验证失败',
      })
    }

    // 4. IP 频率限制（宽松）
    if (!checkRateLimit(ipAttempts, ip, RATE_LIMIT.ip)) {
      return res.status(429).json({
        success: false,
        error: '操作太频繁，请稍后再试',
      })
    }

    // 5. 邮箱频率限制
    if (!checkRateLimit(emailAttempts, email.toLowerCase(), RATE_LIMIT.email)) {
      return res.status(429).json({
        success: false,
        error: '该邮箱尝试次数过多，请稍后再试',
      })
    }

    try {
      // 6. 检查邮箱是否已存在（这里接你的数据库）
      // const existingUser = await db.users.findOne({ email })
      // if (existingUser) {
      //   return res.status(409).json({
      //     success: false,
      //     error: '该邮箱已注册',
      //   })
      // }

      // 7. 创建用户（接你的用户系统）
      // const hashedPassword = await bcrypt.hash(password, 10)
      // const user = await db.users.create({
      //   email: email.toLowerCase(),
      //   password: hashedPassword,
      //   createdAt: new Date(),
      // })

      console.log(`[注册成功] ${email} from ${ip}`)

      res.json({
        success: true,
        message: '注册成功',
        // token: generateJWT(user),
      })
    } catch (err) {
      console.error('[注册错误]', err)
      res.status(500).json({
        success: false,
        error: '服务器错误',
      })
    }
  })

  // ========== 登录 ==========
  app.post('/api/auth/login', async (req: any, res: any) => {
    const { email, password, turnstileToken } = req.body
    const ip = req.ip || req.connection?.remoteAddress || 'unknown'

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: '请填写邮箱和密码',
      })
    }

    // 登录也需要 Turnstile（防止暴力破解）
    if (turnstileToken) {
      const turnstileResult = await verifyTurnstileToken(turnstileToken, ip)
      if (!turnstileResult.success) {
        return res.status(403).json({
          success: false,
          error: '人机验证失败',
        })
      }
    }

    // 简单的登录频率限制
    if (!checkRateLimit(ipAttempts, `login:${ip}`, { max: 20, window: 60 * 60 * 1000 })) {
      return res.status(429).json({
        success: false,
        error: '登录尝试过多，请稍后再试',
      })
    }

    try {
      // 验证用户（接你的数据库）
      // const user = await db.users.findOne({ email: email.toLowerCase() })
      // if (!user || !(await bcrypt.compare(password, user.password))) {
      //   return res.status(401).json({
      //     success: false,
      //     error: '邮箱或密码错误',
      //   })
      // }

      console.log(`[登录成功] ${email} from ${ip}`)

      res.json({
        success: true,
        message: '登录成功',
        // token: generateJWT(user),
      })
    } catch (err) {
      console.error('[登录错误]', err)
      res.status(500).json({
        success: false,
        error: '服务器错误',
      })
    }
  })

  // ========== 发送验证码（可选）==========
  app.post('/api/auth/send-code', async (req: any, res: any) => {
    const { email, turnstileToken } = req.body
    const ip = req.ip || req.connection?.remoteAddress || 'unknown'

    if (!email || !turnstileToken) {
      return res.status(400).json({
        success: false,
        error: '参数不完整',
      })
    }

    // 验证 Turnstile
    const turnstileResult = await verifyTurnstileToken(turnstileToken, ip)
    if (!turnstileResult.success) {
      return res.status(403).json({
        success: false,
        error: '验证失败',
      })
    }

    // 严格限制发送频率
    if (!checkRateLimit(emailAttempts, `code:${email.toLowerCase()}`, { max: 3, window: 60 * 60 * 1000 })) {
      return res.status(429).json({
        success: false,
        error: '验证码发送次数已达上限，请稍后再试',
      })
    }

    // 发送验证码逻辑...
    console.log(`[发送验证码] ${email}`)

    res.json({
      success: true,
      message: '验证码已发送',
    })
  })

  console.log('[Auth] 认证路由已挂载')
}
