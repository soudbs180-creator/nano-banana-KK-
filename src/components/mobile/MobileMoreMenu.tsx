import React from 'react';
import { Settings, User, X } from 'lucide-react';

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
            <div className="relative bg-[#1c1c1e] rounded-t-3xl border-t border-white/10 p-4 pb-safe animate-in slide-in-from-bottom duration-300 shadow-2xl">
                <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
                    <span className="text-white font-bold text-lg">更多功能</span>
                    <button onClick={onClose} className="min-w-[44px] min-h-[44px] p-2 flex items-center justify-center text-zinc-400 active:text-white active:scale-95 bg-white/5 rounded-lg transition-all">
                        <X size={22} strokeWidth={2} />
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    {/* Settings */}
                    <button
                        onClick={() => {
                            onOpenSettings();
                            onClose();
                        }}
                        className="flex flex-col items-center gap-2 min-w-[44px] min-h-[72px] p-2 rounded-xl active:scale-95 transition-all group"
                    >
                        <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center group-active:bg-white/10 transition-colors">
                            <Settings size={24} strokeWidth={2} className="text-white" />
                        </div>
                        <span className="text-[11px] text-zinc-400 leading-none">设置</span>
                    </button>

                    {/* Profile */}
                    <button
                        onClick={() => {
                            onOpenProfile();
                            onClose();
                        }}
                        className="flex flex-col items-center gap-2 min-w-[44px] min-h-[72px] p-2 rounded-xl active:scale-95 transition-all group"
                    >
                        <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center group-active:bg-white/10 transition-colors">
                            <User size={24} strokeWidth={2} className="text-white" />
                        </div>
                        <span className="text-[11px] text-zinc-400 leading-none">我的</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MobileMoreMenu;
