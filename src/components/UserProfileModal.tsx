import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { X, ChevronRight, User as UserIcon, Lock, LogOut, AlertTriangle, ChevronLeft, Loader2 } from 'lucide-react';

// Error Boundary
interface ErrorBoundaryState { hasError: boolean; error: Error | null; }
class ProfileErrorBoundary extends Component<{ children: ReactNode; onClose: () => void }, ErrorBoundaryState> {
    constructor(props: { children: ReactNode; onClose: () => void }) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error: Error): ErrorBoundaryState { return { hasError: true, error }; }
    componentDidCatch(error: Error, errorInfo: ErrorInfo) { console.error('[UserProfileModal] Render error:', error, errorInfo); }
    render() {
        if (this.state.hasError) {
            return (
                <div className="fixed inset-0 z-[10002] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-sm bg-[#1c1c1e] rounded-2xl shadow-2xl p-6 border border-zinc-800 text-center">
                        <AlertTriangle size={48} className="text-red-500 mx-auto mb-4" />
                        <h2 className="text-lg font-bold text-white mb-2">加载错误</h2>
                        <p className="text-sm text-zinc-400 mb-4">{this.state.error?.message}</p>
                        <button onClick={this.props.onClose} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm">关闭</button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export type UserProfileView = 'main' | 'change-password' | 'edit-profile';

interface UserProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User | null;
    onSignOut: () => void;
    initialView?: UserProfileView;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose, user, onSignOut, initialView = 'main' }) => {
    const [view, setView] = useState<UserProfileView>('main');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Profile Data
    const [displayName, setDisplayName] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');

    // Password Data
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    useEffect(() => {
        if (isOpen) {
            // Map legacy views to main if they don't exist anymore
            if ((initialView as string) === 'api-settings' || (initialView as string) === 'storage-settings') {
                setView('main');
            } else {
                setView(initialView);
            }

            if (user?.user_metadata) {
                setDisplayName(user.user_metadata.full_name || '');
                setAvatarUrl(user.user_metadata.avatar_url || '');
            }
        }
    }, [isOpen, initialView, user]);

    if (!isOpen) return null;

    const resetState = () => {
        setView('main');
        setMessage(null);
        setOldPassword(''); setNewPassword(''); setConfirmPassword('');
        setLoading(false);
    };

    const handleClose = () => { resetState(); onClose(); };

    // Handlers
    const handleUpdateProfile = async () => {
        setLoading(true); setMessage(null);
        try {
            const { error } = await supabase.auth.updateUser({ data: { full_name: displayName, avatar_url: avatarUrl } });
            if (error) throw error;
            setMessage({ type: 'success', text: '个人资料已更新' });
            setTimeout(() => setView('main'), 1000);
        } catch (e: any) { setMessage({ type: 'error', text: e.message || '更新失败' }); } finally { setLoading(false); }
    };

    const handleChangePassword = async () => {
        if (!user?.email || newPassword !== confirmPassword || newPassword.length < 6) {
            setMessage({ type: 'error', text: '密码输入无效或不一致' }); return;
        }
        setLoading(true); setMessage(null);
        try {
            const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password: oldPassword });
            if (signInError) throw new Error('旧密码错误');
            const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
            if (updateError) throw updateError;
            setMessage({ type: 'success', text: '密码已修改成功' });
            setTimeout(() => resetState(), 1500);
        } catch (e: any) { setMessage({ type: 'error', text: e.message || '修改失败' }); } finally { setLoading(false); }
    };

    const userAvatarUrl = user?.user_metadata?.avatar_url;

    return (
        <ProfileErrorBoundary onClose={onClose}>
            <div className="fixed inset-0 z-[10002] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in duration-200" onClick={handleClose}>
                <div
                    className="w-full max-w-sm rounded-2xl shadow-2xl border animate-in zoom-in-95 duration-200 overflow-hidden"
                    style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="w-full p-5">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-2">
                                {view !== 'main' && <button onClick={() => setView('main')}><ChevronLeft size={20} className="text-blue-500" /></button>}
                                <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                                    {view === 'main' ? '个人中心' : view === 'edit-profile' ? '编辑资料' : '修改密码'}
                                </h2>
                            </div>
                            <button onClick={handleClose} className="p-1.5 rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}><X size={16} /></button>
                        </div>

                        {message && (
                            <div className={`mb-4 p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                {message.text}
                            </div>
                        )}

                        {view === 'main' && (
                            <>
                                <div className="flex items-center gap-4 mb-6 p-4 rounded-xl border" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-light)' }}>
                                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xl font-bold text-white overflow-hidden">
                                        {userAvatarUrl ? <img src={userAvatarUrl} className="w-full h-full object-cover" /> : user?.email?.[0].toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{displayName || 'User'}</h3>
                                        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{user?.email}</p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <button onClick={() => setView('edit-profile')} className="w-full flex items-center justify-between p-3 rounded-xl transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
                                        <span className="flex items-center gap-3"><UserIcon size={16} /> 编辑资料</span> <ChevronRight size={14} />
                                    </button>
                                    <button onClick={() => setView('change-password')} className="w-full flex items-center justify-between p-3 rounded-xl transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
                                        <span className="flex items-center gap-3"><Lock size={16} /> 修改密码</span> <ChevronRight size={14} />
                                    </button>
                                    <button onClick={onSignOut} className="w-full flex items-center justify-between p-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-colors mt-4">
                                        <span className="flex items-center gap-3"><LogOut size={16} /> 退出登录</span>
                                    </button>
                                </div>
                            </>
                        )}

                        {(view === 'edit-profile' || view === 'change-password') && (
                            <div className="space-y-4 py-2">
                                {view === 'edit-profile' && (
                                    <>
                                        <div>
                                            <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>昵称 (Display Name)</label>
                                            <input value={displayName} onChange={e => setDisplayName(e.target.value)} className="w-full p-3 rounded-xl border outline-none" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', borderColor: 'var(--border-light)' }} placeholder="User Name" />
                                        </div>
                                        <div>
                                            <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>头像链接 (Avatar URL)</label>
                                            <input value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)} className="w-full p-3 rounded-xl border outline-none" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', borderColor: 'var(--border-light)' }} placeholder="https://..." />
                                        </div>
                                        <button onClick={handleUpdateProfile} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-xl text-white font-medium flex items-center justify-center gap-2 mt-4">
                                            {loading && <Loader2 size={16} className="animate-spin" />} 保存更改
                                        </button>
                                    </>
                                )}
                                {view === 'change-password' && (
                                    <>
                                        <div>
                                            <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>当前密码</label>
                                            <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} className="w-full p-3 rounded-xl border" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', borderColor: 'var(--border-light)' }} placeholder="Current Password" />
                                        </div>
                                        <div>
                                            <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>新密码 (6位以上)</label>
                                            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full p-3 rounded-xl border" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', borderColor: 'var(--border-light)' }} placeholder="New Password" />
                                        </div>
                                        <div>
                                            <label className="text-xs mb-1 block" style={{ color: 'var(--text-tertiary)' }}>确认新密码</label>
                                            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full p-3 rounded-xl border" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', borderColor: 'var(--border-light)' }} placeholder="Confirm Password" />
                                        </div>
                                        <button onClick={handleChangePassword} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-xl text-white font-medium flex items-center justify-center gap-2 mt-4">
                                            {loading && <Loader2 size={16} className="animate-spin" />} 确定修改
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </ProfileErrorBoundary>
    );
};

export default UserProfileModal;
