import React, { useEffect, useState } from 'react';
import { Globe, Key, LayoutTemplate, X } from 'lucide-react';
import type { Provider } from '../../types';
import { notify } from '../../services/system/notificationService';
import keyManager, { KeySlot } from '../../services/auth/keyManager';

interface KeySlotModalProps {
  isOpen: boolean;
  onClose: () => void;
  modalType: 'official' | 'proxy' | 'third-party';
  editingSlot?: KeySlot | null;
  providerId?: string;
}

const normalizeProvider = (provider?: string): Provider => {
  if (!provider) return 'Custom';
  const lower = provider.toLowerCase();
  if (provider === 'Google' || lower === 'google' || lower === 'gemini') return 'Google';
  if (provider === 'OpenAI' || lower === 'openai') return 'OpenAI';
  if (provider === 'Anthropic' || lower === 'anthropic' || lower === 'claude') return 'Anthropic';
  return 'Custom';
};

export const KeySlotModal: React.FC<KeySlotModalProps> = ({
  isOpen,
  onClose,
  modalType,
  editingSlot,
  providerId,
}) => {
  const [formData, setFormData] = useState({
    name: '',
    key: '',
    providerId: normalizeProvider(providerId),
    baseUrl: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    if (editingSlot) {
      setFormData({
        name: editingSlot.name,
        key: editingSlot.key,
        providerId: normalizeProvider(editingSlot.provider),
        baseUrl: editingSlot.providerConfig?.baseUrl || editingSlot.baseUrl || '',
      });
      return;
    }

    setFormData({
      name: '',
      key: '',
      providerId: normalizeProvider(providerId || (modalType === 'official' ? 'Google' : 'Custom')),
      baseUrl: '',
    });
  }, [editingSlot, isOpen, modalType, providerId]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!isOpen) return null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.name.trim()) {
      notify.warning('请填写名称', '名称为必填项。');
      return;
    }
    if (!formData.key.trim()) {
      notify.warning('请填写 API Key', 'API Key 为必填项。');
      return;
    }
    if (formData.providerId === 'Custom' && !formData.baseUrl.trim()) {
      notify.warning('请填写 Base URL', '代理或第三方配置必须填写完整接口地址（建议包含 /v1）。');
      return;
    }

    const finalType: 'official' | 'proxy' | 'third-party' =
      modalType === 'proxy' ? 'proxy' : modalType === 'third-party' ? 'third-party' : 'official';

    setIsLoading(true);
    try {
      if (editingSlot) {
        keyManager.updateKey(editingSlot.id, {
          name: formData.name.trim(),
          key: formData.key.trim(),
          provider: formData.providerId as any,
          type: finalType,
          baseUrl: formData.providerId === 'Custom' ? formData.baseUrl.trim() : undefined,
        });
        notify.success('更新成功', '接口配置已更新。');
      } else {
        keyManager.addKey(formData.key.trim(), {
          name: formData.name.trim(),
          provider: formData.providerId as any,
          type: finalType,
          baseUrl: formData.providerId === 'Custom' ? formData.baseUrl.trim() : undefined,
        });
        notify.success('添加成功', '接口配置已保存。');
      }
      onClose();
    } catch (error: any) {
      notify.error('保存失败', error?.message || '请稍后重试。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[1000] flex justify-center bg-black/60 backdrop-blur-sm ${
        isMobile ? 'items-end px-2 pt-8 pb-0' : 'items-center p-4'
      }`}
      onClick={onClose}
    >
      <div
        className={`w-full overflow-hidden border border-zinc-800 bg-zinc-900 shadow-2xl ${
          isMobile ? 'ios-mobile-sheet max-h-[88dvh] rounded-t-[26px] rounded-b-none max-w-[720px]' : 'max-w-md rounded-2xl'
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`flex items-center justify-between border-b border-zinc-800 ${isMobile ? 'px-4 py-3' : 'px-6 py-4'}`}>
          <h3 className="text-base font-semibold text-zinc-100">{editingSlot ? '编辑接口配置' : '添加接口配置'}</h3>
          <button onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-zinc-400 hover:bg-zinc-800">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={`space-y-4 overflow-y-auto ${isMobile ? 'max-h-[74dvh] px-4 py-4 pb-6' : 'px-6 py-5'}`}>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">显示名称</label>
            <div className="relative">
              <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                <LayoutTemplate size={16} />
              </div>
              <input
                type="text"
                value={formData.name}
                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                className="h-11 w-full rounded-xl border border-zinc-700/60 bg-zinc-800/60 pl-10 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/45"
                placeholder="例如：我的主接口"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">服务商</label>
            <select
              value={formData.providerId}
              onChange={(event) => setFormData({ ...formData, providerId: normalizeProvider(event.target.value) })}
              className="h-11 w-full rounded-xl border border-zinc-700/60 bg-zinc-800/60 px-3 text-sm text-zinc-100 outline-none transition focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/45"
              disabled={!!editingSlot || !!providerId}
            >
              {modalType === 'official' && (
                <>
                  <option value="Google">Google Gemini</option>
                  <option value="OpenAI">OpenAI</option>
                  <option value="Anthropic">Anthropic Claude</option>
                </>
              )}
              {modalType === 'proxy' && <option value="Custom">代理服务</option>}
              {modalType === 'third-party' && <option value="Custom">第三方服务商</option>}
            </select>
          </div>

          {(formData.providerId === 'Custom' || modalType === 'third-party') && (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300">Base URL</label>
              <div className="relative">
                <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                  <Globe size={16} />
                </div>
                <input
                  type="text"
                  value={formData.baseUrl}
                  onChange={(event) => setFormData({ ...formData, baseUrl: event.target.value })}
                  className="h-11 w-full rounded-xl border border-zinc-700/60 bg-zinc-800/60 pl-10 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/45"
                  placeholder="https://api.example.com/v1"
                />
              </div>
              <p className="mt-1 text-xs text-zinc-500">请填写完整地址，建议包含 /v1 后缀。</p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">API Key</label>
            <div className="relative">
              <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                <Key size={16} />
              </div>
              <input
                type="text"
                value={formData.key}
                onChange={(event) => setFormData({ ...formData, key: event.target.value })}
                className="h-11 w-full rounded-xl border border-zinc-700/60 bg-zinc-800/60 pl-10 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/45"
                placeholder="sk-..."
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-indigo-600 px-4 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? '保存中...' : '保存配置'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
