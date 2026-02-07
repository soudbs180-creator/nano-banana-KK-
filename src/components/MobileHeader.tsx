import React from 'react';
import { Menu, Share2, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface MobileHeaderProps {
    onOpenSidebar: () => void;
    onShare?: () => void;
}

const MobileHeader: React.FC<MobileHeaderProps> = ({ onOpenSidebar, onShare }) => {
    const { user } = useAuth();

    return (
        <div className="fixed top-0 left-0 right-0 h-14 z-50 flex items-center justify-between px-4 bg-transparent pointer-events-none">
            {/* Gradient Background for readability */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />

            {/* Left: Menu (Sidebar) */}
            <button
                onClick={onOpenSidebar}
                className="relative z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/20 backdrop-blur-md text-white border border-white/10 active:scale-95 transition-transform pointer-events-auto"
            >
                <Menu size={20} />
            </button>

            {/* Center: Logo / Title */}
            <div className="relative z-10 flex flex-col items-center pointer-events-auto">
                <span className="font-bold text-base text-white drop-shadow-md tracking-wide">KK Studio</span>
                {/* Optional: Status pill or subtitle */}
            </div>

            {/* Right: Share / User Action */}
            <button
                onClick={onShare}
                className="relative z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/20 backdrop-blur-md text-white border border-white/10 active:scale-95 transition-transform pointer-events-auto"
            >
                <Share2 size={18} />
            </button>
        </div>
    );
};

export default MobileHeader;
