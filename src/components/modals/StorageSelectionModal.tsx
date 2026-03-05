import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, FolderOpen, Globe, HardDrive, Loader2 } from 'lucide-react';
import { isFileSystemAccessSupported, setStorageMode, StorageMode } from '../../services/storage/storagePreference';
import { useCanvas } from '../../context/CanvasContext';

interface StorageSelectionModalProps {
  isOpen: boolean;
  onComplete: () => void;
}

const StorageSelectionModal: React.FC<StorageSelectionModalProps> = ({ isOpen, onComplete }) => {
  const { connectLocalFolder, disconnectLocalFolder, isConnectedToLocal } = useCanvas();

  const [selectedMode, setSelectedMode] = useState<StorageMode | null>(null);
  const [selectingLocal, setSelectingLocal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const supportsLocal = isFileSystemAccessSupported();

  if (!isOpen) return null;

  const chooseLocal = async () => {
    setError('');
    setSelectedMode('local');

    if (!supportsLocal) {
      setError('当前浏览器不支持本地文件夹模式，请改用浏览器存储。');
      return;
    }

    setSelectingLocal(true);
    try {
      await connectLocalFolder();
    } catch {
      setError('文件夹选择失败，请重新选择。');
    } finally {
      setSelectingLocal(false);
    }
  };

  const chooseBrowser = () => {
    setError('');
    setSelectedMode('browser');
    disconnectLocalFolder();
  };

  const handleConfirm = async () => {
    if (!selectedMode) {
      setError('请选择一种存储方式。');
      return;
    }

    if (selectedMode === 'local' && !isConnectedToLocal) {
      setError('本地文件夹尚未连接，请先完成文件夹授权。');
      return;
    }

    setSaving(true);
    setError('');

    const ok = await setStorageMode(selectedMode);
    if (!ok) {
      setSaving(false);
      setError('保存存储设置失败，请稍后重试。');
      return;
    }

    setSaving(false);
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 px-4 py-4 backdrop-blur-sm">
      <div
        className="w-full max-w-[560px] rounded-2xl border p-5 shadow-2xl"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-light)' }}
      >
        <div className="mb-4 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <HardDrive size={22} />
          </div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            首次登录需要设置存储方式
          </h2>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            完成设置后才可进入主界面，后续可在“设置 - 存储设置”中修改。
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => void chooseLocal()}
            disabled={!supportsLocal || selectingLocal}
            className={`w-full rounded-xl border p-4 text-left transition ${
              selectedMode === 'local' ? 'border-indigo-500 bg-indigo-500/10' : 'border-[var(--border-light)]'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-lg bg-indigo-500/15 p-2 text-indigo-300">
                  <FolderOpen size={18} />
                </div>
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    本地文件夹（推荐）
                  </div>
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    图片保存到你选择的系统文件夹，容量更稳定，不容易因浏览器清理缓存而丢失。
                  </p>
                </div>
              </div>

              {isConnectedToLocal ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
                  <CheckCircle2 size={12} /> 已连接
                </span>
              ) : null}
            </div>
          </button>

          <button
            onClick={chooseBrowser}
            className={`w-full rounded-xl border p-4 text-left transition ${
              selectedMode === 'browser' ? 'border-indigo-500 bg-indigo-500/10' : 'border-[var(--border-light)]'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-lg bg-slate-500/20 p-2 text-slate-300">
                <Globe size={18} />
              </div>
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  浏览器存储
                </div>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  直接保存在浏览器本地数据库，配置最简单；但清理浏览器数据可能造成图片丢失。
                </p>
              </div>
            </div>
          </button>
        </div>

        {!supportsLocal && (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5" />
              <p>当前浏览器不支持文件夹授权。若要使用本地文件夹，请改用最新版 Chrome 或 Edge。</p>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={handleConfirm}
            disabled={!selectedMode || selectingLocal || saving}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            {(selectingLocal || saving) && <Loader2 size={15} className="animate-spin" />}
            保存并继续
          </button>
        </div>
      </div>
    </div>
  );
};

export default StorageSelectionModal;
