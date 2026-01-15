import React, { useState, useEffect, useCallback } from 'react';
import { keyManager, KeySlot } from '../services/keyManager';
import { Loader2 } from 'lucide-react';

interface KeyManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const KeyManagerModal: React.FC<KeyManagerModalProps> = ({ isOpen, onClose }) => {
    const [slots, setSlots] = useState<KeySlot[]>([]);
    const [newKey, setNewKey] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load slots and subscribe to changes
    useEffect(() => {
        const updateSlots = () => setSlots(keyManager.getSlots());
        updateSlots();
        return keyManager.subscribe(updateSlots);
    }, []);

    const handleAddKey = useCallback(async () => {
        if (!newKey.trim()) return;

        setIsAdding(true);
        setError(null);

        const result = await keyManager.addKey(newKey);

        if (result.success) {
            setNewKey('');
            if (result.error) {
                setError(result.error);
            }
        } else {
            setError(result.error || '添加失败');
        }

        setIsAdding(false);
    }, [newKey]);

    const handleRemoveKey = useCallback((id: string) => {
        keyManager.removeKey(id);
    }, []);

    const handleToggleKey = useCallback((id: string) => {
        keyManager.toggleKey(id);
    }, []);

    const handleRevalidateAll = useCallback(async () => {
        setIsValidating(true);
        await keyManager.revalidateAll();
        setIsValidating(false);
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !isAdding) {
            handleAddKey();
        }
    };

    const stats = keyManager.getStats();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-[#1a1a1c] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-scaleIn overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="7.5" cy="15.5" r="5.5" />
                                <path d="m21 2-9.6 9.6" />
                                <path d="m15.5 7.5 3 3L22 7l-3-3" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">API Key 管理</h2>
                            <p className="text-xs text-zinc-500">多 Key 轮询 · 自动切换 · 状态监控</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* Stats Bar */}
                <div className="flex items-center gap-4 px-4 py-3 bg-white/2 border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-xs text-zinc-400">有效 {stats.valid}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-red-500" />
                        <span className="text-xs text-zinc-400">无效 {stats.invalid}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-yellow-500" />
                        <span className="text-xs text-zinc-400">限流 {stats.rateLimited}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-zinc-500" />
                        <span className="text-xs text-zinc-400">禁用 {stats.disabled}</span>
                    </div>
                    <button
                        onClick={handleRevalidateAll}
                        disabled={isValidating || slots.length === 0}
                        className="ml-auto text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50 flex items-center gap-1"
                    >
                        {isValidating && <Loader2 size={12} className="animate-spin" />}
                        重新验证
                    </button>
                </div>

                {/* Key List */}
                <div className="max-h-72 overflow-y-auto p-4 space-y-2">
                    {slots.length === 0 ? (
                        <div className="text-center py-8 text-zinc-500 text-sm">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 opacity-30">
                                <circle cx="7.5" cy="15.5" r="5.5" />
                                <path d="m21 2-9.6 9.6" />
                                <path d="m15.5 7.5 3 3L22 7l-3-3" />
                            </svg>
                            暂无 API Key，请添加
                        </div>
                    ) : (
                        slots.map((slot) => (
                            <div
                                key={slot.id}
                                className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${slot.disabled
                                        ? 'bg-zinc-900/50 border-zinc-800 opacity-60'
                                        : slot.status === 'valid'
                                            ? 'bg-green-500/5 border-green-500/20'
                                            : slot.status === 'invalid'
                                                ? 'bg-red-500/5 border-red-500/20'
                                                : slot.status === 'rate_limited'
                                                    ? 'bg-yellow-500/5 border-yellow-500/20'
                                                    : 'bg-white/2 border-white/5'
                                    }`}
                            >
                                {/* Status Dot */}
                                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${slot.disabled ? 'bg-zinc-500' :
                                        slot.status === 'valid' ? 'bg-green-500' :
                                            slot.status === 'invalid' ? 'bg-red-500' :
                                                slot.status === 'rate_limited' ? 'bg-yellow-500' :
                                                    'bg-zinc-400'
                                    }`} />

                                {/* Key Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-mono text-zinc-300 truncate">
                                        {slot.key.substring(0, 8)}...{slot.key.substring(slot.key.length - 4)}
                                    </div>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="text-[10px] text-zinc-500">
                                            成功 {slot.successCount} · 失败 {slot.failCount}
                                        </span>
                                        {slot.lastError && (
                                            <span className="text-[10px] text-red-400 truncate" title={slot.lastError}>
                                                {slot.lastError}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => handleToggleKey(slot.id)}
                                        className={`p-1.5 rounded-lg transition-colors ${slot.disabled
                                                ? 'text-green-400 hover:bg-green-500/10'
                                                : 'text-zinc-400 hover:bg-white/5'
                                            }`}
                                        title={slot.disabled ? '启用' : '禁用'}
                                    >
                                        {slot.disabled ? (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                        ) : (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="12" cy="12" r="10" />
                                                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                                            </svg>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => handleRemoveKey(slot.id)}
                                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                        title="删除"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="3 6 5 6 21 6" />
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mx-4 mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {/* Add Key Input */}
                <div className="p-4 border-t border-white/5">
                    <div className="flex gap-2">
                        <input
                            type="password"
                            value={newKey}
                            onChange={(e) => setNewKey(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="输入新的 API Key..."
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30"
                        />
                        <button
                            onClick={handleAddKey}
                            disabled={isAdding || !newKey.trim()}
                            className="px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white text-sm font-medium transition-colors flex items-center gap-2"
                        >
                            {isAdding && <Loader2 size={14} className="animate-spin" />}
                            添加
                        </button>
                    </div>
                    <p className="mt-3 text-[10px] text-zinc-500 text-center">
                        获取 API Key：<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Google AI Studio</a>
                        · 支持多个 Key 自动轮询 · 失败自动切换
                    </p>
                </div>
            </div>
        </div>
    );
};

export default KeyManagerModal;
