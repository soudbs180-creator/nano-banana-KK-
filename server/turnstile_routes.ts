/**
 * Cloudflare Turnstile 人机验证
 * 安全原则：密钥只存在于后端，前端只获取 token
 */

import axios from 'axios'

// 从环境变量读取（不要硬编码！）
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || ''
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

interface TurnstileResponse {
  success: boolean
  'error-codes'?: string[]
  challenge_ts?: string
  hostname?: string
  action?: string
  cdata?: string
}

/**
 * 验证 Turnstile token
 * @param token 前端传来的 token
 * @param ip 用户 IP（可选，增强安全）
 */
export async function verifyTurnstileToken(
  token: string,
  ip?: string
): Promise<{ success: boolean; error?: string }> {
  if (!TURNSTILE_SECRET_KEY) {
    console.error('[Turnstile] 错误: TURNSTILE_SECRET_KEY 未配置')
    return { success: false, error: '服务器配置错误' }
  }

  if (!token) {
    return { success: false, error: '缺少验证令牌' }
  }

  try {
    const response = await axios.post<TurnstileResponse>(
      TURNSTILE_VERIFY_URL,
      new URLSearchParams({
        secret: TURNSTILE_SECRET_KEY,
        response: token,
        ...(ip && { remoteip: ip }),
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 5000,
      }
    )

    const data = response.data

    if (data.success) {
      console.log('[Turnstile] 验证成功:', data.hostname)
      return { success: true }
    } else {
      const errors = data['error-codes'] || ['unknown']
      console.warn('[Turnstile] 验证失败:', errors)
      return { 
        success: false, 
        error: getErrorMessage(errors[0]) 
      }
    }
  } catch (err) {
    console.error('[Turnstile] 请求错误:', err)
    return { success: false, error: '验证服务暂时不可用' }
  }
}

/**
 * 错误码翻译
 */
function getErrorMessage(code: string): string {
  const errorMap: Record<string, string> = {
    'missing-input-secret': '服务器配置错误',
    'invalid-input-secret': '服务器配置错误',
    'missing-input-response': '请完成人机验证',
    'invalid-input-response': '验证失败，请重试',
    'bad-request': '请求格式错误',
    'timeout-or-duplicate': '验证已过期，请重试',
    'internal-error': '验证服务错误',
  }
  return errorMap[code] || '验证失败，请重试'
}

/**
 * Express 中间件：验证 Turnstile
 */
export function turnstileMiddleware() {
  return async (req: any, res: any, next: any) => {
    const token = req.body?.turnstileToken || req.headers['x-turnstile-token']
    const ip = req.ip || req.connection?.remoteAddress

    const result = await verifyTurnstileToken(token, ip)

    if (result.success) {
      next()
    } else {
      res.status(403).json({
        success: false,
        error: result.error,
        code: 'TURNSTILE_FAILED',
      })
    }
  }
}

/**
 * 挂载路由
 */
export function mountTurnstileRoutes(app: any) {
  // 验证端点（用于前端测试）
  app.post('/api/verify-turnstile', async (req: any, res: any) => {
    const token = req.body?.token
    const ip = req.ip

    const result = await verifyTurnstileToken(token, ip)
    res.json(result)
  })

  // 受保护的登录端点示例
  app.post('/api/auth/login', turnstileMiddleware(), async (req: any, res: any) => {
    // 如果通过验证，执行登录逻辑
    const { username, password } = req.body
    
    // ... 你的登录逻辑 ...
    
    res.json({
      success: true,
      message: '登录成功',
    })
  })

  console.log('[Turnstile] 路由已挂载')
}
