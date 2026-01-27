import React, { useState } from 'react';
import { HardDrive, Globe, AlertTriangle, Loader2, FolderOpen, Check } from 'lucide-react';
import {
    StorageMode,
    isFileSystemAccessSupported,
    setStorageMode
} from '../services/storagePreference';
import { useCanvas } from '../context/CanvasContext';

interface StorageSelectionModalProps {
    isOpen: boolean;
    onComplete: () => void;
}

const StorageSelectionModal: React.FC<StorageSelectionModalProps> = ({ isOpen, onComplete }) => {
    const { connectLocalFolder, disconnectLocalFolder, isConnectedToLocal } = useCanvas();
    const [selectedMode, setSelectedMode] = useState<StorageMode | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [folderSelected, setFolderSelected] = useState(false);

    const supportsLocalStorage = isFileSystemAccessSupported();

    const handleSelectLocal = async () => {
        setSelectedMode('local');
        setError(null);
        setFolderSelected(false);

        try {
            await connectLocalFolder();
            setFolderSelected(true);
        } catch (e) {
            setError('文件夹连接失败，请重试');
            setFolderSelected(false);
        }
    };

    const handleSelectBrowser = () => {
        setSelectedMode('browser');
        setError(null);
        setFolderSelected(false);
        disconnectLocalFolder();
    };

    const handleConfirm = async () => {
        if (!selectedMode) return;

        // For local mode, require folder selection
        if (selectedMode === 'local' && !folderSelected && !isConnectedToLocal) {
            setError('请先选择保存文件夹');
            return;
        }

        setIsLoading(true);
        setError(null);

        // Save preference to localStorage so App.tsx doesn't show this again
        await setStorageMode(selectedMode);

        onComplete();
        setIsLoading(false);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
            <div className="w-full max-w-[92vw] md:max-w-lg bg-[#1a1a1c] border border-white/10 rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="text-center mb-6">
                    <div className="w-14 h-14 bg-gradient-to-tr from-blue-500 to-indigo-600 rounded-xl mx-auto mb-4 flex items-center justify-center">
                        <HardDrive className="text-white" size={28} />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">选择图片存储方式</h2>
                    <p className="text-sm text-zinc-400">原图大小约 1-5 MB，请选择保存位置</p>
                </div>

                {/* Options */}
                <div className="space-y-3 mb-6">
                    {/* Local Storage Option - Primary Choice */}
                    <button
                        onClick={handleSelectLocal}
                        disabled={!supportsLocalStorage}
                        className={`w-full p-5 rounded-2xl border-2 transition-all relative overflow-hidden group text-left ${selectedMode === 'local'
                            ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_30px_rgba(59,130,246,0.15)]'
                            : 'border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10'
                            } ${!supportsLocalStorage ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {/* Glow effect for recommended option */}
                        <div className="absolute top-0 right-0 p-1.5 bg-blue-500 rounded-bl-xl z-10">
                            <span className="text-[10px] font-bold text-white px-1">推荐</span>
                        </div>

                        <div className="flex items-start gap-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors ${selectedMode === 'local' ? 'bg-blue-500 shadow-lg shadow-blue-500/30' : 'bg-zinc-800 group-hover:bg-zinc-700'
                                }`}>
                                <FolderOpen size={24} className={selectedMode === 'local' ? 'text-white' : 'text-blue-400'} />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`font-bold text-lg ${selectedMode === 'local' ? 'text-white' : 'text-zinc-200'}`}>
                                        本地文件夹
                                    </span>
                                    {(folderSelected || isConnectedToLocal) && selectedMode === 'local' && (
                                        <div className="flex items-center gap-1 bg-green-500/20 px-2 py-0.5 rounded-full">
                                            <Check size={12} className="text-green-400" />
                                            <span className="text-[10px] font-medium text-green-400">已连接</span>
                                        </div>
                                    )}
                                </div>
                                <p className="text-sm text-zinc-400 leading-snug">
                                    数据保存在您电脑的文件夹中，完全由您掌控。
                                </p>
                                <ul className="mt-3 space-y-1">
                                    <li className="flex items-center gap-2 text-xs text-zinc-500">
                                        <div className="w-1 h-1 rounded-full bg-zinc-600" />
                                        自动保存项目和原图
                                    </li>
                                    <li className="flex items-center gap-2 text-xs text-zinc-500">
                                        <div className="w-1 h-1 rounded-full bg-zinc-600" />
                                        支持跨浏览器访问
                                    </li>
                                </ul>
                                {!supportsLocalStorage && (
                                    <p className="text-xs text-red-400 mt-2 bg-red-500/10 p-2 rounded-lg">
                                        您的浏览器不支持文件系统API，请使用 Chrome/Edge
                                    </p>
                                )}
                            </div>
                        </div>
                    </button>

                    {/* Warning for Local Mode - System Folder Restriction */}
                    {selectedMode === 'local' && (
                        <div className="mx-2 p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl flex items-start gap-3 animate-slideDown">
                            <AlertTriangle size={16} className="text-blue-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-blue-300/80 leading-relaxed">
                                <strong>提示：</strong> 请选择普通文件夹（如 Documents、Pictures）。
                                <br />
                                如果选择已有项目的文件夹，将直接加载该项目。
                            </p>
                        </div>
                    )}

                    {/* Divider */}
                    <div className="flex items-center gap-4 my-2 px-2">
                        <div className="h-px bg-white/5 flex-1" />
                        <span className="text-xs text-zinc-600 uppercase tracking-wider font-medium">其他方式</span>
                        <div className="h-px bg-white/5 flex-1" />
                    </div>

                    {/* Browser Storage Option */}
                    <button
                        onClick={handleSelectBrowser}
                        className={`w-full p-4 rounded-xl border-2 transition-all text-left ${selectedMode === 'browser'
                            ? 'border-indigo-500 bg-indigo-500/10'
                            : 'border-white/5 hover:border-white/10 bg-white/5 hover:bg-white/10 opacity-70 hover:opacity-100'
                            }`}
                    >
                        <div className="flex items-start gap-4">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${selectedMode === 'browser' ? 'bg-indigo-500' : 'bg-zinc-800'
                                }`}>
                                <Globe size={20} className={selectedMode === 'browser' ? 'text-white' : 'text-zinc-500'} />
                            </div>
                            <div className="flex-1">
                                <span className={`font-medium ${selectedMode === 'browser' ? 'text-white' : 'text-zinc-300'}`}>
                                    临时存储 (浏览器)
                                </span>
                                <p className="text-xs text-zinc-500 mt-1">
                                    仅保存在当前浏览器缓存中。清除浏览器数据会丢失。
                                </p>
                            </div>
                        </div>
                    </button>

                    {/* Warning for Browser Mode */}
                    {selectedMode === 'browser' && (
                        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-2">
                            <AlertTriangle size={16} className="text-yellow-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-yellow-400">
                                <strong>注意：</strong>更换浏览器后将无法加载原图，仅显示缩略图。请及时下载重要图片。
                            </p>
                        </div>
                    )}
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
                        {error}
                    </div>
                )}

                {/* Info */}
                <div className="mb-6 p-3 bg-zinc-800/50 rounded-lg">
                    <p className="text-xs text-zinc-400">
                        <strong className="text-zinc-300">提示：</strong>所有图片仅保存在本地 (浏览器或文件夹)。云端仅存储账号信息。
                    </p>
                </div>

                {/* Confirm Button */}
                <button
                    onClick={handleConfirm}
                    disabled={!selectedMode || isLoading}
                    className="w-full h-12 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                    {isLoading ? (
                        <>
                            <Loader2 size={18} className="animate-spin" />
                            保存中...
                        </>
                    ) : (
                        '确认选择'
                    )}
                </button>
            </div>
        </div>
    );
};

export default StorageSelectionModal;
