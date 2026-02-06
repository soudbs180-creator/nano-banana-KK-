import { Home, Image as ImageIcon, Settings, Video, User, Sparkles } from 'lucide-react';
import { GenerationMode } from '../types';

interface MobileTabBarProps {
    onSetMode: (mode: GenerationMode) => void;
    onOpenSettings: () => void;
    onOpenProfile: () => void;
    onToggleChat?: () => void; // [NEW]
    currentMode: GenerationMode;
    currentView: 'gallery' | 'home' | 'settings' | 'profile' | 'chat';
    isVisible?: boolean;
    onInteract?: () => void;
}

const MobileTabBar: React.FC<MobileTabBarProps> = ({
    onSetMode,
    onOpenSettings,
    onOpenProfile,
    onToggleChat,
    currentMode,
    currentView,
    isVisible = true,
    onInteract
}) => {
    return (
        <div
            className={`fixed bottom-0 left-0 right-0 z-[1000] md:hidden pb-safe transition-transform duration-300 ease-in-out ${isVisible ? 'translate-y-0' : 'translate-y-[150%]'}`}
            onTouchStart={onInteract}
            onClick={onInteract}
        >
            <div
                className="mx-4 mb-4 h-16 rounded-[32px] flex items-center justify-around px-2 relative overflow-hidden liquid-glass shadow-2xl border border-white/10"
                id="mobile-tab-bar"
                style={{
                    backgroundColor: 'rgba(20, 20, 23, 0.85)',
                    backdropFilter: 'blur(20px)',
                }}
            >
                {/* Tab: Settings */}
                <button
                    onClick={onOpenSettings}
                    className="flex flex-col items-center justify-center p-2 rounded-full transition-all active:scale-95"
                    style={{ color: currentView === 'settings' ? 'white' : 'var(--text-tertiary)' }}
                >
                    <Settings size={22} strokeWidth={2} />
                </button>

                {/* Tab: Image Mode */}
                <button
                    onClick={() => onSetMode(GenerationMode.IMAGE)}
                    className="flex flex-col items-center justify-center p-2 rounded-full transition-all active:scale-95"
                    style={{ color: currentMode === GenerationMode.IMAGE && currentView !== 'settings' && currentView !== 'profile' && currentView !== 'chat' ? 'white' : 'var(--text-tertiary)' }}
                >
                    <ImageIcon size={22} strokeWidth={2} />
                </button>

                {/* AI Assistant (Center) */}
                <button
                    onClick={onToggleChat}
                    className="flex flex-col items-center justify-center p-2 rounded-full transition-all active:scale-95"
                    style={{ color: currentView === 'chat' ? 'white' : 'var(--text-tertiary)' }}
                >
                    <Sparkles size={22} strokeWidth={2} />
                </button>

                {/* Tab: Video Mode */}
                <button
                    onClick={() => onSetMode(GenerationMode.VIDEO)}
                    className="flex flex-col items-center justify-center p-2 rounded-full transition-all active:scale-95"
                    style={{ color: currentMode === GenerationMode.VIDEO && currentView !== 'settings' && currentView !== 'profile' && currentView !== 'chat' ? 'white' : 'var(--text-tertiary)' }}
                >
                    <Video size={22} strokeWidth={2} />
                </button>

                {/* Tab: Profile */}
                <button
                    onClick={onOpenProfile}
                    className="flex flex-col items-center justify-center p-2 rounded-full transition-all active:scale-95"
                    style={{ color: currentView === 'profile' ? 'white' : 'var(--text-tertiary)' }}
                >
                    <User size={22} strokeWidth={2} />
                </button>
            </div>
        </div>
    );
};

export default MobileTabBar;
