import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, AlertCircle, CheckCircle2, ChevronLeft, ArrowRight, Mail, Lock, Sparkles } from 'lucide-react';

type AuthView = 'login' | 'register' | 'forgot-password';

const LoginScreen: React.FC = () => {
    const [view, setView] = useState<AuthView>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState(''); // For registration
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
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                });
                if (error) throw error;

                if (data.session) {
                    // Start auto-login immediately if session is returned
                    // AuthContext will handle the state change
                } else {
                    setMessage('注册成功！请检查您的邮箱完成验证，验证后即可登录。');
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
                setMessage('重置链接已发送！请检查您的邮箱（包括垃圾邮件文件夹）。点击链接即可重置密码。');
            }
        } catch (err: any) {
            console.error(err);
            setError(err.message === 'User already registered' ? '该邮箱已被注册' : (err.message || '操作失败，请重试'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-[#09090b] flex items-center justify-center p-4 overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 z-0 overflow-hidden">
                <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-purple-500/20 rounded-full blur-[120px] mix-blend-screen animate-blob" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-indigo-500/20 rounded-full blur-[120px] mix-blend-screen animate-blob animation-delay-2000" />

                {/* Grid Pattern */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" />
            </div>

            {/* Version Badge - Bottom Right */}
            <div className="absolute bottom-6 right-8 text-[10px] text-zinc-600 font-mono tracking-widest z-50 select-none opacity-50 hover:opacity-100 transition-opacity">
                KK STUDIO v1.1.9 BUILD 2026.01
            </div>

            {/* Main Card */}
            <div className="w-full max-w-[420px] relative z-10 perspective-1000">
                <div className="bg-[#121214]/80 backdrop-blur-2xl border border-white/10 rounded-[32px] p-8 shadow-2xl overflow-hidden relative group">
                    {/* Glass Shine Effect */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

                    {/* Logo Area */}
                    <div className="text-center mb-10 relative">
                        {/* Optional Back Button for Auth Flows */}
                        {view !== 'login' && (
                            <button
                                onClick={() => setView('login')}
                                className="absolute left-0 top-0 p-2 -ml-2 text-zinc-500 hover:text-white transition-colors"
                            >
                                <ChevronLeft size={20} />
                            </button>
                        )}

                        <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-2xl mx-auto mb-5 flex items-center justify-center shadow-lg shadow-purple-500/25 relative overflow-hidden">
                            <Sparkles className="text-white relative z-10" size={32} />
                            <div className="absolute inset-0 bg-white/20 blur-lg" />
                        </div>
                        <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
                            {view === 'login' && '欢迎回来'}
                            {view === 'register' && '创建账号'}
                            {view === 'forgot-password' && '找回密码'}
                        </h1>
                        <p className="text-zinc-500 text-sm">
                            {view === 'login' && '登录以继续您的 AI 创作之旅'}
                            {view === 'register' && '加入 AnyGen，释放无限创意'}
                            {view === 'forgot-password' && '请输入邮箱以获取重置验证'}
                        </p>
                    </div>

                    <form onSubmit={handleAuth} className="space-y-5 relative z-10">
                        {/* Error / Success Messages */}
                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 text-red-400 text-sm animate-in fade-in slide-in-from-top-2">
                                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                                <span className="flex-1">{error}</span>
                            </div>
                        )}
                        {message && (
                            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl flex items-start gap-3 text-green-400 text-sm animate-in fade-in slide-in-from-top-2">
                                <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                                <span className="flex-1">{message}</span>
                            </div>
                        )}

                        {/* Input Fields */}
                        <div className="space-y-4">
                            <div className="group">
                                <div className="relative">
                                    <div className="absolute left-4 top-0 bottom-0 flex items-center justify-center text-zinc-500 group-focus-within:text-indigo-400 transition-colors pointer-events-none">
                                        <Mail size={18} />
                                    </div>
                                    <input
                                        type="email"
                                        placeholder="电子邮箱"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full h-12 bg-[#1c1c1e] text-white placeholder-zinc-500 border border-white/5 rounded-xl pl-11 pr-4 focus:outline-none focus:border-indigo-500/50 focus:bg-[#222225] transition-all"
                                        required
                                    />
                                </div>
                            </div>

                            {view !== 'forgot-password' && (
                                <div className="group">
                                    <div className="relative">
                                        <div className="absolute left-4 top-0 bottom-0 flex items-center justify-center text-zinc-500 group-focus-within:text-indigo-400 transition-colors pointer-events-none">
                                            <Lock size={18} />
                                        </div>
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            placeholder="密码"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full h-12 bg-[#1c1c1e] text-white placeholder-zinc-500 border border-white/5 rounded-xl pl-11 pr-4 focus:outline-none focus:border-indigo-500/50 focus:bg-[#222225] transition-all"
                                            required
                                            minLength={6}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-0 bottom-0 flex items-center text-xs text-zinc-600 hover:text-zinc-400 font-medium transition-colors"
                                        >
                                            {showPassword ? "隐藏" : "显示"}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {view === 'register' && (
                                <div className="group animate-in fade-in slide-in-from-top-2">
                                    <div className="relative">
                                        <div className="absolute left-4 top-0 bottom-0 flex items-center justify-center text-zinc-500 group-focus-within:text-indigo-400 transition-colors pointer-events-none">
                                            <CheckCircle2 size={18} />
                                        </div>
                                        <input
                                            type="password"
                                            placeholder="确认密码"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className="w-full h-12 bg-[#1c1c1e] text-white placeholder-zinc-500 border border-white/5 rounded-xl pl-11 pr-4 focus:outline-none focus:border-indigo-500/50 focus:bg-[#222225] transition-all"
                                            required
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Extra Actions */}
                        {view === 'login' && (
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => setView('forgot-password')}
                                    className="text-xs text-zinc-500 hover:text-indigo-400 transition-colors"
                                >
                                    忘记密码？
                                </button>
                            </div>
                        )}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading || (view === 'register' && (!password || password !== confirmPassword))}
                            className="w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-400 hover:via-purple-400 hover:to-pink-400 disabled:from-zinc-800 disabled:to-zinc-800 disabled:via-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed text-white font-bold tracking-wide rounded-xl h-12 flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-[1.02] active:scale-[0.98] mt-8 group border border-white/10 relative overflow-hidden"
                        >
                            {/* Shine effect overlay */}
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-shimmer" />

                            <span className="relative z-10 flex items-center gap-2">
                                {loading ? (
                                    <Loader2 size={20} className="animate-spin" />
                                ) : (
                                    <>
                                        {view === 'login' && '登 录'}
                                        {view === 'register' && '立 即 注 册'}
                                        {view === 'forgot-password' && '发 送 验 证 链 接'}
                                        {!loading && <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform stroke-[2.5]" />}
                                    </>
                                )}
                            </span>
                        </button>
                    </form>

                    {/* Footer Switcher */}
                    <div className="mt-8 text-center border-t border-white/5 pt-6">
                        {view === 'login' ? (
                            <p className="text-zinc-500 text-sm">
                                还没有账号？{' '}
                                <button
                                    onClick={() => setView('register')}
                                    className="text-white font-medium hover:text-indigo-400 transition-colors"
                                >
                                    立即注册
                                </button>
                            </p>
                        ) : (
                            <p className="text-zinc-500 text-sm">
                                已有账号？{' '}
                                <button
                                    onClick={() => setView('login')}
                                    className="text-white font-medium hover:text-indigo-400 transition-colors"
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
