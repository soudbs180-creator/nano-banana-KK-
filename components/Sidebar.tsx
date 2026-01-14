'use client';

import React, { useState } from 'react';
import {
    Settings,
    History,
    Image as ImageIcon,
    Folder,
    ChevronLeft,
    ChevronRight,
    Sparkles,
    Bot,
    KeyRound,
    LogOut
} from 'lucide-react';

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
                        <Sparkles size={16} />
                    </div>
                    <span className="sidebar-title">KK Studio</span>
                    <button
                        onClick={onClose}
                        className="ml-auto p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
                    >
                        <ChevronLeft size={18} />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="sidebar-nav scrollbar-hide">
                    {/* Main Actions */}
                    <div className="mb-4">
                        <button
                            className={`sidebar-nav-item ${activeTab === 'home' ? 'active' : ''}`}
                            onClick={() => setActiveTab('home')}
                        >
                            <ImageIcon size={18} />
                            <span>图像生成</span>
                        </button>
                        <button
                            className={`sidebar-nav-item ${activeTab === 'history' ? 'active' : ''}`}
                            onClick={() => setActiveTab('history')}
                        >
                            <History size={18} />
                            <span>历史记录</span>
                            {generatedCount > 0 && (
                                <span className="ml-auto text-[10px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full">
                                    {generatedCount}
                                </span>
                            )}
                        </button>
                        <button className="sidebar-nav-item">
                            <Folder size={18} />
                            <span>项目收藏</span>
                        </button>
                    </div>

                    {/* Placeholder for history list when history tab is active */}
                    {activeTab === 'history' && (
                        <div className="space-y-2">
                            <div className="px-3 py-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                                最近生成
                            </div>
                            <div className="px-3 py-8 text-center text-zinc-600 text-xs">
                                <History size={24} className="mx-auto mb-2 opacity-30" />
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
                                <KeyRound size={10} />
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
