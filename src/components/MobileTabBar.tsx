import { Home, Image as ImageIcon, Settings, Video, User } from 'lucide-react';
import { GenerationMode } from '../types';

interface MobileTabBarProps {
    onSetMode: (mode: GenerationMode) => void;
    onOpenSettings: () => void;
    onOpenProfile: () => void;
    currentMode: GenerationMode;
    currentView: 'gallery' | 'home' | 'settings' | 'profile'; // Keep for other highlights if needed, or largely ignore for left buttons
}

const MobileTabBar: React.FC<MobileTabBarProps> = ({
    onSetMode,
    onOpenSettings,
    onOpenProfile,
    currentMode,
    currentView
}) => {
    return (
        <div className="fixed bottom-0 left-0 right-0 z-[1000] md:hidden pb-safe">
            <div
                className="mx-4 mb-4 h-14 rounded-[24px] flex items-center justify-around px-2 relative overflow-hidden liquid-glass"
                id="mobile-tab-bar"
                style={{
                    // Removing inline styles handled by .liquid-glass class
                    // Only keeping overrides if necessary (none needed as class covers all)
                }}
            >
                {/* Tab: Gallery (Sidebar) */}
                {/* Tab: Gallery (Sidebar) */}
                {/* Tab: Image Mode (was Gallery) */}
                <button
                    onClick={() => onSetMode(GenerationMode.IMAGE)}
                    className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all duration-300`}
                >
                    <div className={`p-1.5 rounded-xl transition-all ${currentMode === GenerationMode.IMAGE && currentView !== 'settings' && currentView !== 'profile' ? 'bg-[var(--bg-tertiary)]' : ''}`}
                        style={{ color: currentMode === GenerationMode.IMAGE && currentView !== 'settings' && currentView !== 'profile' ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                        <ImageIcon size={24} strokeWidth={2} />
                    </div>
                </button>

                {/* Tab: Home (Generate) - Main Action */}
                {/* Tab: Video Mode (was Home) */}
                <button
                    onClick={() => onSetMode(GenerationMode.VIDEO)}
                    className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all duration-300`}
                >
                    <div className={`p-1.5 rounded-xl transition-all ${currentMode === GenerationMode.VIDEO && currentView !== 'settings' && currentView !== 'profile' ? 'bg-[var(--bg-tertiary)]' : ''}`}
                        style={{ color: currentMode === GenerationMode.VIDEO && currentView !== 'settings' && currentView !== 'profile' ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                        <Video size={24} strokeWidth={2} />
                    </div>
                </button>

                {/* Tab: Settings */}
                <button
                    onClick={onOpenSettings}
                    className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all duration-300`}
                >
                    <div className={`p-1.5 rounded-xl transition-all ${currentView === 'settings' ? 'bg-[var(--bg-tertiary)]' : ''}`}
                        style={{ color: currentView === 'settings' ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                        <Settings size={24} strokeWidth={currentView === 'settings' ? 2 : 2} />
                    </div>
                </button>

                {/* Tab: Profile */}
                <button
                    onClick={onOpenProfile}
                    className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all duration-300`}
                >
                    <div className={`p-1.5 rounded-xl transition-all ${currentView === 'profile' ? 'bg-[var(--bg-tertiary)]' : ''}`}
                        style={{ color: currentView === 'profile' ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                        <User size={24} strokeWidth={currentView === 'profile' ? 2 : 2} />
                    </div>
                </button>
            </div>
        </div>
    );
};

export default MobileTabBar;
