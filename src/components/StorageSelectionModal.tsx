import React, { useState } from 'react';
import { HardDrive, Globe, AlertTriangle, Loader2, FolderOpen, Check } from 'lucide-react';
import {
    StorageMode,
    isFileSystemAccessSupported,
    selectLocalFolder,
    setStorageMode
} from '../services/storagePreference';

interface StorageSelectionModalProps {
    isOpen: boolean;
    onComplete: () => void;
}

const StorageSelectionModal: React.FC<StorageSelectionModalProps> = ({ isOpen, onComplete }) => {
    const [selectedMode, setSelectedMode] = useState<StorageMode | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [folderSelected, setFolderSelected] = useState(false);

    const supportsLocalStorage = isFileSystemAccessSupported();

    const handleSelectLocal = async () => {
        setSelectedMode('local');
        setError(null);

        // Immediately prompt for folder selection
        const handle = await selectLocalFolder();
        if (handle) {
            setFolderSelected(true);
        } else {
            setError('请选择一个文件夹来保存原图');
            setFolderSelected(false);
        }
    };

    const handleSelectBrowser = () => {
        setSelectedMode('browser');
        setError(null);
        setFolderSelected(false);
    };

    const handleConfirm = async () => {
        if (!selectedMode) return;

        // For local mode, require folder selection
        if (selectedMode === 'local' && !folderSelected) {
            setError('请先选择保存文件夹');
            return;
        }

        setIsLoading(true);
        setError(null);

        const success = await setStorageMode(selectedMode);

        if (success) {
            onComplete();
        } else {
            setError('保存设置失败，请重试');
        }

        setIsLoading(false);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-[#1a1a1c] border border-white/10 rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
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
                    {/* Local Storage Option */}
                    <button
                        onClick={handleSelectLocal}
                        disabled={!supportsLocalStorage}
                        className={`w-full p-4 rounded-xl border-2 transition-all text-left ${selectedMode === 'local'
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-white/10 hover:border-white/20 bg-white/5'
                            } ${!supportsLocalStorage ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <div className="flex items-start gap-4">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${selectedMode === 'local' ? 'bg-blue-500' : 'bg-zinc-700'
                                }`}>
                                <FolderOpen size={20} className="text-white" />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-white">本地文件夹</span>
                                    {folderSelected && selectedMode === 'local' && (
                                        <Check size={16} className="text-green-400" />
                                    )}
                                </div>
                                <p className="text-xs text-zinc-400 mt-1">
                                    原图保存到本地文件夹，下载或放大时自动保存
                                </p>
                                {!supportsLocalStorage && (
                                    <p className="text-xs text-yellow-500 mt-1">
                                        您的浏览器不支持此功能
                                    </p>
                                )}
                            </div>
                        </div>
                    </button>

                    {/* Warning for Local Mode - System Folder Restriction */}
                    {selectedMode === 'local' && (
                        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-start gap-2">
                            <AlertTriangle size={16} className="text-blue-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-blue-300">
                                <strong>注意：</strong>请选择普通文件夹（如 Documents、Pictures），系统文件夹（Windows、Program Files）无法访问。
                            </p>
                        </div>
                    )}

                    {/* Browser Storage Option */}
                    <button
                        onClick={handleSelectBrowser}
                        className={`w-full p-4 rounded-xl border-2 transition-all text-left ${selectedMode === 'browser'
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-white/10 hover:border-white/20 bg-white/5'
                            }`}
                    >
                        <div className="flex items-start gap-4">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${selectedMode === 'browser' ? 'bg-blue-500' : 'bg-zinc-700'
                                }`}>
                                <Globe size={20} className="text-white" />
                            </div>
                            <div className="flex-1">
                                <span className="font-medium text-white">浏览器存储</span>
                                <p className="text-xs text-zinc-400 mt-1">
                                    原图保存在当前浏览器中
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
                        <strong className="text-zinc-300">提示：</strong>无论选择哪种方式，缩略图都会同步到云端，您可以在任何设备上查看。
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
