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
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden animate-fadeIn"
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`fixed md:relative z-50 h-full bg-sidebar/95 backdrop-blur-xl border-r border-border flex flex-col transition-all duration-300 ${isOpen ? 'translate-x-0 w-[280px]' : '-translate-x-full md:translate-x-0 md:w-[60px]'
                    }`}
            >
                {/* Header */}
                <div className="h-16 flex items-center gap-3 px-4 border-b border-border">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center shadow-lg shadow-primary/20 flex-shrink-0">
                        <Sparkles size={16} className="text-white" />
                    </div>
                    {isOpen && (
                        <span className="font-semibold text-lg tracking-tight animate-fadeIn">
                            KK Studio
                        </span>
                    )}
                    {isOpen && (
                        <button
                            onClick={onClose}
                            className="ml-auto p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <ChevronLeft size={18} />
                        </button>
                    )}
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-hide">
                    {/* Main Actions */}
                    <div className="space-y-1">
                        <button
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${activeTab === 'home'
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                }`}
                            onClick={() => setActiveTab('home')}
                            title="图像生成"
                        >
                            <ImageIcon size={20} className="group-hover:scale-110 transition-transform" />
                            {isOpen && <span className="text-sm font-medium">图像生成</span>}
                        </button>
                        <button
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${activeTab === 'history'
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                }`}
                            onClick={() => setActiveTab('history')}
                            title="历史记录"
                        >
                            <History size={20} className="group-hover:scale-110 transition-transform" />
                            {isOpen && <span className="text-sm font-medium">历史记录</span>}
                            {isOpen && generatedCount > 0 && (
                                <span className="ml-auto text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">
                                    {generatedCount}
                                </span>
                            )}
                        </button>
                        <button
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200 group"
                            title="项目收藏"
                        >
                            <Folder size={20} className="group-hover:scale-110 transition-transform" />
                            {isOpen && <span className="text-sm font-medium">项目收藏</span>}
                        </button>
                    </div>

                    {/* Placeholder for history list when history tab is active */}
                    {isOpen && activeTab === 'history' && (
                        <div className="pt-6 animate-fadeIn">
                            <div className="px-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                                最近生成
                            </div>
                            <div className="py-12 flex flex-col items-center justify-center text-muted-foreground/50 gap-3 text-center border-2 border-dashed border-border/50 rounded-xl mx-1">
                                <History size={24} />
                                <p className="text-xs">暂无历史记录</p>
                            </div>
                        </div>
                    )}
                </nav>

                {/* Footer */}
                <div className="p-3 border-t border-border">
                    <button
                        className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-muted transition-colors group"
                        onClick={onOpenSettings}
                        title="用户设置"
                    >
                        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-500 to-red-500 flex items-center justify-center text-xs font-bold text-white shadow-md ring-2 ring-background flex-shrink-0 relative">
                            K
                            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${hasApiKey ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'
                                }`} />
                        </div>

                        {isOpen && (
                            <div className="flex-1 text-left overflow-hidden">
                                <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">KK User</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <div className={`w-1.5 h-1.5 rounded-full ${hasApiKey ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                    <span className="text-[10px] text-muted-foreground">
                                        {hasApiKey ? 'Pro Plan' : 'Config Required'}
                                    </span>
                                </div>
                            </div>
                        )}

                        {isOpen && (
                            <Settings size={16} className="text-muted-foreground group-hover:text-foreground" />
                        )}
                    </button>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
