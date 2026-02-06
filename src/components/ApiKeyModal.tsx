import React, { useState, useEffect } from 'react';
import { X, Server, Globe, Key, ChevronDown, ChevronUp, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import keyManager, { KeySlot } from '../services/keyManager';
import { notify } from '../services/notificationService';
import { comprehensiveConnectionTest } from "../services/connectionTest";

interface ApiKeyModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialType: 'official' | 'proxy' | 'third-party';
    editingSlot?: KeySlot | null;
    onSave?: () => void;
}

const PRESET_PROVIDERS = [
    { label: '智谱 AI (BigModel)', value: 'zhipu', url: 'https://open.bigmodel.cn/api/paas/v4', icon: '🧠' },
    { label: 'DeepSeek (深度求索)', value: 'deepseek', url: 'https://api.deepseek.com', icon: '🔮' },
    { label: 'SiliconFlow (硅基流动)', value: 'siliconflow', url: 'https://api.siliconflow.cn/v1', icon: '💎' },
    { label: 'Moonshot (Kimi)', value: 'moonshot', url: 'https://api.moonshot.cn/v1', icon: '🌙' },
    { label: '自定义服务商', value: 'custom', url: '', icon: '⚙️' }
];

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, initialType, editingSlot, onSave }) => {
    const [formData, setFormData] = useState({
        name: '',
        key: '',
        baseUrl: '',
        provider: '',
        budgetLimit: -1,
        tokenLimit: -1,
        models: '',
        serverName: ''
    });

    const [presetValue, setPresetValue] = useState('custom');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    useEffect(() => {
        if (isOpen) {
            if (editingSlot) {
                setFormData({
                    name: editingSlot.name,
                    key: editingSlot.key,
                    baseUrl: editingSlot.baseUrl || '',
                    provider: editingSlot.provider,
                    budgetLimit: editingSlot.budgetLimit,
                    tokenLimit: editingSlot.tokenLimit || -1,
                    models: editingSlot.supportedModels.join(', '),
                    serverName: editingSlot.proxyConfig?.serverName || ''
                });
                // Try to match preset
                const match = PRESET_PROVIDERS.find(p => p.url === editingSlot.baseUrl);
                setPresetValue(match ? match.value : 'custom');
            } else {
                // Defaults
                setFormData({
                    name: '',
                    key: '',
                    baseUrl: initialType === 'official' ? 'https://generativelanguage.googleapis.com' : '',
                    provider: initialType === 'official' ? 'Google' : 'Custom',
                    budgetLimit: -1,
                    tokenLimit: -1,
                    models: '',
                    serverName: ''
                });
                setPresetValue(initialType === 'third-party' ? 'zhipu' : 'custom');
                if (initialType === 'third-party') handlePresetChange('zhipu');
            }
            setTestResult(null);
            setShowAdvanced(false);
        }
    }, [isOpen, editingSlot, initialType]);

    const handlePresetChange = (value: string) => {
        setPresetValue(value);
        const preset = PRESET_PROVIDERS.find(p => p.value === value);
        if (preset) {
            setFormData(prev => ({
                ...prev,
                baseUrl: preset.url,
                name: prev.name || (value !== 'custom' ? preset.label : ''),
                provider: value === 'custom' ? 'Custom' : 'OpenAI' // Most 3rd partys are OpenAI compatible
            }));
        }
    };

    const handleTest = async () => {
        if (!formData.key) {
            setTestResult({ success: false, message: '请输入 API Key' });
            return;
        }

        setIsTesting(true);
        try {
            const results = await comprehensiveConnectionTest({
                apiKey: formData.key,
                baseUrl: formData.baseUrl,
                provider: formData.provider,
                model: formData.models.split(',')[0] || undefined
            });

            const success = results.some(r => r.success);
            setTestResult({
                success,
                message: success ? '连接测试成功' : (results[0]?.message || '连接失败')
            });
        } catch (e: any) {
            setTestResult({ success: false, message: e.message });
        } finally {
            setIsTesting(false);
        }
    };

    const handleSubmit = async () => {
        setIsTesting(true); // Reuse loading state

        // 1. Auto-test before saving if not already successful
        if (!testResult?.success) {
            /* Optional: Force test? User requested "Automatic test after saving"
               Logic: user clicks save -> we run test -> if fail, show error.
            */
        }

        const payload: any = {
            name: formData.name || (initialType === 'official' ? 'Google API' : 'API Channel'),
            key: formData.key,
            type: initialType,
            baseUrl: formData.baseUrl,
            provider: formData.provider,
            budgetLimit: formData.budgetLimit,
            tokenLimit: formData.tokenLimit,
            supportedModels: formData.models.split(/[,，\n]/).map(s => s.trim()).filter(Boolean),
        };

        if (initialType === 'proxy') {
            payload.proxyConfig = { serverName: formData.serverName };
        }

        // Final connection test
        const testRes = await keyManager.testChannel(payload.baseUrl || '', payload.key, payload.provider);
        if (!testRes.success) {
            if (!confirm(`连接测试失败: ${testRes.message}\n是否强制保存?`)) {
                setIsTesting(false);
                return;
            }
        }

        try {
            if (editingSlot) {
                await keyManager.updateKey(editingSlot.id, payload);
            } else {
                await keyManager.addKey(payload.key, payload);
            }
            notify.success('保存成功');
            onSave?.();
            onClose();
        } catch (e: any) {
            notify.error('保存失败', e.message);
        } finally {
            setIsTesting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[10005] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#1e1e20] w-full max-w-lg rounded-2xl border border-white/10 shadow-2xl flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="p-5 border-b border-white/10 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-white">
                        {editingSlot ? '编辑 API' :
                            initialType === 'official' ? '添加官方直连' :
                                initialType === 'proxy' ? '添加代理服务器' : '添加第三方服务商'}
                    </h3>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white"><X size={20} /></button>
                </div>

                {/* Form */}
                <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">

                    {/* Third-Party Preset Selection */}
                    {initialType === 'third-party' && (
                        <div>
                            <label className="block text-xs font-medium text-zinc-400 mb-2">选择服务商</label>
                            <div className="grid grid-cols-2 gap-2">
                                {PRESET_PROVIDERS.map(p => (
                                    <button
                                        key={p.value}
                                        onClick={() => handlePresetChange(p.value)}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all ${presetValue === p.value
                                            ? 'bg-indigo-500/20 border-indigo-500 text-white'
                                            : 'bg-zinc-800 border-transparent text-zinc-400 hover:bg-zinc-700'
                                            }`}
                                    >
                                        <span>{p.icon}</span>
                                        <span className="truncate">{p.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Common Fields */}
                    <div className="space-y-4">
                        {/* Name (Hide for preset third-party unless custom) */}
                        {(initialType !== 'third-party' || presetValue === 'custom') && (
                            <div>
                                <label className="block text-xs font-medium text-zinc-400 mb-1.5">名称</label>
                                <input
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder={initialType === 'proxy' ? '我的代理服务器' : '给这个 Key 起个名字'}
                                    className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                                />
                            </div>
                        )}

                        {/* Proxy Server Name */}
                        {initialType === 'proxy' && (
                            <div>
                                <label className="block text-xs font-medium text-zinc-400 mb-1.5">服务器标识/名称</label>
                                <input
                                    value={formData.serverName}
                                    onChange={e => setFormData({ ...formData, serverName: e.target.value })}
                                    placeholder="例如: Hong Kong Relay 1"
                                    className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                                />
                            </div>
                        )}

                        {/* Base URL (Readonly for Official, Hidden for Preset unless custom) */}
                        {initialType !== 'official' && (
                            <div>
                                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                                    {initialType === 'proxy' ? '代理地址 (Base URL)' : '接口地址'}
                                </label>
                                <div className="relative">
                                    <input
                                        value={formData.baseUrl}
                                        readOnly={initialType === 'third-party' && presetValue !== 'custom'}
                                        onChange={e => setFormData({ ...formData, baseUrl: e.target.value })}
                                        placeholder="https://api.example.com/v1"
                                        className={`w-full bg-zinc-900 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-indigo-500 font-mono ${initialType === 'third-party' && presetValue !== 'custom' ? 'opacity-50 cursor-not-allowed' : ''
                                            }`}
                                    />
                                    <Globe className="absolute left-3 top-2.5 text-zinc-500" size={14} />
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-medium text-zinc-400 mb-1.5">API Key</label>
                            <div className="relative">
                                <input
                                    type="password"
                                    value={formData.key}
                                    onChange={e => setFormData({ ...formData, key: e.target.value })}
                                    placeholder="sk-..."
                                    className="w-full bg-zinc-900 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-indigo-500 font-mono"
                                />
                                <Key className="absolute left-3 top-2.5 text-zinc-500" size={14} />
                            </div>
                        </div>
                    </div>

                    {/* Limits */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-zinc-400 mb-1.5">预算限制 ($)</label>
                            <input
                                type="number"
                                value={formData.budgetLimit === -1 ? '' : formData.budgetLimit}
                                onChange={e => setFormData({ ...formData, budgetLimit: parseFloat(e.target.value) || -1 })}
                                placeholder="无限制"
                                className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                            />
                        </div>
                        {initialType !== 'official' && (
                            <div>
                                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Token 限制</label>
                                <input
                                    type="number"
                                    value={formData.tokenLimit === -1 ? '' : formData.tokenLimit}
                                    onChange={e => setFormData({ ...formData, tokenLimit: parseFloat(e.target.value) || -1 })}
                                    placeholder="无限制"
                                    className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                                />
                            </div>
                        )}
                    </div>

                    {/* Advanced: Models */}
                    {initialType !== 'official' && (
                        <div>
                            <button
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                className="flex items-center gap-2 text-xs text-zinc-400 hover:text-indigo-400 transition-colors"
                            >
                                {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                高级设置：自定义模型
                            </button>

                            {showAdvanced && (
                                <div className="mt-2 animate-in slide-in-from-top-2 duration-200">
                                    <textarea
                                        value={formData.models}
                                        onChange={e => setFormData({ ...formData, models: e.target.value })}
                                        placeholder="gpt-4o, claude-3-opus (留空则自动获取)"
                                        rows={3}
                                        className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Test Result */}
                    {testResult && (
                        <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${testResult.success ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                            }`}>
                            {testResult.success ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                            {testResult.message}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-white/10 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isTesting || !formData.key}
                        className="px-4 py-2 rounded-lg text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isTesting && <Loader2 size={14} className="animate-spin" />}
                        保存并测试
                    </button>
                </div>
            </div>
        </div>
    );
};
