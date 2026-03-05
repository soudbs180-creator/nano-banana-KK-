/**
 * Cloudflare Turnstile 人机验证组件
 * 文档: https://developers.cloudflare.com/turnstile/
 */

import React, { useEffect, useRef, useCallback } from 'react'

// Turnstile 站点密钥（公开，可放在前端）
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || ''

// Turnstile 脚本 URL
const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js'

interface TurnstileWidgetProps {
  /** 验证成功回调，返回 token */
  onVerify: (token: string) => void
  /** 验证失败回调 */
  onError?: (error: string) => void
  /** 验证过期回调 */
  onExpire?: () => void
  /** 主题 */
  theme?: 'light' | 'dark' | 'auto'
  /** 语言 */
  language?: string
  /** 自定义样式类 */
  className?: string
}

// 扩展 Window 类型
declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: any) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
    onTurnstileLoad?: () => void
  }
}

export const TurnstileWidget: React.FC<TurnstileWidgetProps> = ({
  onVerify,
  onError,
  onExpire,
  theme = 'auto',
  language = 'zh-cn',
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const scriptLoadedRef = useRef(false)

  // 清理小部件
  const cleanup = useCallback(() => {
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.remove(widgetIdRef.current)
      widgetIdRef.current = null
    }
  }, [])

  // 渲染小部件
  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile) return
    if (widgetIdRef.current) return // 已存在

    try {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme,
        language,
        callback: (token: string) => {
          console.log('[Turnstile] 验证成功')
          onVerify(token)
        },
        'error-callback': () => {
          console.error('[Turnstile] 验证错误')
          onError?.('验证加载失败')
        },
        'expired-callback': () => {
          console.warn('[Turnstile] 验证已过期')
          onExpire?.()
        },
      })
    } catch (err) {
      console.error('[Turnstile] 渲染失败:', err)
      onError?.('验证组件加载失败')
    }
  }, [onVerify, onError, onExpire, theme, language])

  // 加载脚本
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) {
      console.error('[Turnstile] 错误: VITE_TURNSTILE_SITE_KEY 未配置')
      onError?.('配置错误')
      return
    }

    // 脚本已加载
    if (document.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`)) {
      if (window.turnstile) {
        renderWidget()
      }
      return
    }

    // 避免重复加载
    if (scriptLoadedRef.current) return
    scriptLoadedRef.current = true

    // 创建脚本
    const script = document.createElement('script')
    script.src = TURNSTILE_SCRIPT_URL
    script.async = true
    script.defer = true
    script.onload = () => {
      renderWidget()
    }
    script.onerror = () => {
      onError?.('验证脚本加载失败')
    }

    document.head.appendChild(script)

    return cleanup
  }, [renderWidget, onError])

  // 重置方法（暴露给父组件）
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  if (!TURNSTILE_SITE_KEY) {
    return (
      <div className="text-red-500 text-sm p-2 border border-red-200 rounded bg-red-50">
        ⚠️ Turnstile 未配置
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`flex justify-center ${className}`}
      data-turnstile-container
    />
  )
}

/**
 * 用于登录表单的 Hook
 */
export function useTurnstile() {
  const [token, setToken] = React.useState<string | null>(null)
  const [isVerified, setIsVerified] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleVerify = useCallback((newToken: string) => {
    setToken(newToken)
    setIsVerified(true)
    setError(null)
  }, [])

  const handleError = useCallback((err: string) => {
    setError(err)
    setIsVerified(false)
    setToken(null)
  }, [])

  const handleExpire = useCallback(() => {
    setIsVerified(false)
    setToken(null)
  }, [])

  const reset = useCallback(() => {
    setToken(null)
    setIsVerified(false)
    setError(null)
    // 重置 widget
    if (window.turnstile) {
      const containers = document.querySelectorAll('[data-turnstile-container]')
      containers.forEach((container) => {
        const id = container.getAttribute('data-turnstile-id')
        if (id) window.turnstile?.reset(id)
      })
    }
  }, [])

  return {
    token,
    isVerified,
    error,
    handleVerify,
    handleError,
    handleExpire,
    reset,
  }
}

export default TurnstileWidget
