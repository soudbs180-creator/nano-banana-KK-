import React, { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
// Lucide icons replaced with SVGs

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenSettings: () => void;
    hasApiKey: boolean;
    generatedCount: number;
    user: User | null;
    onSignOut: () => void;
    onOpenProfile: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
    isOpen,
    onClose,
    onOpenSettings,
    hasApiKey,
    generatedCount,
    user,
    onSignOut,
    onOpenProfile
}) => {
    // Auto-retract on mobile after 4s
    useEffect(() => {
        if (isOpen && window.innerWidth < 768) {
            const timer = setTimeout(onClose, 4000);
            return () => clearTimeout(timer);
        }
    }, [isOpen, onClose]);

    const [activeTab, setActiveTab] = useState<'home' | 'history'>('home');

    return (
        <>
            {/* Overlay for mobile */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity"
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`sidebar fixed inset-y-0 left-0 z-50 transition-all duration-300 md:translate-x-0 ${isOpen ? 'translate-x-0 w-[280px]' : '-translate-x-full w-[280px] md:w-0 md:opacity-0'
                    }`}
                style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderRight: '1px solid var(--border-light)'
                }}
            >
                {/* Header */}
                <div className="sidebar-header" style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <div className="sidebar-logo">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-white">
                            <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M17 4a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2" fill="currentColor" stroke="none" />
                            <path d="M19 11h2m-1 -1v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <span className="sidebar-title" style={{ fontFamily: 'var(--font-sans)', letterSpacing: '-0.02em' }}>KK Studio</span>
                    <button
                        onClick={onClose}
                        className="ml-auto p-2 rounded-lg transition-all"
                        style={{ color: 'var(--text-tertiary)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.backgroundColor = 'var(--toolbar-hover)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6" />
                        </svg>
                    </button>
                </div>

                {/* Navigation */}
                <nav className="sidebar-nav scrollbar-hide">
                    {/* Main Actions */}
                    <div className="mb-6 space-y-1">
                        <button
                            className={`sidebar-nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${activeTab === 'home' ? 'active' : ''}`}
                            onClick={(e) => { e.currentTarget.blur(); setActiveTab('home'); }}
                            style={{
                                backgroundColor: activeTab === 'home' ? 'var(--toolbar-active)' : 'transparent',
                                color: activeTab === 'home' ? 'var(--text-primary)' : 'var(--text-secondary)'
                            }}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <polyline points="21 15 16 10 5 21" />
                            </svg>
                            <span className="font-medium text-sm">图像生成</span>
                        </button>
                        <button
                            className={`sidebar-nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${activeTab === 'history' ? 'active' : ''}`}
                            onClick={(e) => { e.currentTarget.blur(); setActiveTab('history'); }}
                            style={{
                                backgroundColor: activeTab === 'history' ? 'var(--toolbar-active)' : 'transparent',
                                color: activeTab === 'history' ? 'var(--text-primary)' : 'var(--text-secondary)'
                            }}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 8v4l3 3" />
                                <circle cx="12" cy="12" r="9" />
                            </svg>
                            <span className="font-medium text-sm">历史记录</span>
                            {generatedCount > 0 && (
                                <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ backgroundColor: 'var(--accent-indigo)', color: 'white' }}>
                                    {generatedCount}
                                </span>
                            )}
                        </button>
                        {/* 
                        <button
                            className="sidebar-nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
                            style={{ color: 'var(--text-secondary)' }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--toolbar-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            </svg>
                            <span className="font-medium text-sm">项目收藏</span>
                        </button>
                        */}
                    </div>

                    {/* Placeholder for history list when history tab is active */}
                    {activeTab === 'history' && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-left-4 duration-300">
                            <div className="px-3 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
                                最近生成
                            </div>
                            <div className="px-3 py-12 text-center flex flex-col items-center justify-center border border-dashed rounded-2xl" style={{ borderColor: 'var(--border-light)', color: 'var(--text-muted)' }}>
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-3 opacity-50">
                                    <path d="M12 8v4l3 3" />
                                    <circle cx="12" cy="12" r="9" />
                                </svg>
                                <p className="text-xs font-medium">暂无历史记录</p>
                            </div>
                        </div>
                    )}
                </nav>

                {/* Footer */}
                <div className="sidebar-footer" style={{ borderTop: '1px solid var(--border-light)' }}>
                    {/* User Section */}
                    <div className="p-2 rounded-xl mb-2 transition-colors" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                        <div className="flex items-center gap-3 mb-3 p-1">
                            <div className="sidebar-avatar relative shrink-0 overflow-hidden cursor-pointer hover:scale-105 transition-transform" onClick={onOpenProfile} role="button">
                                {user?.user_metadata?.avatar_url ? (
                                    <img src={user.user_metadata.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold">
                                        {user?.email?.[0].toUpperCase() || 'K'}
                                    </div>
                                )}
                                {/* Status indicator */}
                                <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#18181B] ${hasApiKey ? 'bg-emerald-500' : 'bg-red-500'
                                    }`} />
                            </div>
                            <div className="flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity" onClick={onOpenProfile} role="button">
                                <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                                    {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Guest'}
                                </p>
                                <p className="text-[10px] truncate" style={{ color: 'var(--text-tertiary)' }}>{user?.email || 'No email'}</p>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={onOpenSettings}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold transition-all hover:brightness-110 active:scale-95"
                                style={{
                                    backgroundColor: hasApiKey ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                    color: hasApiKey ? 'var(--accent-green)' : 'var(--accent-orange)'
                                }}
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="7.5" cy="15.5" r="5.5" />
                                    <path d="m21 2-9.6 9.6" />
                                    <path d="m15.5 7.5 3 3L22 7l-3-3" />
                                </svg>
                                {hasApiKey ? '已配置密钥' : '配置密钥'}
                            </button>

                            <button
                                onClick={onSignOut}
                                className="px-3 py-2 rounded-lg transition-all hover:bg-red-500/20 hover:text-red-400 active:scale-95"
                                style={{ backgroundColor: 'var(--toolbar-hover)', color: 'var(--text-tertiary)' }}
                                title="退出登录"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                    <polyline points="16 17 21 12 16 7" />
                                    <line x1="21" y1="12" x2="9" y2="12" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </aside >
        </>
    );
};

export default Sidebar;
