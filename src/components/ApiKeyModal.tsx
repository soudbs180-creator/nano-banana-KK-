import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, Server, Globe, Key, ChevronDown, ChevronUp, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import keyManager, { KeySlot, fetchOpenAICompatModels, fetchGoogleModels } from '../services/keyManager';
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
    const [isFetchingModels, setIsFetchingModels] = useState(false);
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
                model: formData.models.split(',')[0]?.trim() || ''
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

        // 🚀 Auto-fetch models if field is empty OR if it's a Google Key (to force update whitelist)
        let autoFetchedModels: string[] = [];
        const userModels = formData.models.split(/[,，\n]/).map(s => s.trim()).filter(Boolean);

        // Logic: 
        // 1. If Google -> ALWAYS fetch specific updated list (Strict Whitelist enforcement)
        // 2. If Third Party -> Only fetch if empty (User might have custom models)
        const shouldAutoFetch = (formData.provider === 'Google' || formData.baseUrl.includes('googleapis.com')) || userModels.length === 0;

        if (shouldAutoFetch && formData.baseUrl) {
            try {
                console.log('[ApiKeyModal] 自动获取模型列表...');
                if (formData.provider === 'Google' || formData.baseUrl.includes('googleapis.com')) {
                    autoFetchedModels = await fetchGoogleModels(formData.key);
                } else {
                    autoFetchedModels = await fetchOpenAICompatModels(formData.key, formData.baseUrl);
                }
                console.log('[ApiKeyModal] 自动获取到模型:', autoFetchedModels);
            } catch (e) {
                console.error('[ApiKeyModal] 自动获取模型失败:', e);
            }
        }

        const payload: any = {
            name: formData.name || formData.serverName || (initialType === 'official' ? 'Google API' : 'API Channel'),
            key: formData.key,
            type: initialType,
            baseUrl: formData.baseUrl,
            provider: formData.provider,
            budgetLimit: formData.budgetLimit,
            tokenLimit: formData.tokenLimit,
            // If it's Google, we prefer the auto-fetched list (whitelist) over the manual input
            // For others, we prefer manual input if it exists
            supportedModels: (formData.provider === 'Google' && autoFetchedModels.length > 0) ? autoFetchedModels : (userModels.length > 0 ? userModels : autoFetchedModels),
        };

        if (initialType === 'proxy') {
            payload.proxyConfig = { serverName: formData.serverName };
            // Ensure name is set to serverName if not provided (which it won't be in UI)
            if (!payload.name) payload.name = formData.serverName;
        }

        // 🚀 [Enhanced] Auto-Connection Check
        // If user hasn't manually tested successfully, or key changed since test
        if (!testResult?.success) {
            try {
                const checkResults = await comprehensiveConnectionTest({
                    apiKey: formData.key,
                    baseUrl: formData.baseUrl,
                    provider: formData.provider,
                    model: userModels.length > 0 ? userModels[0] : (autoFetchedModels[0] || '')
                });

                const isSuccess = checkResults.some(r => r.success);
                if (!isSuccess) {
                    const failMsg = checkResults[0]?.message || '无法连接到 API 服务器';
                    if (!confirm(`⚠️ 连接测试未通过:\n${failMsg}\n\n可能原因: API Key无效、BaseURL错误或网络问题。\n\n是否仍要强制保存?`)) {
                        setIsTesting(false);
                        return;
                    }
                }
            } catch (err: any) {
                if (!confirm(`⚠️ 连接测试出错: ${err.message}\n\n是否仍要强制保存?`)) {
                    setIsTesting(false);
                    return;
                }
            }
        }

        try {
            if (editingSlot) {
                await keyManager.updateKey(editingSlot.id, payload);
            } else {
                await keyManager.addKey(payload.key, payload);
            }
            notify.success('保存成功', autoFetchedModels.length > 0 ? `自动获取到 ${autoFetchedModels.length} 个模型` : 'API 配置已保存');
            onSave?.();
            onClose();
        } catch (e: any) {
            notify.error('保存失败', e.message);
        } finally {
            setIsTesting(false);
        }
    };

    if (!isOpen) return null;

    return ReactDOM.createPortal(
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
                        {/* Name (Hide for Proxy, or preset third-party unless custom) */}
                        {(initialType !== 'proxy' && (initialType !== 'third-party' || presetValue === 'custom')) && (
                            <div>
                                <label className="block text-xs font-medium text-zinc-400 mb-1.5">名称</label>
                                <input
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder={'给这个 Key 起个名字'}
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
                            <div className="flex items-center justify-between mb-1.5">
                                <label className="block text-xs font-medium text-zinc-400">预算限制 ($)</label>
                                {editingSlot && (
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            if (confirm('确定要重置此 Key 的消费统计吗？\n当前已用: $' + (editingSlot.totalCost || 0).toFixed(4))) {
                                                keyManager.resetUsage(editingSlot.id);
                                                // Update local form state visual only if needed, but the modal re-renders due to listener? 
                                                // Actually listener updates 'slots', but 'editingSlot' prop is passed from parent.
                                                // We might need to close/re-open or just trust the parent updates 'editingSlot' reference?
                                                // 'editingSlot' is just a reference. state 'slots' changes. 
                                                // ApiManagementView passes 'editingSlot' state, which is STATIC unless parent updates it.
                                                // Parent 'ApiManagementView' updates 'slots' on change, but 'editingSlot' state there might be stale?
                                                // Actually 'ApiManagementView.tsx' line 34: setEditingSlot(slot).
                                                notify.success('重置成功', '已重置消费统计');
                                            }
                                        }}
                                        className="text-[10px] text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
                                    >
                                        重置已用
                                    </button>
                                )}
                            </div>
                            <input
                                type="number"
                                value={formData.budgetLimit === -1 ? '' : formData.budgetLimit}
                                onChange={e => setFormData({ ...formData, budgetLimit: parseFloat(e.target.value) || -1 })}
                                placeholder="无限制 (-1)"
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
                                <div className="mt-2 animate-in slide-in-from-top-2 duration-200 space-y-2">
                                    <div className="flex gap-2">
                                        <textarea
                                            value={formData.models}
                                            onChange={e => setFormData({ ...formData, models: e.target.value })}
                                            placeholder="gpt-4o, claude-3-opus"
                                            rows={3}
                                            className="flex-1 bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            if (!formData.key || !formData.baseUrl) {
                                                setTestResult({ success: false, message: '请先填写 Base URL 和 API Key' });
                                                return;
                                            }
                                            setIsFetchingModels(true);
                                            try {
                                                let models: string[] = [];
                                                if (formData.provider === 'Google' || formData.baseUrl.includes('googleapis.com')) {
                                                    models = await fetchGoogleModels(formData.key);
                                                } else {
                                                    models = await fetchOpenAICompatModels(formData.key, formData.baseUrl);
                                                }
                                                if (models.length > 0) {
                                                    setFormData(prev => ({ ...prev, models: models.join(', ') }));
                                                    setTestResult({ success: true, message: `成功获取 ${models.length} 个模型` });
                                                } else {
                                                    setTestResult({ success: false, message: '未获取到模型列表，请检查 API 配置' });
                                                }
                                            } catch (e: any) {
                                                setTestResult({ success: false, message: `获取失败: ${e.message}` });
                                            } finally {
                                                setIsFetchingModels(false);
                                            }
                                        }}
                                        disabled={isFetchingModels || !formData.key || !formData.baseUrl}
                                        className="w-full px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 border border-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                                    >
                                        {isFetchingModels ? (
                                            <><Loader2 size={12} className="animate-spin" /> 正在获取...</>
                                        ) : (
                                            <>🔍 自动获取模型列表</>
                                        )}
                                    </button>
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
        </div>,
        document.body
    );
};
