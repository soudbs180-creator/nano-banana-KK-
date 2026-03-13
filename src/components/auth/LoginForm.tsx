/**
 * 用户登录表单（带 Turnstile 防护）
 * 防止：暴力破解、机器人攻击
 */

import React, { useState } from 'react'
import { TurnstileWidget, useTurnstile } from './TurnstileWidget'
import { notify } from '../../services/system/notificationService'
import { Mail, Lock, Loader2, ArrowRight, Shield } from 'lucide-react'

interface LoginFormProps {
  onSuccess?: (user: any) => void
  onRegisterClick?: () => void
}

export const LoginForm: React.FC<LoginFormProps> = ({
  onSuccess,
  onRegisterClick,
}) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [isLoading, setIsLoading] = useState(false)
  const [showTurnstile, setShowTurnstile] = useState(false)
  const [failedAttempts, setFailedAttempts] = useState(0)

  const {
    token: turnstileToken,
    isVerified,
    error: turnstileError,
    handleVerify,
    handleError,
    handleExpire,
    reset: resetTurnstile,
  } = useTurnstile()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // 基础验证
    if (!formData.email || !formData.password) {
      notify.error('请填写邮箱和密码', '邮箱和密码不能为空')
      return
    }

    // 如果失败次数 >= 2，要求人机验证
    if (failedAttempts >= 2 && !isVerified) {
      notify.error('请完成安全验证', '需要完成人机验证才能继续')
      setShowTurnstile(true)
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          // 只在需要时发送 token
          ...(showTurnstile && { turnstileToken }),
        }),
      })

      const data = await response.json()

      if (data.success) {
        notify.success('登录成功', '欢迎回来')
        onSuccess?.(data)
        setFailedAttempts(0)
      } else {
        notify.error('登录失败', data.error || '请检查邮箱和密码')
        const newAttempts = failedAttempts + 1
        setFailedAttempts(newAttempts)
        
        // 失败 2 次后要求验证
        if (newAttempts >= 2) {
          setShowTurnstile(true)
        }
        
        resetTurnstile()
      }
    } catch (err) {
      notify.error('网络错误', '请检查网络连接')
      resetTurnstile()
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white dark:bg-zinc-900 rounded-2xl shadow-lg">
      {/* 标题 */}
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">欢迎回来</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          登录您的 KK Studio 账号
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 邮箱 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            邮箱地址
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="your@email.com"
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-900 dark:text-white"
              required
            />
          </div>
        </div>

        {/* 密码 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            密码
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="输入密码"
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-900 dark:text-white"
              required
            />
          </div>
        </div>

        {/* 失败次数过多时显示人机验证 */}
        {(showTurnstile || failedAttempts >= 2) && (
          <div className="py-3 animate-fadeIn">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-amber-600" />
              <span className="text-sm text-amber-600">
                检测到多次尝试，请完成安全验证
              </span>
            </div>
            <TurnstileWidget
              onVerify={handleVerify}
              onError={handleError}
              onExpire={handleExpire}
              theme="auto"
            />
            {turnstileError && (
              <p className="text-red-500 text-sm mt-2">{turnstileError}</p>
            )}
          </div>
        )}

        {/* 记住我 & 忘记密码 */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">记住我</span>
          </label>
          <button
            type="button"
            className="text-sm text-blue-600 hover:underline"
            onClick={() => notify.info('密码重置', '请联系管理员重置密码')}
          >
            忘记密码？
          </button>
        </div>

        {/* 提交按钮 */}
        <button
          type="submit"
          disabled={isLoading || (showTurnstile && !isVerified)}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              登录中...
            </>
          ) : (
            <>
              登录
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* 注册入口 */}
      <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
        还没有账号？
        <button
          type="button"
          onClick={onRegisterClick}
          className="text-blue-600 hover:underline font-medium ml-1"
        >
          立即注册
        </button>
      </p>
    </div>
  )
}

export default LoginForm
