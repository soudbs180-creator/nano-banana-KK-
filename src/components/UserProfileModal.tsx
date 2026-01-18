import React, { useState, useEffect, useCallback, Component, ErrorInfo, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { keyManager, KeySlot } from '../services/keyManager';
import { X, ChevronRight, Key, LogOut, User as UserIcon, Lock, Mail, ChevronLeft, Loader2, RefreshCw, AlertTriangle, Sparkles, Pencil, Trash2, LayoutDashboard, List, Activity, Settings as SettingsIcon, Plus, HardDrive, FolderOpen, Globe } from 'lucide-react';

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
                <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
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

export type UserProfileView = 'main' | 'change-password' | 'forgot-password' | 'api-settings' | 'edit-profile' | 'storage-settings';
type ApiTab = 'overview' | 'channels' | 'logs';

interface UserProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User | null;
    onSignOut: () => void;
    initialView?: UserProfileView;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose, user, onSignOut, initialView = 'main' }) => {
    // --- State Definitions (Restored) ---
    const [view, setView] = useState<UserProfileView>('main');
    const [apiTab, setApiTab] = useState<ApiTab>('overview');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Profile Data
    const [displayName, setDisplayName] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');

    // Password Data
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // API Key Data
    const [keySlots, setKeySlots] = useState<KeySlot[]>([]);
    const [newKey, setNewKey] = useState('');
    const [isAddingKey, setIsAddingKey] = useState(false);
    const [isValidatingKeys, setIsValidatingKeys] = useState(false);
    const [keyError, setKeyError] = useState<string | null>(null);
    const [tick, setTick] = useState(0);

    // Mobile Responsive State
    const [isMobile, setIsMobile] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(true);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Hooks
    useEffect(() => {
        if (isOpen && view === 'api-settings') {
            const timer = setInterval(() => setTick(t => t + 1), 1000);
            return () => clearInterval(timer);
        }
    }, [isOpen, view]);

    useEffect(() => {
        if (isOpen) {
            setView(initialView);
            setApiTab('overview');
            // On mobile: show menu first (mobileMenuOpen = true)
            // On desktop: show both sidebar and content (mobileMenuOpen doesn't matter for desktop layout)
            setMobileMenuOpen(isMobile);
            if (user?.user_metadata) {
                setDisplayName(user.user_metadata.full_name || '');
                setAvatarUrl(user.user_metadata.avatar_url || '');
            }
        }
    }, [isOpen, initialView, user, isMobile]);

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
        setOldPassword(''); setNewPassword(''); setConfirmPassword('');
        setLoading(false); setKeyError(null); setNewKey('');
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

    const handleAddKey = async () => {
        if (!newKey.trim()) return;
        setIsAddingKey(true); setKeyError(null);
        const result = await keyManager.addKey(newKey);
        if (result.success) {
            setNewKey('');
            if (result.error) setKeyError(result.error);
        } else { setKeyError(result.error || '添加失败'); }
        setIsAddingKey(false);
    };

    const handleRevalidateKeys = async () => {
        setIsValidatingKeys(true);
        await keyManager.revalidateAll();
        setIsValidatingKeys(false);
    };

    const formatDuration = (ms: number) => {
        if (ms <= 0) return '就绪';
        const s = Math.ceil(ms / 1000);
        if (s > 60) return `${Math.ceil(s / 60)}分`;
        return `${s}秒`;
    };

    const keyStats = keyManager.getStats ? keyManager.getStats() : { valid: 0, invalid: 0, disabled: 0, rateLimited: 0, total: 0 };
    const userDisplayName = user?.user_metadata?.full_name || '用户';
    const userAvatarUrl = user?.user_metadata?.avatar_url;

    const SideBarItem = ({ id, icon: Icon, label, active, onClick, isMobile }: { id: ApiTab, icon: any, label: string, active: boolean, onClick: (id: ApiTab) => void, isMobile: boolean }) => (
        <button
            onClick={() => onClick(id)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${active ? 'bg-blue-600 text-white shadow-md' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
        >
            <Icon size={16} />
            {label}
            {isMobile && <ChevronRight size={14} className="ml-auto opacity-50" />}
        </button>
    );

    const StatCard = ({ label, value, color, icon: Icon }: any) => (
        <div className="bg-[#1c1c1e] p-4 rounded-xl border border-zinc-800/50 shadow-sm flex flex-col justify-between h-24 relative overflow-hidden group">
            <div className={`absolute right-2 top-2 p-2 rounded-lg ${color} bg-opacity-10 text-opacity-100`}>
                <Icon size={18} className={color.replace('bg-', 'text-')} />
            </div>
            <span className="text-zinc-500 text-xs font-medium uppercase tracking-wider">{label}</span>
            <span className="text-2xl font-bold text-white font-mono">{value}</span>
            <div className={`absolute bottom-0 left-0 h-1 ${color} w-full opacity-50`} />
        </div>
    );

    // Storage Settings Panel Component
    const StorageSettingsPanel = ({ onBack }: { onBack: () => void }) => {
        const [currentMode, setCurrentMode] = React.useState<string | null>(null);
        const [isLoading, setIsLoading] = React.useState(true);
        const [isChanging, setIsChanging] = React.useState(false);

        React.useEffect(() => {
            (async () => {
                const { getStorageMode } = await import('../services/storagePreference');
                const mode = await getStorageMode();
                setCurrentMode(mode);
                setIsLoading(false);
            })();
        }, []);

        const handleChangeToLocal = async () => {
            setIsChanging(true);
            const { selectLocalFolder, setStorageMode } = await import('../services/storagePreference');
            const handle = await selectLocalFolder();
            if (handle) {
                await setStorageMode('local');
                setCurrentMode('local');
            }
            setIsChanging(false);
        };

        const handleChangeToBrowser = async () => {
            setIsChanging(true);
            const { setStorageMode } = await import('../services/storagePreference');
            await setStorageMode('browser');
            setCurrentMode('browser');
            setIsChanging(false);
        };

        return (
            <div className="space-y-4 text-left">
                <p className="text-sm text-zinc-400 mb-4">原图存储位置决定了图片的保存方式</p>

                {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="animate-spin text-zinc-500" size={24} />
                    </div>
                ) : (
                    <>
                        {/* Current Mode Display */}
                        <div className="p-4 bg-zinc-800/50 rounded-xl border border-zinc-700">
                            <span className="text-xs text-zinc-500 uppercase">当前存储模式</span>
                            <div className="flex items-center gap-2 mt-1">
                                {currentMode === 'local' ? (
                                    <><FolderOpen size={18} className="text-blue-400" /><span className="text-white font-medium">本地文件夹</span></>
                                ) : (
                                    <><Globe size={18} className="text-indigo-400" /><span className="text-white font-medium">浏览器存储</span></>
                                )}
                            </div>
                        </div>

                        {/* Change Options */}
                        <div className="space-y-2">
                            {currentMode !== 'local' && (
                                <button
                                    onClick={handleChangeToLocal}
                                    disabled={isChanging}
                                    className="w-full flex items-center justify-between p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-colors disabled:opacity-50"
                                >
                                    <span className="flex items-center gap-3"><FolderOpen size={16} /> 切换到本地文件夹</span>
                                    {isChanging ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
                                </button>
                            )}
                            {currentMode !== 'browser' && (
                                <button
                                    onClick={handleChangeToBrowser}
                                    disabled={isChanging}
                                    className="w-full flex items-center justify-between p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-colors disabled:opacity-50"
                                >
                                    <span className="flex items-center gap-3"><Globe size={16} /> 切换到浏览器存储</span>
                                    {isChanging ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
                                </button>
                            )}
                        </div>

                        {/* Info */}
                        <div className="p-3 bg-zinc-900 rounded-lg text-xs text-zinc-500">
                            <strong className="text-zinc-400">提示：</strong>缩略图始终同步到云端，切换模式不影响已有图片。
                        </div>
                    </>
                )}
            </div>
        );
    };

    return (
        <ProfileErrorBoundary onClose={onClose}>
            <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200" onClick={handleClose}>
                <div
                    className={`bg-[#000000] rounded-2xl shadow-2xl border border-zinc-800/50 animate-in zoom-in-95 duration-200 overflow-hidden flex transition-all ease-out
                        ${view === 'api-settings' ? 'w-[900px] h-[600px] max-w-[95vw]' : 'w-full max-w-sm'}`}
                    onClick={e => e.stopPropagation()}
                >

                    {/* Standard Profile Views (Small) */}
                    {view !== 'api-settings' && (
                        <div className="w-full p-5">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-2">
                                    {view !== 'main' && <button onClick={() => setView('main')}><ChevronLeft size={20} className="text-blue-500" /></button>}
                                    <h2 className="text-xl font-bold text-white">
                                        {view === 'main' ? '个人中心' : view === 'edit-profile' ? '编辑资料' : view === 'change-password' ? '修改密码' : '重置密码'}
                                    </h2>
                                </div>
                                <button onClick={handleClose} className="p-1.5 bg-zinc-800 rounded-full text-zinc-400 hover:text-white"><X size={16} /></button>
                            </div>

                            {view === 'main' && (
                                <>
                                    <div className="flex items-center gap-4 mb-6 p-4 bg-zinc-900 rounded-xl border border-zinc-800 cursor-pointer hover:bg-zinc-800 transition-colors" onClick={() => setView('edit-profile')}>
                                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xl font-bold text-white overflow-hidden">
                                            {userAvatarUrl ? <img src={userAvatarUrl} className="w-full h-full object-cover" /> : user?.email?.[0].toUpperCase()}
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-semibold text-white">{displayName || 'User'}</h3>
                                            <p className="text-xs text-zinc-400">{user?.email}</p>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <button onClick={() => setView('edit-profile')} className="w-full flex items-center justify-between p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-colors">
                                            <span className="flex items-center gap-3"><UserIcon size={16} /> 编辑资料</span> <ChevronRight size={14} />
                                        </button>
                                        <button onClick={() => setView('change-password')} className="w-full flex items-center justify-between p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-colors">
                                            <span className="flex items-center gap-3"><Lock size={16} /> 安全设置</span> <ChevronRight size={14} />
                                        </button>
                                        <button onClick={() => setView('api-settings')} className="w-full flex items-center justify-between p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-colors">
                                            <span className="flex items-center gap-3"><LayoutDashboard size={16} /> One API 面板</span> <ChevronRight size={14} />
                                        </button>
                                        <button onClick={() => setView('storage-settings')} className="w-full flex items-center justify-between p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-colors">
                                            <span className="flex items-center gap-3"><HardDrive size={16} /> 存储位置</span> <ChevronRight size={14} />
                                        </button>
                                        <button onClick={onSignOut} className="w-full flex items-center justify-between p-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-colors mt-4">
                                            <span className="flex items-center gap-3"><LogOut size={16} /> 退出登录</span>
                                        </button>
                                    </div>
                                </>
                            )}

                            {(view === 'edit-profile' || view === 'change-password' || view === 'storage-settings') && (
                                <div className="text-center text-zinc-500 py-10">
                                    {view === 'edit-profile' && (
                                        <div className="space-y-4">
                                            <input value={displayName} onChange={e => setDisplayName(e.target.value)} className="w-full bg-zinc-900 p-3 rounded-xl text-white border border-zinc-800" placeholder="昵称 / Display Name" />
                                            <input value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)} className="w-full bg-zinc-900 p-3 rounded-xl text-white border border-zinc-800" placeholder="头像链接 / Avatar URL" />
                                            <button onClick={handleUpdateProfile} className="w-full bg-blue-600 py-2 rounded-xl text-white">保存更改</button>
                                        </div>
                                    )}
                                    {view === 'change-password' && (
                                        <div className="space-y-4">
                                            <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} className="w-full bg-zinc-900 p-3 rounded-xl text-white border border-zinc-800" placeholder="当前密码" />
                                            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full bg-zinc-900 p-3 rounded-xl text-white border border-zinc-800" placeholder="新密码 (至少6位)" />
                                            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full bg-zinc-900 p-3 rounded-xl text-white border border-zinc-800" placeholder="确认新密码" />
                                            <button onClick={handleChangePassword} className="w-full bg-blue-600 py-2 rounded-xl text-white">更新密码</button>
                                        </div>
                                    )}
                                    {view === 'storage-settings' && (
                                        <StorageSettingsPanel onBack={() => setView('main')} />
                                    )}
                                </div>
                            )}
                        </div>
                    )}


                    {/* --- MAC DASHBOARD VIEW --- */}
                    {view === 'api-settings' && (
                        <div className="flex w-full h-full bg-[#0d0d0e] overflow-hidden">
                            {/* Sidebar: On mobile toggles full-screen, on desktop fixed width */}
                            <div className={`
                                ${isMobile ? (mobileMenuOpen ? 'flex w-full' : 'hidden') : 'flex w-64'}
                                bg-[#161618] border-r border-white/5 flex-col p-4 shrink-0 transition-all
                            `}>
                                <div className="flex items-center gap-3 px-2 mb-8 mt-2">
                                    <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                                        <LayoutDashboard size={18} />
                                    </div>
                                    <span className="font-bold text-white tracking-tight">One API</span>
                                </div>

                                <div className="space-y-1 flex-1">
                                    <div className="px-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">平台管理</div>
                                    <SideBarItem
                                        id="overview"
                                        icon={LayoutDashboard}
                                        label="概览 (Overview)"
                                        active={apiTab === 'overview'}
                                        onClick={(id) => { setApiTab(id); if (isMobile) setMobileMenuOpen(false); }}
                                        isMobile={isMobile}
                                    />
                                    <SideBarItem
                                        id="channels"
                                        icon={List}
                                        label="渠道 (Channels)"
                                        active={apiTab === 'channels'}
                                        onClick={(id) => { setApiTab(id); if (isMobile) setMobileMenuOpen(false); }}
                                        isMobile={isMobile}
                                    />
                                    <SideBarItem
                                        id="logs"
                                        icon={Activity}
                                        label="日志 (Logs)"
                                        active={apiTab === 'logs'}
                                        onClick={(id) => { setApiTab(id); if (isMobile) setMobileMenuOpen(false); }}
                                        isMobile={isMobile}
                                    />
                                </div>

                                <div className="pt-4 border-t border-white/5">
                                    <div className="px-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">系统设置</div>
                                    <button onClick={() => setView('main')} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all">
                                        <SettingsIcon size={16} />
                                        返回设置
                                    </button>
                                </div>
                            </div>

                            {/* Content Area: On mobile toggles visibility, on desktop always visible */}
                            <div className={`
                                ${isMobile ? (mobileMenuOpen ? 'hidden' : 'flex') : 'flex'}
                                flex-1 flex-col min-w-0 bg-[#0d0d0e]
                            `}>
                                {/* Header */}
                                <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#0d0d0e]/50 backdrop-blur-xl z-10 sticky top-0">
                                    <div className="flex items-center gap-2">
                                        {/* Back Button (Mobile Only) */}
                                        {isMobile && (
                                            <button onClick={() => setMobileMenuOpen(true)} className="mr-2 p-1.5 bg-zinc-800 rounded-lg text-zinc-400">
                                                <ChevronLeft size={16} />
                                            </button>
                                        )}
                                        <h2 className="text-lg font-semibold text-white">
                                            {apiTab === 'overview' ? '仪表盘 (Dashboard)' : apiTab === 'channels' ? '渠道管理 (Channels)' : '系统日志 (Logs)'}
                                        </h2>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button onClick={handleRevalidateKeys} disabled={isValidatingKeys} className="p-2 text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-800 rounded-lg transition-colors">
                                            <RefreshCw size={16} className={isValidatingKeys ? "animate-spin" : ""} />
                                        </button>
                                        <button onClick={handleClose} className="p-2 text-zinc-400 hover:text-white hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-colors">
                                            <X size={18} />
                                        </button>
                                    </div>
                                </div>

                                {/* Scrollable Content */}
                                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">

                                    {/* OVERVIEW TAB */}
                                    {apiTab === 'overview' && (
                                        <div className="space-y-6">
                                            <div className="grid grid-cols-4 gap-4">
                                                <StatCard label="总渠道数" value={keyStats.total} color="bg-blue-500" icon={Key} />
                                                <StatCard label="可用状态" value={keyStats.valid} color="bg-emerald-500" icon={Sparkles} />
                                                <StatCard label="异常状态" value={keyStats.invalid} color="bg-red-500" icon={AlertTriangle} />
                                                <StatCard label="系统在线率" value="99.9%" color="bg-indigo-500" icon={Activity} />
                                            </div>

                                            <div className="grid grid-cols-2 gap-6 h-64">
                                                <div className="bg-[#1c1c1e] rounded-xl border border-zinc-800/50 p-5 flex flex-col">
                                                    <h3 className="text-sm font-medium text-zinc-400 mb-4">请求量统计 (24h)</h3>
                                                    <div className="flex-1 flex items-end justify-between gap-1 px-2">
                                                        {/* Mock Chart Bars */}
                                                        {[30, 45, 25, 60, 75, 50, 80, 40, 55, 70, 65, 90].map((h, i) => (
                                                            <div key={i} className="w-full bg-blue-600/20 hover:bg-blue-500 rounded-t-sm transition-all relative group" style={{ height: `${h}%` }}>
                                                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                                                    {h} 次
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="bg-[#1c1c1e] rounded-xl border border-zinc-800/50 p-5">
                                                    <h3 className="text-sm font-medium text-zinc-400 mb-4">系统健康状态</h3>
                                                    <div className="space-y-4">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-sm text-zinc-300">API 平均延迟</span>
                                                            <span className="text-sm font-mono text-emerald-400">45ms</span>
                                                        </div>
                                                        <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                                                            <div className="bg-emerald-500 h-full w-[15%]" />
                                                        </div>
                                                        <div className="flex items-center justify-between mt-2">
                                                            <span className="text-sm text-zinc-300">配额总使用率</span>
                                                            <span className="text-sm font-mono text-blue-400">12%</span>
                                                        </div>
                                                        <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                                                            <div className="bg-blue-500 h-full w-[12%]" />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* CHANNELS TAB */}
                                    {apiTab === 'channels' && (
                                        <div className="space-y-4">
                                            {/* Toolbar */}
                                            <div className="flex gap-2">
                                                <div className="relative flex-1">
                                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"><Key size={14} /></div>
                                                    <input
                                                        value={newKey}
                                                        onChange={e => setNewKey(e.target.value)}
                                                        onKeyDown={e => e.key === 'Enter' && handleAddKey()}
                                                        placeholder="输入 API Key 以添加新渠道 (sk-...)"
                                                        className="w-full bg-[#1c1c1e] border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono transition-all"
                                                    />
                                                </div>
                                                <button
                                                    onClick={handleAddKey}
                                                    disabled={isAddingKey || !newKey}
                                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                                                >
                                                    {isAddingKey ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                                    添加渠道
                                                </button>
                                            </div>

                                            {/* Channels List (The refined horizontal strip) */}
                                            <div className="space-y-2">
                                                {keySlots.length === 0 ? (
                                                    <div className="text-center py-20 text-zinc-500">暂无配置渠道</div>
                                                ) : (
                                                    keySlots.map(slot => {
                                                        const hasQuota = slot.quota && slot.quota.limitRequests > 0;
                                                        const percent = hasQuota ? (slot.quota!.remainingRequests / slot.quota!.limitRequests) * 100 : 0;
                                                        const isHealth = slot.status === 'valid';

                                                        return (
                                                            <div key={slot.id} className="group flex items-center gap-4 p-3 bg-[#1c1c1e] border border-zinc-800/50 hover:border-zinc-700 rounded-xl transition-all">
                                                                <div className={`w-2 h-2 rounded-full ${isHealth ? 'bg-emerald-500' : 'bg-red-500'}`} />

                                                                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400">
                                                                    <Sparkles size={16} />
                                                                </div>

                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <span className="text-sm font-medium text-white truncate">Google Gemini</span>
                                                                        <span className="text-xs font-mono text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded">...{slot.key.slice(-4)}</span>
                                                                    </div>
                                                                    {hasQuota ? (
                                                                        <div className="flex items-center gap-2 w-full max-w-[200px]">
                                                                            <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                                                                                <div style={{ width: `${percent}%` }} className={`h-full rounded-full ${percent < 20 ? 'bg-red-500' : 'bg-blue-500'}`} />
                                                                            </div>
                                                                            <span className="text-[10px] text-zinc-500 font-mono">{percent.toFixed(0)}%</span>
                                                                        </div>
                                                                    ) : <span className="text-[10px] text-zinc-600">暂无配额数据</span>}

                                                                    {/* Token Usage Badge */}
                                                                    {slot.usedTokens !== undefined && slot.usedTokens > 0 && (
                                                                        <div className="mt-1 flex items-center gap-1">
                                                                            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Used:</span>
                                                                            <span className="text-xs font-mono text-indigo-400">{slot.usedTokens.toLocaleString()} Tokens</span>
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                <div className="text-right">
                                                                    <div className="text-xs text-zinc-300 font-mono">{hasQuota ? slot.quota?.remainingRequests : '--'}</div>
                                                                    <div className="text-[10px] text-zinc-600">剩余请求</div>
                                                                </div>

                                                                <div className="flex items-center gap-2 pl-4 border-l border-zinc-800 ml-2">
                                                                    <button onClick={() => keyManager.toggleKey(slot.id)} className={`p-2 rounded-lg transition-colors ${!slot.disabled ? 'text-emerald-500 bg-emerald-500/10' : 'text-zinc-600 bg-zinc-800'} hover:bg-opacity-20`}>
                                                                        <Activity size={16} />
                                                                    </button>
                                                                    <button onClick={() => { if (confirm('确认删除该渠道?')) keyManager.removeKey(slot.id); }} className="p-2 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors">
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* LOGS TAB */}
                                    {apiTab === 'logs' && (
                                        <div className="border border-zinc-800 rounded-xl overflow-hidden min-h-[300px] flex flex-col">
                                            <table className="w-full text-sm text-left">
                                                <thead className="bg-[#1c1c1e] text-zinc-400 border-b border-zinc-800">
                                                    <tr>
                                                        <th className="px-4 py-3 font-medium">时间</th>
                                                        <th className="px-4 py-3 font-medium">类型</th>
                                                        <th className="px-4 py-3 font-medium">模型</th>
                                                        <th className="px-4 py-3 font-medium text-right">消耗 Tokens</th>
                                                        <th className="px-4 py-3 font-medium text-right">状态</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-zinc-800">
                                                    {/* Empty State */}
                                                    <tr>
                                                        <td colSpan={5} className="py-20 text-center text-zinc-500">
                                                            <div className="flex flex-col items-center justify-center gap-2">
                                                                <Activity size={32} className="opacity-20" />
                                                                <span>暂无调用日志</span>
                                                                <span className="text-[10px] text-zinc-600">本地模式下暂不记录详细消耗统计</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </ProfileErrorBoundary>
    );
};

export default UserProfileModal;
