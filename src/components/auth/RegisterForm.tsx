/**
 * 用户注册表单（带 Turnstile 防护）
 * 防止：机器人批量注册、垃圾邮箱
 */

import React, { useState } from 'react'
import { TurnstileWidget, useTurnstile } from './TurnstileWidget'
import { notify } from '../../services/system/notificationService'
import { Mail, Lock, User, Loader2, Shield } from 'lucide-react'

interface RegisterFormProps {
  onSuccess?: () => void
  onLoginClick?: () => void
}

export const RegisterForm: React.FC<RegisterFormProps> = ({
  onSuccess,
  onLoginClick,
}) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    username: '',
  })
  const [isLoading, setIsLoading] = useState(false)
  const [agreed, setAgreed] = useState(false)

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

  const validateForm = (): boolean => {
    // 基础验证
    if (!formData.email || !formData.password || !formData.username) {
      notify.error('信息不完整', '请填写用户名、邮箱和密码')
      return false
    }

    // 邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      notify.error('邮箱格式错误', '请输入有效的邮箱地址，如 example@domain.com')
      return false
    }

    // 密码长度
    if (formData.password.length < 6) {
      notify.error('密码太短', '密码长度至少需要 6 位字符')
      return false
    }

    // 密码确认
    if (formData.password !== formData.confirmPassword) {
      notify.error('密码不匹配', '两次输入的密码不一致，请重新输入')
      return false
    }

    // 人机验证
    if (!isVerified || !turnstileToken) {
      notify.error('验证未完成', '请完成人机验证以继续')
      return false
    }

    // 用户协议
    if (!agreed) {
      notify.error('未同意协议', '请阅读并同意用户协议和隐私政策')
      return false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          turnstileToken,
        }),
      })

      const data = await response.json()

      if (data.success) {
        notify.success('注册成功', '欢迎加入 KK Studio，开始您的创作之旅！')
        onSuccess?.()
      } else {
        notify.error('注册失败', data.error || '请检查输入信息后重试')
        // 失败后重置验证，让用户重新验证
        resetTurnstile()
      }
    } catch (err) {
      notify.error('网络错误', '连接服务器失败，请检查网络后重试')
      resetTurnstile()
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white dark:bg-zinc-900 rounded-2xl shadow-lg">
      {/* 标题 */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full mb-3">
          <User className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">创建账号</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          加入 KK Studio，开始创作
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 用户名 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            用户名
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleChange}
              placeholder="输入用户名"
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-900 dark:text-white"
              required
            />
          </div>
        </div>

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
          <p className="text-xs text-gray-500 mt-1">
            请使用真实邮箱，临时邮箱无法注册
          </p>
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
              placeholder="至少 6 位字符"
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-900 dark:text-white"
              required
            />
          </div>
        </div>

        {/* 确认密码 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            确认密码
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="再次输入密码"
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-900 dark:text-white"
              required
            />
          </div>
        </div>

        {/* 人机验证 */}
        <div className="py-3">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-green-600" />
            <span className="text-sm text-gray-600 dark:text-gray-400">安全验证</span>
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

        {/* 用户协议 */}
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            我已阅读并同意
            <a href="#" className="text-blue-600 hover:underline">用户协议</a>
            和
            <a href="#" className="text-blue-600 hover:underline">隐私政策</a>
          </span>
        </label>

        {/* 提交按钮 */}
        <button
          type="submit"
          disabled={isLoading || !isVerified}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              注册中...
            </>
          ) : (
            '立即注册'
          )}
        </button>
      </form>

      {/* 登录入口 */}
      <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
        已有账号？
        <button
          type="button"
          onClick={onLoginClick}
          className="text-blue-600 hover:underline font-medium ml-1"
        >
          立即登录
        </button>
      </p>

      {/* 底部安全提示 */}
      <div className="mt-6 pt-4 border-t border-gray-100 dark:border-zinc-800">
        <p className="text-xs text-gray-400 text-center flex items-center justify-center gap-1">
          <Shield className="w-3 h-3" />
          由 Cloudflare Turnstile 提供安全保护
        </p>
      </div>
    </div>
  )
}

export default RegisterForm
