import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, AlertCircle, CheckCircle2, ChevronLeft, ArrowRight, Mail, Lock } from 'lucide-react';

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
        <div className="fixed inset-0 bg-[#04060b] flex items-center justify-center p-4 overflow-hidden text-white">
            {/* Background Layer inspired by ref */}
            <div className="absolute inset-0 z-0 overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_-10%,rgba(71,198,255,0.25),transparent_45%),radial-gradient(circle_at_85%_0%,rgba(140,140,255,0.28),transparent_38%),linear-gradient(140deg,#02040a,#050816,#03040a)]" />
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] opacity-60 mix-blend-screen" />
                {/* Lens arc */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[620px] pointer-events-none" aria-hidden>
                    <div className="absolute inset-0 rounded-[38%] bg-[radial-gradient(ellipse_at_center,#0a1324_0%,#050812_60%,#020307_100%)]" />
                    <div className="absolute inset-[-6px] rounded-[38%] bg-[conic-gradient(from_160deg_at_50%_50%,rgba(111,199,255,0.65),rgba(176,196,255,0.05),rgba(111,199,255,0.85),rgba(176,196,255,0.05))] blur-[1px] opacity-70" />
                </div>
            </div>

            {/* Version Badge - Bottom Right */}
            <div className="absolute bottom-6 right-8 text-[10px] text-zinc-500 font-mono tracking-widest z-50 select-none opacity-60 hover:opacity-100 transition-opacity">
                KK STUDIO v1.2.1 BUILD 2026.01
            </div>

            {/* Header Brand & CTA */}
            <div className="absolute top-6 left-8 z-20 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold tracking-wide text-white/80">
                    <div className="w-3 h-3 rounded-full border border-white/40" />
                    Create360
                </div>
                <p className="text-xs text-white/60 max-w-xs leading-relaxed">
                    我们提供系统化课程，帮助设计师掌握工业设计的技能与思维。
                </p>
            </div>

            {/* Main Card */}
            <div className="w-full max-w-[440px] relative z-10 perspective-1000">
                <div className="bg-white/[0.02] backdrop-blur-2xl border border-white/10 rounded-[30px] p-8 shadow-[0_25px_80px_rgba(0,0,0,0.45)] overflow-hidden relative group">
                    <div className="absolute inset-px rounded-[28px] border border-white/5" />
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/8 via-transparent to-transparent opacity-60 pointer-events-none" />

                    {/* Logo & Title */}
                    <div className="text-center mb-10 relative">
                        {view !== 'login' && (
                            <button
                                onClick={() => setView('login')}
                                className="absolute left-0 top-0 p-2 -ml-2 text-zinc-500 hover:text-white transition-colors"
                            >
                                <ChevronLeft size={20} />
                            </button>
                        )}

                        <img
                            src="/icon.svg"
                            alt="KK Studio"
                            className="w-16 h-16 mx-auto mb-5 drop-shadow-[0_12px_32px_rgba(91,177,255,0.4)]"
                        />
                        <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
                            {view === 'login' && '登录 KK Studio'}
                            {view === 'register' && '加入 KK Studio'}
                            {view === 'forgot-password' && '重置密码'}
                        </h1>
                        <p className="text-zinc-400 text-sm">
                            {view === 'login' && '开启你的创意工作流'}
                            {view === 'register' && '注册即可使用更多 AI 能力'}
                            {view === 'forgot-password' && '填写邮箱以获取重置链接'}
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
                            className="w-full h-12 rounded-xl overflow-hidden relative group text-white font-semibold tracking-wide border border-white/10 bg-gradient-to-r from-[#1b89ff] via-[#7b7bff] to-[#5bd7ff] shadow-[0_20px_50px_rgba(16,102,255,0.35)] hover:shadow-[0_24px_60px_rgba(91,215,255,0.45)] hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <div className="absolute inset-0 opacity-70 group-hover:opacity-100 transition-opacity bg-[radial-gradient(circle_at_20%_50%,rgba(255,255,255,0.22),transparent_35%),radial-gradient(circle_at_80%_50%,rgba(255,255,255,0.18),transparent_32%)]" />
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent -translate-x-full group-hover:animate-shimmer" />
                            <span className="relative z-10 flex items-center justify-center gap-2">
                                {loading ? (
                                    <Loader2 size={20} className="animate-spin" />
                                ) : (
                                    <>
                                        {view === 'login' && '立即登录'}
                                        {view === 'register' && '创建账号'}
                                        {view === 'forgot-password' && '发送重置链接'}
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
