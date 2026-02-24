import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, AlertCircle, CheckCircle2, ChevronLeft, ArrowRight, Mail, Lock, Sparkles } from 'lucide-react';

type AuthView = 'login' | 'register' | 'forgot-password';

import { useAuth } from '../context/AuthContext';

const LoginScreen: React.FC = () => {
    const { bypassAuth } = useAuth();
    const [view, setView] = useState<AuthView>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [showDevWarning, setShowDevWarning] = useState(false);

    const handleDevLoginClick = () => {
        setShowDevWarning(true);
    };

    const confirmDevLogin = async () => {
        setShowDevWarning(false);
        setLoading(true);
        try {
            await bypassAuth();
        } catch (e: any) {
            setError(e.message);
            setLoading(false);
        }
    };

    // Reset state when switching views
    useEffect(() => {
        setError(null);
        setMessage(null);
        setPassword('');
        setConfirmPassword('');
    }, [view]);

    const [retryCount, setRetryCount] = useState(0);
    const MAX_RETRIES = 3;

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);

        // Helper function for actual auth attempt
        const attemptAuth = async (): Promise<void> => {
            if (view === 'register') {
                if (password !== confirmPassword) {
                    throw new Error("两次输入的密码不一致");
                }
                if (password.length < 6) {
                    throw new Error("密码长度至少需要6位");
                }

                // Auto-generate display name from email
                const displayName = email.split('@')[0];

                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            display_name: displayName,
                        }
                    }
                });
                if (error) throw error;

                if (data.session) {
                    // Immediate login successful (Email confirm OFF)
                } else {
                    // Email confirm ON
                    setMessage('注册成功！请前往邮箱查收验证邮件，验证后即可登录。');
                    // Optional: Switch to login view after delay
                    setTimeout(() => setView('login'), 3000);
                }
            } else if (view === 'login') {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
            } else if (view === 'forgot-password') {
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin,
                });
                if (error) throw error;
                setMessage('重置链接已发送！请检查您的邮箱。');
            }
        };

        try {
            await attemptAuth();
            setRetryCount(0); // Reset on success
        } catch (err: any) {
            console.error('Login Error:', err);
            if (view === 'register' && (err.message?.includes('User already registered') || err.status === 400)) {
                setError('该邮箱已被注册，请直接登录');
            } else if (err.message?.includes('Invalid login credentials') || (view === 'login' && err.status === 400)) {
                setError('邮箱或密码错误');
            } else if (err.message?.includes('Email not confirmed')) {
                setError('请先前往邮箱激活您的账号');
            } else if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError') || err.message?.includes('network')) {
                // Network error - implement retry logic
                const currentRetry = retryCount + 1;
                setRetryCount(currentRetry);

                if (currentRetry < MAX_RETRIES) {
                    setError(`网络连接失败，正在重试... (${currentRetry}/${MAX_RETRIES})`);
                    // Auto retry after 1.5 seconds
                    setTimeout(async () => {
                        try {
                            await attemptAuth();
                            setRetryCount(0);
                            setError(null);
                        } catch (retryErr: any) {
                            if (retryErr.message?.includes('Failed to fetch')) {
                                // Trigger another retry by re-submitting
                                const form = document.querySelector('form');
                                if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                            } else {
                                setError(retryErr.message || '操作失败，请重试');
                            }
                        } finally {
                            setLoading(false);
                        }
                    }, 1500);
                    return; // Don't set loading to false yet
                } else {
                    // Max retries reached, show option to go offline
                    setError(`网络连接失败 (已重试${MAX_RETRIES}次)。您可以点击下方"开发者离线模式"按钮暂时使用。`);
                    setRetryCount(0); // Reset for next attempt
                }
            } else {
                setError(err.message || '操作失败，请重试');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-[#000000] flex overflow-hidden text-white font-sans">
            {/* Custom Dev Mode Warning Modal */}
            {showDevWarning && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[#18181b] border border-white/10 w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-6 animate-in zoom-in-95 duration-200">
                        <div className="space-y-4 text-center">
                            <div className="mx-auto w-12 h-12 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center">
                                <AlertCircle size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white mb-2">进入离线开发模式?</h3>
                                <p className="text-sm text-zinc-400 leading-relaxed">
                                    离线模式仅供临时测试和开发使用。<br />
                                    <span className="text-amber-500/90 font-medium">关闭浏览器后，本地存储的数据可能会丢失。</span>
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setShowDevWarning(false)}
                                className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={confirmDevLogin}
                                className="w-full py-2.5 rounded-xl bg-white text-black hover:bg-zinc-200 font-bold transition-colors"
                            >
                                确认进入
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* LEFT SIDE: Visual / Artistic (Desktop Only) */}
            <div className="hidden lg:flex w-1/2 relative overflow-hidden items-center justify-center bg-[#05081a]">
                <div className="absolute inset-0">
                    <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] bg-indigo-600/15 rounded-full blur-[120px] mix-blend-screen animate-blob" />
                    <div className="absolute bottom-[-10%] right-[-10%] w-[80%] h-[80%] bg-purple-600/15 rounded-full blur-[120px] mix-blend-screen animate-blob animation-delay-2000" />
                </div>
                <div className="relative z-10 p-12 max-w-lg text-center">
                    <div className="w-24 h-24 rounded-[32px] bg-gradient-to-tr from-indigo-500 to-purple-500 mx-auto mb-8 shadow-2xl shadow-indigo-500/30 flex items-center justify-center ring-1 ring-white/20 animate-float-breathe">
                        <Sparkles size={48} className="text-white" strokeWidth={2.5} />
                    </div>
                    <h1 className="text-5xl font-black tracking-tighter mb-4 text-white">
                        KK Studio
                    </h1>
                    <p className="text-lg text-zinc-400 font-medium leading-relaxed">
                        新一代 AI 内容创作工作站。<br />
                        无限画布，无限创意。
                    </p>
                    <div className="absolute bottom-8 left-0 right-0 text-center opacity-30 text-xs font-mono">
                        v1.3.1 BUILD 2026.02
                    </div>
                </div>
            </div>

            {/* RIGHT SIDE: Form */}
            <div className="w-full lg:w-1/2 relative flex items-center justify-center p-6 sm:p-12 bg-[#000000]">
                <div className="lg:hidden absolute inset-0 overflow-hidden z-0">
                    <div className="absolute top-[-10%] right-[-10%] w-[300px] h-[300px] bg-purple-500/10 rounded-full blur-[80px]" />
                    <div className="absolute bottom-[-10%] left-[-10%] w-[300px] h-[300px] bg-indigo-500/10 rounded-full blur-[80px]" />
                </div>

                <div className="w-full max-w-md relative z-10">
                    {/* Mobile Logo Header */}
                    <div className="lg:hidden text-center mb-12">
                        <div className="w-20 h-20 rounded-[24px] bg-gradient-to-tr from-indigo-500 to-purple-500 mx-auto mb-6 flex items-center justify-center shadow-2xl ring-1 ring-white/20 animate-float-breathe">
                            <Sparkles size={40} className="text-white" strokeWidth={2.5} />
                        </div>
                        <h1 className="text-3xl font-black tracking-tighter">KK Studio</h1>
                    </div>

                    {/* Back Button */}
                    {view !== 'login' && (
                        <button
                            onClick={() => setView('login')}
                            className="absolute top-[-40px] left-0 flex items-center gap-1 text-sm text-zinc-500 hover:text-white transition-colors"
                        >
                            <ChevronLeft size={16} />
                            返回登录
                        </button>
                    )}

                    <div className="text-left mb-8">
                        <h2 className="text-3xl font-bold tracking-tight mb-2">
                            {view === 'login' && '欢迎回来'}
                            {view === 'register' && '创建新账号'}
                            {view === 'forgot-password' && '找回密码'}
                        </h2>
                        <p className="text-zinc-500">
                            {view === 'login' && '请输入您的账号以继续'}
                            {view === 'register' && '免费注册，开启您的 AI 之旅'}
                            {view === 'forgot-password' && '我们将向您发送重置链接'}
                        </p>
                    </div>

                    <form onSubmit={handleAuth} className="space-y-4">
                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex gap-3 text-red-400 text-sm animate-in fade-in slide-in-from-top-1">
                                <AlertCircle size={18} className="shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}
                        {message && (
                            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg flex gap-3 text-green-400 text-sm animate-in fade-in slide-in-from-top-1">
                                <CheckCircle2 size={18} className="shrink-0" />
                                <span>{message}</span>
                            </div>
                        )}

                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-zinc-400 ml-1">电子邮箱</label>
                                <div className="relative group">
                                    <div className="absolute left-3 top-0 bottom-0 flex items-center text-zinc-500 group-focus-within:text-indigo-400 transition-colors">
                                        <Mail size={18} />
                                    </div>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full h-12 pl-11 pr-4 transition-all text-base"
                                        style={{
                                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                            border: '1px solid rgba(255, 255, 255, 0.1)',
                                            borderRadius: 'var(--radius-xl)',
                                            color: 'white',
                                            outline: 'none',
                                            fontSize: '16px',
                                            transitionDuration: 'var(--duration-fast)'
                                        }}
                                        placeholder="name@example.com"
                                        required
                                        onFocus={(e) => {
                                            e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.5)';
                                            e.currentTarget.style.boxShadow = '0 0 0 1px rgba(99, 102, 241, 0.2)';
                                        }}
                                        onBlur={(e) => {
                                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                                            e.currentTarget.style.boxShadow = 'none';
                                        }}
                                    />
                                </div>
                            </div>

                            {view !== 'forgot-password' && (
                                <div className="space-y-1">
                                    <div className="flex justify-between items-center ml-1">
                                        <label className="text-xs font-medium text-zinc-400">密码</label>
                                        {view === 'login' && (
                                            <button
                                                type="button"
                                                onClick={() => setView('forgot-password')}
                                                className="text-xs text-indigo-400 hover:text-indigo-300"
                                            >
                                                忘记密码？
                                            </button>
                                        )}
                                    </div>
                                    <div className="relative group">
                                        <div className="absolute left-3 top-0 bottom-0 flex items-center text-zinc-500 group-focus-within:text-indigo-400 transition-colors">
                                            <Lock size={18} />
                                        </div>
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full h-12 pl-11 pr-10 transition-all text-base"
                                            style={{
                                                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                                borderRadius: 'var(--radius-xl)',
                                                color: 'white',
                                                outline: 'none',
                                                fontSize: '16px',
                                                transitionDuration: 'var(--duration-fast)'
                                            }}
                                            placeholder="••••••••"
                                            required
                                            minLength={6}
                                            onFocus={(e) => {
                                                e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.5)';
                                                e.currentTarget.style.boxShadow = '0 0 0 1px rgba(99, 102, 241, 0.2)';
                                            }}
                                            onBlur={(e) => {
                                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                                                e.currentTarget.style.boxShadow = 'none';
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-0 bottom-0 flex items-center text-zinc-600 hover:text-zinc-400"
                                        >
                                            {showPassword ? "隐藏" : "显示"}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {view === 'register' && (
                                <div className="space-y-1 animate-in fade-in slide-in-from-top-2">
                                    <label className="text-xs font-medium text-zinc-400 ml-1">确认密码</label>
                                    <div className="relative group">
                                        <div className="absolute left-3 top-0 bottom-0 flex items-center text-zinc-500 group-focus-within:text-indigo-400 transition-colors">
                                            <CheckCircle2 size={18} />
                                        </div>
                                        <input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className="w-full h-11 pl-10 pr-4 transition-all"
                                            style={{
                                                backgroundColor: 'rgba(24, 24, 27, 0.5)',
                                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                                borderRadius: 'var(--radius-md)',
                                                color: 'white',
                                                outline: 'none',
                                                fontSize: '16px',
                                                transitionDuration: 'var(--duration-fast)'
                                            }}
                                            placeholder="再次输入密码"
                                            required
                                            onFocus={(e) => {
                                                e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.5)';
                                                e.currentTarget.style.boxShadow = '0 0 0 1px rgba(99, 102, 241, 0.5)';
                                            }}
                                            onBlur={(e) => {
                                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                                                e.currentTarget.style.boxShadow = 'none';
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full h-14 mt-8 bg-white text-black font-black text-lg rounded-[20px] hover:bg-zinc-200 active-scale transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xl"
                        >
                            {loading ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : (
                                <>
                                    {view === 'login' && '登录'}
                                    {view === 'register' && '创建账号'}
                                    {view === 'forgot-password' && '发送链接'}
                                    {!loading && <ArrowRight size={16} />}
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-8 text-center space-y-4">
                        {view === 'login' ? (
                            <p className="text-zinc-500 text-sm">
                                还没有账号？{' '}
                                <button
                                    onClick={() => setView('register')}
                                    className="text-white hover:underline underline-offset-4 decoration-zinc-700"
                                >
                                    立即注册
                                </button>
                            </p>
                        ) : (
                            <p className="text-zinc-500 text-sm">
                                已有账号？{' '}
                                <button
                                    onClick={() => setView('login')}
                                    className="text-white hover:underline underline-offset-4 decoration-zinc-700"
                                >
                                    返回登录
                                </button>
                            </p>
                        )}

                        <div className="pt-4 border-t border-white/5">
                            <button
                                type="button"
                                onClick={handleDevLoginClick}
                                className="text-xs text-zinc-600 hover:text-zinc-400 font-mono transition-colors flex items-center justify-center gap-2 mx-auto"
                            >
                                <Lock size={12} />
                                开发者离线模式 (Dev Mode)
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
export default LoginScreen;
