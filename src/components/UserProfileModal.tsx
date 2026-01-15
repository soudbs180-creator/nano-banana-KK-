import React, { useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { X, ChevronRight, Key, LogOut, User as UserIcon, Lock, Mail, ChevronLeft, Loader2 } from 'lucide-react';

interface UserProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User | null;
    onSignOut: () => void;
    onOpenApiSettings: () => void;
}

type View = 'main' | 'change-password' | 'forgot-password';

const UserProfileModal: React.FC<UserProfileModalProps> = ({
    isOpen,
    onClose,
    user,
    onSignOut,
    onOpenApiSettings
}) => {
    const [view, setView] = useState<View>('main');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Change Password State
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    if (!isOpen) return null;

    const resetState = () => {
        setView('main');
        setMessage(null);
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setLoading(false);
    };

    const handleClose = () => {
        resetState();
        onClose();
    };

    const handleChangePassword = async () => {
        if (!user || !user.email) return;
        if (newPassword !== confirmPassword) {
            setMessage({ type: 'error', text: '两次输入的新密码不一致' });
            return;
        }
        if (newPassword.length < 6) {
            setMessage({ type: 'error', text: '密码长度至少需要6位' });
            return;
        }

        setLoading(true);
        setMessage(null);

        try {
            // Verify old password by signing in
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: user.email,
                password: oldPassword
            });

            if (signInError) {
                throw new Error('旧密码错误');
            }

            // Update to new password
            const { error: updateError } = await supabase.auth.updateUser({
                password: newPassword
            });

            if (updateError) throw updateError;

            setMessage({ type: 'success', text: '密码修改成功' });
            setTimeout(() => {
                resetState();
            }, 1500);
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message || '修改失败，请重试' });
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = async () => {
        if (!user || !user.email) return;
        setLoading(true);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
                redirectTo: window.location.origin,
            });
            if (error) throw error;
            setMessage({ type: 'success', text: '重置邮件已发送，请检查您的邮箱' });
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message || '发送失败' });
        } finally {
            setLoading(false);
        }
    };

    // UI Components
    const ModalHeader = ({ title, backAction }: { title: string, backAction?: () => void }) => (
        <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
                {backAction && (
                    <button onClick={backAction} className="p-1 hover:bg-white/10 rounded-full transition-colors -ml-2">
                        <ChevronLeft size={20} className="text-blue-500" />
                    </button>
                )}
                <h2 className="text-xl font-bold text-white">{title}</h2>
            </div>
            <button
                onClick={handleClose}
                className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-full transition-colors"
                aria-label="关闭"
            >
                <X size={16} />
            </button>
        </div>
    );

    const MenuItem = ({ icon: Icon, label, value, onClick, isDestructive = false }: any) => (
        <button
            onClick={onClick}
            className="w-full flex items-center justify-between p-3.5 hover:bg-white/5 transition-colors active:bg-white/10 first:rounded-t-xl last:rounded-b-xl border-b border-zinc-800 last:border-0"
        >
            <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-md ${isDestructive ? 'bg-red-500/20 text-red-500' : 'bg-blue-500/20 text-blue-500'}`}>
                    <Icon size={16} />
                </div>
                <span className={`text-sm font-medium ${isDestructive ? 'text-red-500' : 'text-zinc-200'}`}>{label}</span>
            </div>
            <div className="flex items-center gap-2">
                {value && <span className="text-xs text-zinc-500">{value}</span>}
                <ChevronRight size={14} className="text-zinc-600" />
            </div>
        </button>
    );

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-sm bg-[#1c1c1e] rounded-2xl shadow-2xl p-5 border border-zinc-800 animate-in zoom-in-95 duration-200 relative overflow-hidden">

                {view === 'main' && (
                    <>
                        <ModalHeader title="个人中心" />

                        {/* Profile Card */}
                        <div className="flex items-center gap-4 mb-6 p-4 bg-zinc-800/50 rounded-xl border border-zinc-800">
                            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-lg">
                                {user?.email?.[0].toUpperCase() || 'K'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-semibold text-white truncate">
                                    {user?.email?.split('@')[0] || 'KK User'}
                                </h3>
                                <p className="text-xs text-zinc-400 truncate">{user?.email}</p>
                                <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-medium border border-emerald-500/20">
                                    Pro Plan
                                </div>
                            </div>
                        </div>

                        {/* Settings Group 1 */}
                        <div className="bg-zinc-800/30 rounded-xl mb-4 overflow-hidden border border-zinc-800/50">
                            <MenuItem
                                icon={Lock}
                                label="账号安全 & 密码"
                                onClick={() => setView('change-password')}
                            />
                            <MenuItem
                                icon={Key}
                                label="API Key 设置"
                                onClick={onOpenApiSettings}
                            />
                        </div>

                        {/* Settings Group 2 */}
                        <div className="bg-zinc-800/30 rounded-xl overflow-hidden border border-zinc-800/50">
                            <MenuItem
                                icon={LogOut}
                                label="退出当前账号"
                                isDestructive
                                onClick={onSignOut}
                            />
                        </div>
                    </>
                )}

                {view === 'change-password' && (
                    <>
                        <ModalHeader title="修改密码" backAction={() => { resetState(); }} />

                        <div className="space-y-4">
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs text-zinc-500 ml-1 mb-1 block">旧密码</label>
                                    <input
                                        type="password"
                                        value={oldPassword}
                                        onChange={e => setOldPassword(e.target.value)}
                                        className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-zinc-600"
                                        placeholder="请输入当前使用的密码"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-zinc-500 ml-1 mb-1 block">新密码</label>
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-zinc-600"
                                        placeholder="至少 6 位字符"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-zinc-500 ml-1 mb-1 block">确认新密码</label>
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-zinc-600"
                                        placeholder="再次输入新密码"
                                    />
                                </div>
                            </div>

                            {message && (
                                <div className={`p-3 rounded-lg text-xs font-medium ${message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                    {message.text}
                                </div>
                            )}

                            <button
                                onClick={handleChangePassword}
                                disabled={loading || !oldPassword || !newPassword}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                            >
                                {loading && <Loader2 size={16} className="animate-spin" />}
                                {loading ? '验证并更新...' : '更新密码'}
                            </button>

                            <div className="text-center pt-2">
                                <button
                                    onClick={() => setView('forgot-password')}
                                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                                >
                                    忘记原密码？通过邮箱重置
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {view === 'forgot-password' && (
                    <>
                        <ModalHeader title="重置密码" backAction={() => setView('change-password')} />

                        <div className="text-center py-6">
                            <div className="w-16 h-16 bg-blue-500/20 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Mail size={32} />
                            </div>
                            <h3 className="text-lg font-medium text-white mb-2">发送重置邮件</h3>
                            <p className="text-sm text-zinc-400 mb-6 px-4">
                                我们将向 <b>{user?.email}</b> 发送一封包含密码重置链接的邮件。
                            </p>

                            {message && (
                                <div className={`mb-4 p-3 rounded-lg text-xs font-medium text-left ${message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                    {message.text}
                                </div>
                            )}

                            <button
                                onClick={handleForgotPassword}
                                disabled={loading}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                            >
                                {loading && <Loader2 size={16} className="animate-spin" />}
                                {loading ? '发送中...' : '发送验证邮件'}
                            </button>
                        </div>
                    </>
                )}

            </div>
        </div>
    );
};

export default UserProfileModal;
