import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, AlertCircle, CheckCircle2, ChevronLeft, ArrowRight, Mail, Lock, Sparkles } from 'lucide-react';

type AuthView = 'login' | 'register' | 'forgot-password';

const LoginScreen: React.FC = () => {
    const [view, setView] = useState<AuthView>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    // Reset state when switching views
    useEffect(() => {
        setError(null);
        setMessage(null);
        setPassword('');
        setConfirmPassword('');
    }, [view]);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);

        try {
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
        } catch (err: any) {
            console.error(err);
            if (err.message.includes('User already registered') || err.status === 400) {
                setError('该邮箱已被注册，请直接登录');
            } else if (err.message.includes('Invalid login credentials')) {
                setError('邮箱或密码错误');
            } else {
                setError(err.message || '操作失败，请重试');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-[#03050b] flex overflow-hidden text-white font-sans">
            {/* LEFT SIDE: Visual / Artistic (Desktop Only) */}
            <div className="hidden lg:flex w-1/2 relative overflow-hidden items-center justify-center bg-[#05081a]">
                {/* Dynamic Background */}
                <div className="absolute inset-0">
                    <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] bg-indigo-600/20 rounded-full blur-[120px] mix-blend-screen animate-blob" />
                    <div className="absolute bottom-[-10%] right-[-10%] w-[80%] h-[80%] bg-purple-600/20 rounded-full blur-[120px] mix-blend-screen animate-blob animation-delay-2000" />
                    <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20 bg-[size:50px_50px]" />
                </div>

                {/* Content */}
                <div className="relative z-10 p-12 max-w-lg text-center">
                    <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-indigo-500 to-purple-500 mx-auto mb-8 shadow-2xl shadow-indigo-500/30 flex items-center justify-center">
                        {/* Placeholder Logo Icon */}
                        <Sparkles size={48} className="text-white" />
                    </div>
                    <h1 className="text-4xl font-bold tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">
                        KK Studio
                    </h1>
                    <p className="text-lg text-zinc-400 leading-relaxed">
                        新一代 AI 内容创作工作站。<br />
                        无限画布，无限创意。
                    </p>
                    {/* Version Badge */}
                    <div className="absolute bottom-8 left-0 right-0 text-center opacity-30 text-xs font-mono">
                        v1.2.1 BUILD 2026.01
                    </div>
                </div>
            </div>

            {/* RIGHT SIDE: Form */}
            <div className="w-full lg:w-1/2 relative flex items-center justify-center p-6 sm:p-12 bg-[#03050b]">
                {/* iOS-like subtle background for mobile */}
                <div className="lg:hidden absolute inset-0 overflow-hidden z-0">
                    <div className="absolute top-[-10%] right-[-10%] w-[300px] h-[300px] bg-purple-500/20 rounded-full blur-[80px]" />
                </div>

                <div className="w-full max-w-md relative z-10">
                    {/* Mobile Logo Header */}
                    <div className="lg:hidden text-center mb-10">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-500 mx-auto mb-4 flex items-center justify-center shadow-lg">
                            <Sparkles size={32} className="text-white" />
                        </div>
                        <h1 className="text-2xl font-bold">KK Studio</h1>
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
                        {/* Status Messages */}
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
                            {/* Email */}
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
                                        className="w-full h-11 bg-zinc-900/50 border border-white/10 rounded-lg pl-10 pr-4 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-zinc-600"
                                        placeholder="name@example.com"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Password */}
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
                                            className="w-full h-11 bg-zinc-900/50 border border-white/10 rounded-lg pl-10 pr-10 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-zinc-600"
                                            placeholder="••••••••"
                                            required
                                            minLength={6}
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

                            {/* Confirm Password */}
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
                                            className="w-full h-11 bg-zinc-900/50 border border-white/10 rounded-lg pl-10 pr-4 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-zinc-600"
                                            placeholder="再次输入密码"
                                            required
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full h-11 mt-6 bg-white text-black font-semibold rounded-lg hover:bg-zinc-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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

                    <div className="mt-8 text-center">
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
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginScreen;
