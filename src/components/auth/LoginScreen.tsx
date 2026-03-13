import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Sparkles,
} from 'lucide-react';
import { Chrome } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import AnoAI from '@/components/ui/animated-shader-background';
import './LoginScreen.css';

type AuthView = 'login' | 'register' | 'forgot-password';
type FieldName = 'email' | 'password' | 'confirmPassword';
type FieldErrors = Partial<Record<FieldName, string>>;
type FieldTouched = Record<FieldName, boolean>;
type StarPoint = {
  id: number;
  top: string;
  left: string;
  delay: string;
  duration: string;
  size: string;
  opacity: string;
};

const MAX_RETRY = 3;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = String((error as { message?: string }).message || '').toLowerCase();
  return message.includes('failed to fetch') || message.includes('network') || message.includes('timeout');
}

function mapAuthError(error: unknown, view: AuthView): string {
  const message = String((error as { message?: string }).message || '');

  if (view === 'register' && (message.includes('User already registered') || message.includes('already registered'))) {
    return '该邮箱已注册，请直接登录。';
  }
  if (message.includes('Invalid login credentials')) {
    return '邮箱或密码错误。';
  }
  if (message.includes('Email not confirmed')) {
    return '请先完成邮箱验证后再登录。';
  }
  if (message.includes('Password should be at least')) {
    return '密码长度至少 6 位。';
  }
  if (message.includes('For security purposes')) {
    return '操作过于频繁，请稍后再试。';
  }
  return message || '操作失败，请重试。';
}

function validateFields(view: AuthView, email: string, password: string, confirmPassword: string): FieldErrors {
  const errors: FieldErrors = {};
  const emailValue = email.trim();

  if (!emailValue) {
    errors.email = '请输入邮箱地址。';
  } else if (!EMAIL_RE.test(emailValue)) {
    errors.email = '邮箱格式不正确。';
  }

  if (view !== 'forgot-password') {
    if (!password) {
      errors.password = '请输入登录密码。';
    } else if (password.length < 6) {
      errors.password = '密码长度至少 6 位。';
    }
  }

  if (view === 'register') {
    if (!confirmPassword) {
      errors.confirmPassword = '请再次输入密码。';
    } else if (confirmPassword !== password) {
      errors.confirmPassword = '两次输入的密码不一致。';
    }
  }

  return errors;
}

const LoginScreen: React.FC = () => {
  const { loginAsTempUser } = useAuth();

  const [view, setView] = useState<AuthView>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showTempUserWarning, setShowTempUserWarning] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [fieldTouched, setFieldTouched] = useState<FieldTouched>({
    email: false,
    password: false,
    confirmPassword: false,
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    const body = document.body;
    const root = document.documentElement;
    const previousBodyBackground = body.style.background;
    const previousRootBackground = root.style.background;
    const previousColorScheme = root.style.colorScheme;

    body.classList.add('auth-screen-active');
    root.classList.add('auth-screen-active');
    body.style.background = '#07111f';
    root.style.background = '#07111f';
    root.style.colorScheme = 'dark';

    return () => {
      body.classList.remove('auth-screen-active');
      root.classList.remove('auth-screen-active');
      body.style.background = previousBodyBackground;
      root.style.background = previousRootBackground;
      root.style.colorScheme = previousColorScheme;
    };
  }, []);

  const localErrors = useMemo(
    () => validateFields(view, email, password, confirmPassword),
    [view, email, password, confirmPassword]
  );

  const stars = useMemo<StarPoint[]>(
    () =>
      Array.from({ length: 18 }, (_, index) => ({
        id: index,
        top: `${6 + Math.random() * 72}%`,
        left: `${4 + Math.random() * 88}%`,
        delay: `${Math.random() * 10}s`,
        duration: `${2.6 + Math.random() * 4.8}s`,
        size: `${1.2 + Math.random() * 2.4}px`,
        opacity: `${0.35 + Math.random() * 0.55}`,
      })),
    []
  );

  useEffect(() => {
    setError(null);
    setMessage(null);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setSubmitted(false);
    setFieldTouched({
      email: false,
      password: false,
      confirmPassword: false,
    });
    setFieldErrors({});
  }, [view]);

  const showFieldError = (field: FieldName) => Boolean(fieldErrors[field] && (submitted || fieldTouched[field]));

  const syncFieldErrors = () => {
    setFieldErrors(localErrors);
  };

  const markTouched = (field: FieldName) => {
    setFieldTouched((current) => ({ ...current, [field]: true }));
    setFieldErrors(localErrors);
  };

  const confirmTempUserLogin = async () => {
    setShowTempUserWarning(false);
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await loginAsTempUser();
    } catch (tempError) {
      setError(mapAuthError(tempError, 'login'));
    } finally {
      setLoading(false);
    }
  };

  const attemptAuth = async () => {
    const emailValue = email.trim();

    if (view === 'register') {
      const displayName = emailValue.split('@')[0] || 'New User';
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: emailValue,
        password,
        options: {
          data: {
            display_name: displayName,
          },
        },
      });
      if (signUpError) throw signUpError;

      if (data.session) {
        setMessage('注册成功，正在进入系统...');
      } else {
        setMessage('注册成功，请前往邮箱查收验证邮件，验证后即可登录。');
        setTimeout(() => setView('login'), 2200);
      }
      return;
    }

    if (view === 'login') {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: emailValue,
        password,
      });
      if (signInError) throw signInError;
      return;
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(emailValue, {
      redirectTo: window.location.origin,
    });
    if (resetError) throw resetError;
    setMessage('重置密码邮件已发送，请检查邮箱。');
  };

  const handleAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;

    setSubmitted(true);
    setFieldTouched({
      email: true,
      password: true,
      confirmPassword: true,
    });
    setFieldErrors(localErrors);

    if (Object.keys(localErrors).length > 0) {
      setError('请先修正表单错误后再提交。');
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    let lastError: unknown = null;

    for (let index = 0; index < MAX_RETRY; index += 1) {
      try {
        await attemptAuth();
        setLoading(false);
        return;
      } catch (authError) {
        lastError = authError;
        if (isNetworkError(authError) && index < MAX_RETRY - 1) {
          setError(`网络连接不稳定，正在重试（${index + 1}/${MAX_RETRY}）...`);
          await sleep(900);
          continue;
        }
        break;
      }
    }

    if (isNetworkError(lastError)) {
      setError(`网络连接失败（已重试 ${MAX_RETRY} 次）。你可以先使用临时用户登录。`);
    } else {
      setError(mapAuthError(lastError, view));
    }
    setLoading(false);
  };

  return (
    <div className="auth-page">
      {showTempUserWarning && (
        <div className="auth-modal-mask">
          <div className="auth-modal-card">
            <div className="auth-modal-icon">
              <Clock size={24} />
            </div>
            <h3>临时用户登录</h3>
            <p>无需注册即可体验全部功能，账号有效期 24 小时。</p>
            <p>临时账号到期后会自动清理本地数据，请勿存放重要内容。</p>
            <div className="auth-modal-actions">
              <button type="button" className="auth-btn auth-btn-ghost" onClick={() => setShowTempUserWarning(false)}>
                取消
              </button>
              <button type="button" className="auth-btn auth-btn-main" onClick={confirmTempUserLogin}>
                确认登录
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="auth-shader-background" aria-hidden>
        <AnoAI className="auth-shader-canvas" />
      </div>

      <div className="auth-background" aria-hidden>
        <div className="auth-gradient auth-gradient-a" />
        <div className="auth-gradient auth-gradient-b" />
        <div className="auth-grid" />
        <div className="auth-star-layer">
          {stars.map((star) => (
            <span
              key={star.id}
              className="auth-star-point"
              style={
                {
                  '--star-top': star.top,
                  '--star-left': star.left,
                  '--star-delay': star.delay,
                  '--star-duration': star.duration,
                  '--star-size': star.size,
                  '--star-opacity': star.opacity,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      </div>

      <section className="auth-side-visual" aria-hidden>
        <div className="auth-brand">
          <div className="auth-brand-icon">
            <Sparkles size={30} />
          </div>
          <h1>KK 创作平台</h1>
          <p>下一代智能创作工作台</p>
        </div>

        <p className="auth-side-note">登录后自动同步你的模型、积分与生成记录。</p>
      </section>

      <section className="auth-side-form">
        <div className="auth-panel">
          {view !== 'login' && (
            <button type="button" className="auth-link-back" onClick={() => setView('login')}>
              <ChevronLeft size={16} />
              返回登录
            </button>
          )}

          <header className="auth-header">
            <h2>
              {view === 'login' && '欢迎回来'}
              {view === 'register' && '创建账号'}
              {view === 'forgot-password' && '找回密码'}
            </h2>
            <p>
              {view === 'login' && '请登录后继续使用 KK 创作平台。'}
              {view === 'register' && '创建新账户后即可开启完整功能。'}
              {view === 'forgot-password' && '输入邮箱后我们会发送重置链接。'}
            </p>
          </header>

          <form className="auth-form" onSubmit={handleAuth}>
            {error && (
              <div className="auth-feedback auth-feedback-error">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}
            {message && (
              <div className="auth-feedback auth-feedback-success">
                <CheckCircle2 size={16} />
                <span>{message}</span>
              </div>
            )}

            <label className="auth-field">
              <span>邮箱地址</span>
              <div className={`auth-input-wrap ${showFieldError('email') ? 'auth-input-error' : ''}`}>
                <Mail size={18} />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (submitted || fieldTouched.email) syncFieldErrors();
                  }}
                  onBlur={() => markTouched('email')}
                  placeholder="请输入邮箱地址"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="auth-field-help">
                {showFieldError('email') ? <span className="auth-field-error">{fieldErrors.email}</span> : <span>　</span>}
              </div>
            </label>

            {view !== 'forgot-password' && (
              <label className="auth-field">
                <div className="auth-field-row">
                  <span>登录密码</span>
                </div>
                <div className={`auth-input-wrap ${showFieldError('password') ? 'auth-input-error' : ''}`}>
                  <Lock size={18} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (submitted || fieldTouched.password || fieldTouched.confirmPassword) syncFieldErrors();
                    }}
                    onBlur={() => markTouched('password')}
                    placeholder="请输入登录密码"
                    required
                    minLength={6}
                    autoComplete={view === 'register' ? 'new-password' : 'current-password'}
                  />
                  <button
                    type="button"
                    className="auth-eye-btn"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="auth-field-help">
                  {showFieldError('password') ? (
                    <span className="auth-field-error">{fieldErrors.password}</span>
                  ) : (
                    <span>{view === 'register' ? '密码至少 6 位，建议包含字母和数字。' : '　'}</span>
                  )}
                </div>
              </label>
            )}

            {view === 'register' && (
              <label className="auth-field">
                <span>确认密码</span>
                <div className={`auth-input-wrap ${showFieldError('confirmPassword') ? 'auth-input-error' : ''}`}>
                  <Lock size={18} />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => {
                      setConfirmPassword(event.target.value);
                      if (submitted || fieldTouched.confirmPassword || fieldTouched.password) syncFieldErrors();
                    }}
                    onBlur={() => markTouched('confirmPassword')}
                    placeholder="请再次输入密码"
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>
                <div className="auth-field-help">
                  {showFieldError('confirmPassword') ? <span className="auth-field-error">{fieldErrors.confirmPassword}</span> : <span>　</span>}
                </div>
              </label>
            )}

            <button type="submit" className="auth-btn auth-btn-main" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  处理中...
                </>
              ) : (
                <>
                  {view === 'login' && '登录'}
                  {view === 'register' && '注册'}
                  {view === 'forgot-password' && '发送重置邮件'}
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            {view === 'login' && (
              <>
                <div className="auth-divider">
                  <span>或使用以下方式登录</span>
                </div>
                <button
                  type="button"
                  className="auth-btn auth-btn-google"
                  onClick={async () => {
                    setLoading(true);
                    setError(null);
                    try {
                      const { error } = await supabase.auth.signInWithOAuth({
                        provider: 'google',
                        options: {
                          redirectTo: `${window.location.origin}/auth/callback`,
                        },
                      });
                      if (error) throw error;
                    } catch (err) {
                      setError(mapAuthError(err, 'login'));
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                >
                  <Chrome size={18} />
                  使用 Google 登录
                </button>
                <button type="button" className="auth-btn auth-btn-ghost" onClick={() => setShowTempUserWarning(true)} disabled={loading}>
                  临时用户登录
                </button>
              </>
            )}

            <div className="auth-footer-actions">
              {view === 'login' && (
                <>
                  <button type="button" className="auth-text-btn" onClick={() => setView('register')}>
                    没有账号？立即注册
                  </button>
                  <button type="button" className="auth-btn-forgot" onClick={() => setView('forgot-password')}>
                    忘记密码？
                  </button>
                </>
              )}
              {view === 'register' && (
                <button type="button" className="auth-text-btn" onClick={() => setView('login')}>
                  已有账号？返回登录
                </button>
              )}
              {view === 'forgot-password' && (
                <button type="button" className="auth-text-btn" onClick={() => setView('login')}>
                  想起来了？返回登录
                </button>
              )}
            </div>
          </form>
        </div>
      </section>
    </div>
  );
};

export default LoginScreen;
