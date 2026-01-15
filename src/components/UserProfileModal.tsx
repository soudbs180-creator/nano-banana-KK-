import React, { useState, useEffect, useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { keyManager, KeySlot } from '../services/keyManager';
import { X, ChevronRight, Key, LogOut, User as UserIcon, Lock, Mail, ChevronLeft, Loader2, RefreshCw } from 'lucide-react';

export type UserProfileView = 'main' | 'change-password' | 'forgot-password' | 'api-settings' | 'edit-profile';

interface UserProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User | null;
    onSignOut: () => void;
    initialView?: UserProfileView;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({
    isOpen,
    onClose,
    user,
    onSignOut,
    initialView = 'main'
}) => {
    const [view, setView] = useState<UserProfileView>('main');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Profile Data State
    const [displayName, setDisplayName] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');

    // Change Password State
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // API Key State
    const [keySlots, setKeySlots] = useState<KeySlot[]>([]);
    const [newKey, setNewKey] = useState('');
    const [isAddingKey, setIsAddingKey] = useState(false);
    const [isValidatingKeys, setIsValidatingKeys] = useState(false);
    const [keyError, setKeyError] = useState<string | null>(null);

    // Reset view when opening
    useEffect(() => {
        if (isOpen) {
            setView(initialView);
            // Initialize profile data from user metadata
            if (user?.user_metadata) {
                setDisplayName(user.user_metadata.full_name || '');
                setAvatarUrl(user.user_metadata.avatar_url || '');
            }
        }
    }, [isOpen, initialView, user]);

    // Load API keys
    useEffect(() => {
        if (isOpen && view === 'api-settings') {
            const updateSlots = () => setKeySlots(keyManager.getSlots());
            updateSlots();
            return keyManager.subscribe(updateSlots);
        }
    }, [isOpen, view]);

    if (!isOpen) return null;

    const resetState = () => {
        setView('main');
        setMessage(null);
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setLoading(false);
        setKeyError(null);
        setNewKey('');
    };

    const handleClose = () => {
        resetState();
        onClose();
    };

    // --- Profile Update Logic ---
    const handleUpdateProfile = async () => {
        setLoading(true);
        setMessage(null);
        try {
            const { error } = await supabase.auth.updateUser({
                data: {
                    full_name: displayName,
                    avatar_url: avatarUrl
                }
            });

            if (error) throw error;
            setMessage({ type: 'success', text: '个人资料已更新' });
            setTimeout(() => setView('main'), 1000); // Return to main view after success
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message || '更新失败' });
        } finally {
            setLoading(false);
        }
    };

    // --- Password Logic ---
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
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: user.email,
                password: oldPassword
            });

            if (signInError) throw new Error('旧密码错误');

            const { error: updateError } = await supabase.auth.updateUser({
                password: newPassword
            });

            if (updateError) throw updateError;

            setMessage({ type: 'success', text: '密码修改成功' });
            setTimeout(() => resetState(), 1500);
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

    // --- API Key Logic ---
    const handleAddKey = async () => {
        if (!newKey.trim()) return;
        setIsAddingKey(true);
        setKeyError(null);

        const result = await keyManager.addKey(newKey);
        if (result.success) {
            setNewKey('');
            if (result.error) setKeyError(result.error);
        } else {
            setKeyError(result.error || '添加失败');
        }
        setIsAddingKey(false);
    };

    const handleRevalidateKeys = async () => {
        setIsValidatingKeys(true);
        await keyManager.revalidateAll();
        setIsValidatingKeys(false);
    };

    // --- UI Components ---
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

    const keyStats = keyManager.getStats();
    // Get display values
    const userDisplayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'KK User';
    const userAvatarUrl = user?.user_metadata?.avatar_url;
    const userInitial = user?.email?.[0].toUpperCase() || 'K';

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className={`w-full ${view === 'api-settings' ? 'max-w-md' : 'max-w-sm'} bg-[#1c1c1e] rounded-2xl shadow-2xl p-5 border border-zinc-800 animate-in zoom-in-95 duration-200 relative overflow-hidden transition-all`}>

                {view === 'main' && (
                    <>
                        <ModalHeader title="个人中心" />
                        <div className="flex items-center gap-4 mb-6 p-4 bg-zinc-800/50 rounded-xl border border-zinc-800 relative group cursor-pointer hover:bg-zinc-800/80 transition-colors" onClick={() => setView('edit-profile')}>
                            {/* Avatar */}
                            <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white shadow-lg overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-600 shrink-0">
                                {userAvatarUrl ? (
                                    <img src={userAvatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    userInitial
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-semibold text-white truncate flex items-center gap-2">
                                    {userDisplayName}
                                    <ChevronRight size={14} className="text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </h3>
                                <p className="text-xs text-zinc-400 truncate">{user?.email}</p>
                                <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-medium border border-emerald-500/20">
                                    Pro Plan
                                </div>
                            </div>
                        </div>
                        <div className="bg-zinc-800/30 rounded-xl mb-4 overflow-hidden border border-zinc-800/50">
                            <MenuItem icon={UserIcon} label="编辑个人资料" onClick={() => setView('edit-profile')} />
                            <MenuItem icon={Lock} label="账号安全 & 密码" onClick={() => setView('change-password')} />
                            <MenuItem icon={Key} label="API Key 设置" value={`${keyStats.valid} 个有效`} onClick={() => setView('api-settings')} />
                        </div>
                        <div className="bg-zinc-800/30 rounded-xl overflow-hidden border border-zinc-800/50">
                            <MenuItem icon={LogOut} label="退出当前账号" isDestructive onClick={onSignOut} />
                        </div>
                    </>
                )}

                {view === 'edit-profile' && (
                    <>
                        <ModalHeader title="编辑资料" backAction={() => setView('main')} />
                        <div className="space-y-4">
                            <div className="flex justify-center mb-6">
                                <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-lg overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-600 relative group">
                                    {avatarUrl ? (
                                        <img src={avatarUrl} alt="Avatar Preview" className="w-full h-full object-cover" />
                                    ) : (
                                        userInitial
                                    )}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs text-zinc-500 ml-1 mb-1 block">昵称 / Display Name</label>
                                    <input
                                        type="text"
                                        value={displayName}
                                        onChange={e => setDisplayName(e.target.value)}
                                        className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-all placeholder:text-zinc-600"
                                        placeholder="设置您的昵称"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-zinc-500 ml-1 mb-1 block">头像链接 / Avatar URL</label>
                                    <input
                                        type="text"
                                        value={avatarUrl}
                                        onChange={e => setAvatarUrl(e.target.value)}
                                        className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-all placeholder:text-zinc-600"
                                        placeholder="https://example.com/avatar.jpg"
                                    />
                                    <p className="text-[10px] text-zinc-500 mt-1 ml-1 line-clamp-1">
                                        * 支持任意图片直链，推荐使用正方形图片
                                    </p>
                                </div>
                            </div>

                            {message && (
                                <div className={`p-3 rounded-lg text-xs font-medium ${message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                    {message.text}
                                </div>
                            )}

                            <button onClick={handleUpdateProfile} disabled={loading} className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-4">
                                {loading && <Loader2 size={16} className="animate-spin" />}
                                {loading ? '保存中...' : '保存更改'}
                            </button>
                        </div>
                    </>
                )}

                {view === 'change-password' && (
                    <>
                        <ModalHeader title="修改密码" backAction={() => setView('main')} />
                        <div className="space-y-4">
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs text-zinc-500 ml-1 mb-1 block">旧密码</label>
                                    <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-all placeholder:text-zinc-600" placeholder="请输入当前使用的密码" />
                                </div>
                                <div>
                                    <label className="text-xs text-zinc-500 ml-1 mb-1 block">新密码</label>
                                    <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-all placeholder:text-zinc-600" placeholder="至少 6 位字符" />
                                </div>
                                <div>
                                    <label className="text-xs text-zinc-500 ml-1 mb-1 block">确认新密码</label>
                                    <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-all placeholder:text-zinc-600" placeholder="再次输入新密码" />
                                </div>
                            </div>
                            {message && (
                                <div className={`p-3 rounded-lg text-xs font-medium ${message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                    {message.text}
                                </div>
                            )}
                            <button onClick={handleChangePassword} disabled={loading || !oldPassword || !newPassword} className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                                {loading && <Loader2 size={16} className="animate-spin" />}
                                {loading ? '验证并更新...' : '更新密码'}
                            </button>
                            <div className="text-center pt-2">
                                <button onClick={() => setView('forgot-password')} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">忘记原密码？通过邮箱重置</button>
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
                            <p className="text-sm text-zinc-400 mb-6 px-4">我们将向 <b>{user?.email}</b> 发送一封包含密码重置链接的邮件。</p>
                            {message && (
                                <div className={`mb-4 p-3 rounded-lg text-xs font-medium text-left ${message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                    {message.text}
                                </div>
                            )}
                            <button onClick={handleForgotPassword} disabled={loading} className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                                {loading && <Loader2 size={16} className="animate-spin" />}
                                {loading ? '发送中...' : '发送验证邮件'}
                            </button>
                        </div>
                    </>
                )}

                {view === 'api-settings' && (
                    <>
                        <ModalHeader title="API Key 管理" backAction={() => setView('main')} />

                        {/* Stats */}
                        <div className="flex items-center gap-3 px-3 py-2 bg-zinc-800/30 rounded-lg mb-4 text-[10px] text-zinc-400 border border-zinc-800/50">
                            <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-green-500" />有效 {keyStats.valid}</div>
                            <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-red-500" />无效 {keyStats.invalid}</div>
                            <button onClick={handleRevalidateKeys} disabled={isValidatingKeys || keySlots.length === 0} className="ml-auto flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50">
                                {isValidatingKeys ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                                验证
                            </button>
                        </div>

                        {/* List */}
                        <div className="max-h-60 overflow-y-auto mb-4 space-y-2 pr-1 custom-scrollbar">
                            {keySlots.length === 0 ? (
                                <div className="text-center py-6 text-zinc-500 text-xs border border-dashed border-zinc-800 rounded-xl">
                                    暂无 API Key，请添加
                                </div>
                            ) : (
                                keySlots.map(slot => (
                                    <div key={slot.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${slot.status === 'valid' ? 'bg-green-500/5 border-green-500/20' : 'bg-zinc-800/30 border-zinc-800'}`}>
                                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${slot.status === 'valid' ? 'bg-green-500' : 'bg-red-500'}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-mono text-zinc-300 truncate">
                                                {slot.key.substring(0, 8)}...{slot.key.substring(slot.key.length - 4)}
                                            </div>
                                            <div className="text-[10px] text-zinc-500 mt-0.5">
                                                调用 {slot.successCount} · 失败 {slot.failCount}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => keyManager.toggleKey(slot.id)} className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors" title={slot.disabled ? "启用" : "禁用"}>
                                                {slot.disabled ? <Lock size={12} /> : <div className="w-3 h-3 rounded-full border border-current opacity-50" />}
                                            </button>
                                            <button onClick={() => keyManager.removeKey(slot.id)} className="p-1.5 text-zinc-400 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors" title="删除">
                                                <X size={12} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Input */}
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newKey}
                                onChange={e => setNewKey(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAddKey()}
                                placeholder="sk-..."
                                className="flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all font-mono placeholder:font-sans"
                            />
                            <button
                                onClick={handleAddKey}
                                disabled={isAddingKey || !newKey}
                                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-xl transition-all flex items-center gap-1"
                            >
                                {isAddingKey && <Loader2 size={10} className="animate-spin" />}
                                添加
                            </button>
                        </div>
                        {keyError && <div className="mt-2 text-[10px] text-red-400">{keyError}</div>}
                        <p className="mt-3 text-[10px] text-zinc-500 text-center">
                            前往 <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Google AI Studio</a> 获取 Key
                        </p>
                    </>
                )}

            </div>
        </div>
    );
};

export default UserProfileModal;
