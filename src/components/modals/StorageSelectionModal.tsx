import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, FolderOpen, Globe, HardDrive, Loader2, Shield, Zap } from 'lucide-react';
import { getLocalFolderHandle, isFileSystemAccessSupported, setStorageMode, type StorageMode } from '../../services/storage/storagePreference';
import { useCanvas } from '../../context/CanvasContext';

interface StorageSelectionModalProps {
  isOpen: boolean;
  onComplete: () => void;
}

const FeatureRow: React.FC<{ icon: React.ReactNode; title: string; desc: string }> = ({ icon, title, desc }) => (
  <div className="flex items-start gap-2">
    <div className="mt-0.5 text-[var(--text-secondary)]">{icon}</div>
    <div>
      <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
        {title}
      </div>
      <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
        {desc}
      </div>
    </div>
  </div>
);

const StorageSelectionModal: React.FC<StorageSelectionModalProps> = ({ isOpen, onComplete }) => {
  const { connectLocalFolder, disconnectLocalFolder, isConnectedToLocal } = useCanvas();

  const [selectedMode, setSelectedMode] = useState<StorageMode>('browser');
  const [selectingLocal, setSelectingLocal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const supportsLocal = isFileSystemAccessSupported();

  if (!isOpen) return null;

  const chooseLocal = async () => {
    setError('');
    setSelectedMode('local');

    if (!supportsLocal) {
      setError('当前浏览器不支持本地文件夹授权，请继续使用浏览器缓存。');
    }
  };

  const chooseBrowser = () => {
    setError('');
    setSelectedMode('browser');
    disconnectLocalFolder();
  };

  const handleConfirm = async () => {
    setSaving(true);
    setError('');

    try {
      if (selectedMode === 'local' && !isConnectedToLocal) {
        setSelectingLocal(true);
        await connectLocalFolder();
        const handle = await getLocalFolderHandle();
        if (!handle) {
          setError('本地文件夹尚未连接，请先完成文件夹授权。');
          return;
        }
      }

      const ok = await setStorageMode(selectedMode);
      if (!ok) {
        setError('保存存储设置失败，请稍后重试。');
        return;
      }

      onComplete();
    } finally {
      setSelectingLocal(false);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 px-4 py-4 backdrop-blur-sm">
      <div
        className="w-full max-w-[640px] rounded-3xl border p-6 shadow-2xl"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-light)' }}
      >
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/20">
            <HardDrive size={24} />
          </div>
          <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            选择你的存储方案
          </h2>
          <p className="mx-auto mt-2 max-w-[500px] text-xs leading-6" style={{ color: 'var(--text-tertiary)' }}>
            默认使用浏览器缓存即可开始使用；如果你更在意原图安全，可以启用本地存储，为原图增加一层额外备份。
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <button
            onClick={chooseBrowser}
            className={`rounded-2xl border p-4 text-left transition ${
              selectedMode === 'browser' ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10' : 'border-[var(--border-light)]'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-slate-500/15 p-2 text-slate-300">
                  <Globe size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      浏览器缓存
                    </div>
                    <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[11px] text-indigo-300">默认</span>
                  </div>
                  <div className="mt-1 text-xs leading-5" style={{ color: 'var(--text-tertiary)' }}>
                    零配置，直接可用。图片保存在当前浏览器本地数据库，适合快速开始和日常使用。
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-3 rounded-xl border p-3" style={{ borderColor: 'var(--border-light)' }}>
              <FeatureRow icon={<Zap size={14} />} title="适合人群" desc="想先快速用起来，不想额外选择文件夹。" />
              <FeatureRow icon={<Shield size={14} />} title="风险提示" desc="如果清理浏览器缓存或更换浏览器，原图可能丢失。" />
            </div>
          </button>

          <button
            onClick={() => void chooseLocal()}
            disabled={!supportsLocal}
            className={`rounded-2xl border p-4 text-left transition ${
              selectedMode === 'local' ? 'border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/10' : 'border-[var(--border-light)]'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-emerald-500/15 p-2 text-emerald-300">
                  <FolderOpen size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      本地存储
                    </div>
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">双层保护</span>
                  </div>
                  <div className="mt-1 text-xs leading-5" style={{ color: 'var(--text-tertiary)' }}>
                    在浏览器缓存之外，再把原图额外备份到你选择的本地文件夹，更适合长期保存和防止原图丢失。
                  </div>
                </div>
              </div>

              {isConnectedToLocal ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
                  <CheckCircle2 size={12} /> 已连接
                </span>
              ) : null}
            </div>

            <div className="mt-4 space-y-3 rounded-xl border p-3" style={{ borderColor: 'var(--border-light)' }}>
              <FeatureRow icon={<Shield size={14} />} title="适合人群" desc="有长期保存需求，或担心浏览器缓存被清理。" />
              <FeatureRow icon={<FolderOpen size={14} />} title="恢复能力" desc="即使浏览器缓存丢失，也可以优先从本地备份恢复原图。" />
            </div>
          </button>
        </div>

        <div
          className="mt-4 rounded-2xl border p-4"
          style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            当前推荐
          </div>
          <div className="mt-1 text-xs leading-6" style={{ color: 'var(--text-tertiary)' }}>
            如果你只是先体验，直接用“浏览器缓存”就行；如果你的重点是保住原图，建议开启“本地存储（双层保护）”，这样即使浏览器缓存丢失，也还能从本地恢复。
          </div>
        </div>

        {!supportsLocal && (
          <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5" />
              <p>当前浏览器不支持本地文件夹授权。若要使用本地存储，请改用最新版 Chrome 或 Edge。</p>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={handleConfirm}
            disabled={selectingLocal || saving}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 disabled:opacity-60"
          >
            {(selectingLocal || saving) && <Loader2 size={15} className="animate-spin" />}
            {selectedMode === 'local' && !isConnectedToLocal ? '选择文件夹并保存' : '保存设置'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StorageSelectionModal;
