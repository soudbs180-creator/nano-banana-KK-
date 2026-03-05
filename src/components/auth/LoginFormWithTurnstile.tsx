/**
 * 带人机验证的登录表单示例
 */

import React, { useState } from 'react'
import { TurnstileWidget, useTurnstile } from './TurnstileWidget'
import { notify } from '../../services/system/notificationService'

interface LoginFormProps {
  onLogin?: (credentials: { username: string; password: string }) => void
}

export const LoginFormWithTurnstile: React.FC<LoginFormProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  
  const {
    token: turnstileToken,
    isVerified,
    error: turnstileError,
    handleVerify,
    handleError,
    handleExpire,
    reset: resetTurnstile,
  } = useTurnstile()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!isVerified || !turnstileToken) {
      notify.error('请完成人机验证', '请先完成人机验证后才能继续登录')
      return
    }

    setIsLoading(true)

    try {
      // 发送到后端验证
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
          turnstileToken, // 后端验证这个 token
        }),
      })

      const data = await response.json()

      if (data.success) {
        notify.success('登录成功', '欢迎回来！')
        onLogin?.({ username, password })
      } else {
        notify.error(data.error || '登录失败', '请检查您的用户名和密码是否正确')
        resetTurnstile() // 失败后重置验证
      }
    } catch (err) {
      notify.error('网络错误', '无法连接到服务器，请检查网络连接')
      resetTurnstile()
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto p-6">
      <h2 className="text-xl font-bold text-center">登录</h2>

      {/* 用户名 */}
      <div>
        <label className="block text-sm font-medium mb-1">用户名</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          required
        />
      </div>

      {/* 密码 */}
      <div>
        <label className="block text-sm font-medium mb-1">密码</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          required
        />
      </div>

      {/* 人机验证 */}
      <div className="py-2">
        <TurnstileWidget
          onVerify={handleVerify}
          onError={handleError}
          onExpire={handleExpire}
          theme="auto"
        />
        {turnstileError && (
          <p className="text-red-500 text-sm mt-1">{turnstileError}</p>
        )}
      </div>

      {/* 提交按钮 */}
      <button
        type="submit"
        disabled={!isVerified || isLoading}
        className={`w-full py-2 rounded-lg font-medium transition-colors ${
          isVerified && !isLoading
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
        }`}
      >
        {isLoading ? '登录中...' : '登录'}
      </button>

      <p className="text-xs text-gray-500 text-center">
        受到 Cloudflare Turnstile 保护
      </p>
    </form>
  )
}

export default LoginFormWithTurnstile
