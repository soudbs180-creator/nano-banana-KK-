import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, AlertCircle } from 'lucide-react';

const LoginScreen: React.FC = () => {
    const [isSignUp, setIsSignUp] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);

        try {
            if (isSignUp) {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                });
                if (error) throw error;
                setMessage('注册成功！请检查邮箱完成验证。');
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
            }
        } catch (err: any) {
            setError(err.message || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-[#0d0d0f] flex items-center justify-center p-4">
            {/* Ambient Background */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />

            <div className="w-full max-w-md bg-[#1a1a1c] border border-white/10 rounded-3xl p-8 shadow-2xl relative z-10">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5KwM2 12l10 5 10-5" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">欢迎使用 KK Studio</h1>
                    <p className="text-zinc-400 text-sm">专业的 AI 创作工具</p>
                </div>

                <form onSubmit={handleAuth} className="space-y-4">
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-red-400 text-sm">
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}

                    {message && (
                        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center gap-2 text-green-400 text-sm">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                            {message}
                        </div>
                    )}

                    <div className="space-y-1">
                        <label className="text-xs text-zinc-400 ml-1">邮箱</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-[#2c2c2e] border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                            placeholder="name@example.com"
                            required
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs text-zinc-400 ml-1">密码</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-[#2c2c2e] border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                            placeholder="••••••••"
                            required
                            minLength={6}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl h-12 flex items-center justify-center transition-all mt-6 shadow-lg shadow-indigo-500/25 active:scale-[0.98]"
                    >
                        {loading ? (
                            <Loader2 size={20} className="animate-spin" />
                        ) : (
                            isSignUp ? '注册账号' : '立即登录'
                        )}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <button
                        onClick={() => {
                            setIsSignUp(!isSignUp);
                            setError(null);
                            setMessage(null);
                        }}
                        className="text-sm text-zinc-500 hover:text-white transition-colors"
                    >
                        {isSignUp ? '已有账号？去登录' : '没有账号？创建新账号'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LoginScreen;
