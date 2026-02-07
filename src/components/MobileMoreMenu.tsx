import React from 'react';
import { Settings, User, LogOut, X } from 'lucide-react';

interface MobileMoreMenuProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenSettings: () => void;
    onOpenProfile: () => void;
}

const MobileMoreMenu: React.FC<MobileMoreMenuProps> = ({
    isOpen,
    onClose,
    onOpenSettings,
    onOpenProfile
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[1001] flex flex-col justify-end">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Menu Sheet */}
            <div className="relative bg-[#1e1e20] rounded-t-3xl border-t border-white/10 p-4 pb-safe animate-in slide-in-from-bottom duration-300 shadow-2xl">
                <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
                    <span className="text-white font-bold text-lg">更多功能</span>
                    <button onClick={onClose} className="p-2 text-zinc-400 active:text-white bg-white/5 rounded-full">
                        <X size={20} />
                    </button>
                </div>

                <div className="grid grid-cols-4 gap-4">
                    {/* Settings */}
                    <button
                        onClick={() => {
                            onOpenSettings();
                            onClose();
                        }}
                        className="flex flex-col items-center gap-2 group"
                    >
                        <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center group-active:bg-white/10 transition-colors">
                            <Settings size={24} className="text-white" />
                        </div>
                        <span className="text-xs text-zinc-400">设置</span>
                    </button>

                    {/* Profile */}
                    <button
                        onClick={() => {
                            onOpenProfile();
                            onClose();
                        }}
                        className="flex flex-col items-center gap-2 group"
                    >
                        <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center group-active:bg-white/10 transition-colors">
                            <User size={24} className="text-white" />
                        </div>
                        <span className="text-xs text-zinc-400">我的</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MobileMoreMenu;
