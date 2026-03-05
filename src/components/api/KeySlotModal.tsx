import React, { useState, useEffect } from 'react';
import { X, Key, Globe, LayoutTemplate } from 'lucide-react';
import { notify } from '../../services/system/notificationService';
import keyManager, { KeySlot } from '../../services/auth/keyManager';
import { Provider } from '../../types';

interface KeySlotModalProps {
    isOpen: boolean;
    onClose: () => void;
    modalType: 'official' | 'proxy' | 'third-party';
    editingSlot?: KeySlot | null;
    providerId?: string;
}

export const KeySlotModal: React.FC<KeySlotModalProps> = ({
    isOpen,
    onClose,
    modalType,
    editingSlot,
    providerId
}) => {
    const [formData, setFormData] = useState({
        name: '',
        key: '',
        providerId: providerId || 'custom',
        baseUrl: ''
    });

    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (editingSlot) {
            setFormData({
                name: editingSlot.name,
                key: editingSlot.key,
                providerId: editingSlot.provider,
                baseUrl: editingSlot.providerConfig?.baseUrl || ''
            });
        } else {
            setFormData({
                name: '',
                key: '',
                providerId: providerId || (modalType === 'official' ? 'openai' : 'custom'),
                baseUrl: ''
            });
        }
    }, [editingSlot, isOpen, modalType, providerId]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.name.trim()) {
            notify.warning('请输入名称', '名称为必填项');
            return;
        }
        if (!formData.key.trim()) {
            notify.warning('请输入 API Key', 'API Key 为必填项');
            return;
        }

        // Require Base URL for custom proxy configurations
        if (formData.providerId === 'custom' && !formData.baseUrl.trim()) {
            notify.warning('自定义代理必须提供 Base URL', '请填写完整的代理地址，包含 /v1 后缀');
            return;
        }

        setIsLoading(true);
        try {
            if (editingSlot) {
                keyManager.updateKey(editingSlot.id, {
                    name: formData.name.trim(),
                    key: formData.key.trim(),
                    provider: formData.providerId as any,
                    type: formData.providerId === 'custom' ? 'proxy' : modalType,
                    baseUrl: formData.providerId === 'custom' ? formData.baseUrl.trim() : undefined
                });
                notify.success('更新成功', 'API 密钥已更新');
            } else {
                keyManager.addKey(formData.key.trim(), {
                    name: formData.name.trim(),
                    provider: formData.providerId as any,
                    type: formData.providerId === 'custom' ? 'proxy' : modalType,
                    baseUrl: formData.providerId === 'custom' ? formData.baseUrl.trim() : undefined
                });
                notify.success('添加成功', 'API 密钥已添加');
            }
            onClose();
        } catch (error: any) {
            notify.error('保存失败', error.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div
                className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                    <h3 className="text-lg font-semibold text-zinc-100">
                        {editingSlot ? '编辑 API 密钥' : '添加 API 密钥'}
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">名称</label>
                        <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                                <LayoutTemplate size={16} />
                            </div>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full pl-9 pr-4 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all"
                                placeholder="例如: GPT-4 工作主键"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">服务商</label>
                        <select
                            value={formData.providerId}
                            onChange={e => setFormData({ ...formData, providerId: e.target.value })}
                            className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all appearance-none"
                            disabled={!!editingSlot || !!providerId}
                        >
                            {modalType === 'official' && (
                                <>
                                    <option value="openai">OpenAI</option>
                                    <option value="gemini">Google Gemini</option>
                                    <option value="claude">Anthropic Claude</option>
                                </>
                            )}
                            {modalType === 'proxy' && <option value="custom">中转代理配置</option>}
                            {modalType === 'third-party' && <option value="custom">第三方服务商配置</option>}
                        </select>
                    </div>

                    {(formData.providerId === 'custom' || modalType === 'third-party') && (
                        <div>
                            <label className="block text-sm font-medium text-zinc-400 mb-1">Base URL (代理地址)</label>
                            <div className="relative">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                                    <Globe size={16} />
                                </div>
                                <input
                                    type="text"
                                    value={formData.baseUrl}
                                    onChange={e => setFormData({ ...formData, baseUrl: e.target.value })}
                                    className="w-full pl-9 pr-4 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all"
                                    placeholder="https://api.your-proxy.com/v1"
                                />
                            </div>
                            <p className="text-xs text-zinc-500 mt-1">第三方或中转服务必须填写带有 /v1 的完整 Base URL</p>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">API Key</label>
                        <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                                <Key size={16} />
                            </div>
                            <input
                                type="text"
                                value={formData.key}
                                onChange={e => setFormData({ ...formData, key: e.target.value })}
                                className="w-full pl-9 pr-4 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all"
                                placeholder="sk-..."
                            />
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end gap-3 border-t border-zinc-800">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                        >
                            取消
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? '保存中...' : '保存配置'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
