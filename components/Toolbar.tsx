import React from 'react';
import {
    PanelLeft,
    MessageSquare,
    Plus,
    Search,
    Undo2,
    Leaf
} from 'lucide-react';

interface ToolbarProps {
    onToggleSidebar: () => void;
    isSidebarOpen: boolean;
}

const Toolbar: React.FC<ToolbarProps> = ({ onToggleSidebar, isSidebarOpen }) => {
    return (
        <div className="absolute top-4 left-4 z-50">
            <div className="toolbar">
                {/* Sidebar Toggle */}
                <button
                    className={`toolbar-btn ${isSidebarOpen ? 'active' : ''}`}
                    onClick={onToggleSidebar}
                    title="切换侧边栏 (Toggle Sidebar)"
                >
                    <PanelLeft size={16} />
                </button>

                {/* Chat Button */}
                <button className="toolbar-btn" title="对话 (Chat)">
                    <MessageSquare size={16} />
                </button>

                {/* Add Button */}
                <button className="toolbar-btn" title="新建 (New)">
                    <Plus size={16} />
                </button>

                {/* Search Button */}
                <button className="toolbar-btn" title="搜索 (Search)">
                    <Search size={16} />
                </button>

                {/* Flo Mode Button */}
                <button className="flo-mode-btn" title="Flo Mode">
                    <Leaf size={14} />
                    <span className="text-xs font-bold">flo mode</span>
                </button>

                <div className="toolbar-divider" />

                {/* Undo Button */}
                <button className="toolbar-btn" title="撤销 (Undo)">
                    <Undo2 size={16} />
                </button>

                <div className="toolbar-divider" />

                {/* User Avatar */}
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xs font-bold cursor-pointer hover:scale-105 transition-transform ring-2 ring-emerald-500/30">
                    U
                </div>
            </div>
        </div>
    );
};

export default Toolbar;
