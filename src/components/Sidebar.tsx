import React, { useState } from 'react';
// Lucide icons replaced with SVGs

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenSettings: () => void;
    hasApiKey: boolean;
    generatedCount: number;
}

const Sidebar: React.FC<SidebarProps> = ({
    isOpen,
    onClose,
    onOpenSettings,
    hasApiKey,
    generatedCount
}) => {
    const [activeTab, setActiveTab] = useState<'home' | 'history'>('home');

    return (
        <>
            {/* Overlay for mobile */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`sidebar fixed md:relative z-50 transition-all duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:w-0 md:opacity-0'
                    }`}
                style={{ width: isOpen ? 280 : 0 }}
            >
                {/* Header */}
                <div className="sidebar-header">
                    <div className="sidebar-logo">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-indigo-500">
                            <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M17 4a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2" fill="currentColor" stroke="none" />
                            <path d="M19 11h2m-1 -1v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <span className="sidebar-title font-semibold tracking-tight">KK Studio</span>
                    <button
                        onClick={onClose}
                        className="ml-auto p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors group"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-x-0.5 transition-transform">
                            <polyline points="15 18 9 12 15 6" />
                        </svg>
                    </button>
                </div>

                {/* Navigation */}
                <nav className="sidebar-nav scrollbar-hide">
                    {/* Main Actions */}
                    <div className="mb-4 space-y-1">
                        <button
                            className={`sidebar-nav-item ${activeTab === 'home' ? 'active' : ''}`}
                            onClick={() => setActiveTab('home')}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <polyline points="21 15 16 10 5 21" />
                            </svg>
                            <span>图像生成</span>
                        </button>
                        <button
                            className={`sidebar-nav-item ${activeTab === 'history' ? 'active' : ''}`}
                            onClick={() => setActiveTab('history')}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 8v4l3 3" />
                                <circle cx="12" cy="12" r="9" />
                            </svg>
                            <span>历史记录</span>
                            {generatedCount > 0 && (
                                <span className="ml-auto text-[10px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full font-medium">
                                    {generatedCount}
                                </span>
                            )}
                        </button>
                        <button className="sidebar-nav-item">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            </svg>
                            <span>项目收藏</span>
                        </button>
                    </div>

                    {/* Placeholder for history list when history tab is active */}
                    {activeTab === 'history' && (
                        <div className="space-y-2">
                            <div className="px-3 py-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                                最近生成
                            </div>
                            <div className="px-3 py-8 text-center text-zinc-600 text-xs flex flex-col items-center">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 opacity-20">
                                    <path d="M12 8v4l3 3" />
                                    <circle cx="12" cy="12" r="9" />
                                </svg>
                                <p>暂无历史记录</p>
                            </div>
                        </div>
                    )}
                </nav>

                {/* Footer */}
                <div className="sidebar-footer">
                    {/* User Section */}
                    <div className="sidebar-user" onClick={onOpenSettings}>
                        <div className="sidebar-avatar relative">
                            K
                            {/* Status indicator */}
                            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-zinc-900 ${hasApiKey ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'
                                }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-zinc-300 truncate">KK User</p>
                            <p className="text-[10px] text-zinc-500">订阅与设置</p>
                        </div>
                        <div className="flex flex-col gap-1">
                            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-medium ${hasApiKey
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-yellow-500/20 text-yellow-400'
                                }`}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="7.5" cy="15.5" r="5.5" />
                                    <path d="m21 2-9.6 9.6" />
                                    <path d="m15.5 7.5 3 3L22 7l-3-3" />
                                </svg>
                                <span>{hasApiKey ? '已配置' : '未配置'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
