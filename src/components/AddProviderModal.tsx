/**
 * 添加/编辑第三方 API 服务商模态框
 * 支持预设服务商选择和自定义配置
 */
import React, { useState, useEffect } from 'react';
import { ThirdPartyProvider, PROVIDER_PRESETS, keyManager } from '../services/keyManager';
import { testModelsList } from '../services/connectionTest';

interface AddProviderModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (provider: ThirdPartyProvider) => void;
    editingProvider?: ThirdPartyProvider | null;
}

export const AddProviderModal: React.FC<AddProviderModalProps> = ({
    isOpen,
    onClose,
    onSave,
    editingProvider
}) => {
    const [step, setStep] = useState<'select' | 'configure'>('select');
    const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

    // 表单状态
    const [name, setName] = useState('');
    const [baseUrl, setBaseUrl] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [models, setModels] = useState('');
    const [showApiKey, setShowApiKey] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
    const [testError, setTestError] = useState('');

    // 编辑模式初始化
    useEffect(() => {
        if (editingProvider) {
            setStep('configure');
            setName(editingProvider.name);
            setBaseUrl(editingProvider.baseUrl);
            setApiKey(editingProvider.apiKey);
            setModels(editingProvider.models.join(', '));
        } else {
            resetForm();
        }
    }, [editingProvider, isOpen]);

    const resetForm = () => {
        setStep('select');
        setSelectedPreset(null);
        setName('');
        setBaseUrl('');
        setApiKey('');
        setModels('');
        setTestResult(null);
        setTestError('');
    };

    // 选择预设
    const handleSelectPreset = (presetKey: string) => {
        setSelectedPreset(presetKey);
        const preset = PROVIDER_PRESETS[presetKey];
        if (preset) {
            setName(preset.name);
            setBaseUrl(preset.baseUrl);
            setModels(preset.models.join(', '));
        }
        setStep('configure');
    };

    // 测试连接
    const handleTestConnection = async () => {
        setIsTesting(true);
        setTestResult(null);
        setTestError('');

        try {
            // 使用统一的 testModelsList 进行测试
            const result = await testModelsList({
                apiKey,
                baseUrl,
                provider: name.includes('Google') || baseUrl.includes('googleapis') ? 'Google' : 'Custom'
            });

            if (result.success) {
                setTestResult('success');
                // 尝试更新模型列表
                if (result.details && result.details.models && Array.isArray(result.details.models)) {
                    const modelList = result.details.models;
                    if (modelList.length > 0) {
                        setModels(modelList.slice(0, 20).join(', ')); // Limit to first 20 to avoid bloat
                    }
                }
            } else {
                setTestResult('error');
                setTestError(result.message || '连接失败');
            }
        } catch (error: any) {
            setTestResult('error');
            setTestError(error.message || '连接失败');
        } finally {
            setIsTesting(false);
        }
    };

    // 保存配置
    const handleSave = () => {
        const modelList = models.split(/[,，\n]/).map(m => m.trim()).filter(m => m);

        if (editingProvider) {
            // 更新现有服务商
            keyManager.updateProvider(editingProvider.id, {
                name,
                baseUrl,
                apiKey,
                models: modelList,
                status: 'active'
            });
            const updated = keyManager.getProvider(editingProvider.id);
            if (updated) onSave(updated);
        } else {
            // 创建新服务商
            const provider = keyManager.addProvider({
                name,
                baseUrl,
                apiKey,
                models: modelList,
                format: 'auto',
                icon: PROVIDER_PRESETS[selectedPreset || 'custom']?.icon || '⚙️',
                isActive: true
            });
            keyManager.updateProvider(provider.id, { status: 'active' });
            onSave(provider);
        }

        onClose();
        resetForm();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* 背景遮罩 */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* 模态框内容 */}
            <div className="relative w-full max-w-lg mx-4 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-primary)] shadow-2xl overflow-hidden">
                {/* 头部 */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-secondary)]">
                    <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                        {editingProvider ? '编辑服务商' : '添加 API 服务商'}
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
                    >
                        <svg className="w-5 h-5 text-[var(--text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* 内容区域 */}
                <div className="p-6">
                    {step === 'select' && !editingProvider && (
                        <div className="space-y-4">
                            <p className="text-sm text-[var(--text-secondary)] mb-4">
                                选择 API 服务商或添加自定义服务
                            </p>

                            <div className="grid grid-cols-2 gap-3">
                                {Object.entries(PROVIDER_PRESETS).map(([key, preset]) => (
                                    <button
                                        key={key}
                                        onClick={() => handleSelectPreset(key)}
                                        className="flex items-center gap-3 p-4 rounded-xl border border-[var(--border-secondary)] hover:border-[var(--accent-primary)] hover:bg-[var(--bg-secondary)] transition-all text-left"
                                    >
                                        <span className="text-2xl">{preset.icon}</span>
                                        <div>
                                            <div className="font-medium text-[var(--text-primary)]">
                                                {preset.name}
                                            </div>
                                            <div className="text-xs text-[var(--text-tertiary)]">
                                                {preset.models.length} 个模型
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === 'configure' && (
                        <div className="space-y-4">
                            {/* 返回按钮 */}
                            {!editingProvider && (
                                <button
                                    onClick={() => setStep('select')}
                                    className="flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                    返回选择
                                </button>
                            )}

                            {/* 名称 */}
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                                    服务商名称
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="如：智谱 AI"
                                    className="w-full px-4 py-2.5 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                                />
                            </div>

                            {/* Base URL */}
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                                    API 地址 (Base URL)
                                </label>
                                <input
                                    type="text"
                                    value={baseUrl}
                                    onChange={(e) => setBaseUrl(e.target.value)}
                                    placeholder="https://api.example.com/v1"
                                    className="w-full px-4 py-2.5 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] font-mono text-sm"
                                />
                            </div>

                            {/* API Key */}
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                                    API Key
                                </label>
                                <div className="relative">
                                    <input
                                        type={showApiKey ? 'text' : 'password'}
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                        placeholder="sk-..."
                                        className="w-full px-4 py-2.5 pr-20 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] font-mono text-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowApiKey(!showApiKey)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                                    >
                                        {showApiKey ? '隐藏' : '显示'}
                                    </button>
                                </div>
                            </div>

                            {/* 模型列表 */}
                            <div>
                                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                                    支持的模型 (逗号分隔)
                                </label>
                                <textarea
                                    value={models}
                                    onChange={(e) => setModels(e.target.value)}
                                    placeholder="model-1, model-2, model-3"
                                    rows={3}
                                    className="w-full px-4 py-2.5 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] font-mono text-sm resize-none"
                                />
                            </div>

                            {/* 测试连接 */}
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleTestConnection}
                                    disabled={!baseUrl || !apiKey || isTesting}
                                    className="px-4 py-2 rounded-lg border border-[var(--border-secondary)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {isTesting ? '测试中...' : '🔍 测试连接'}
                                </button>

                                {testResult === 'success' && (
                                    <span className="text-sm text-green-500">✓ 连接成功</span>
                                )}
                                {testResult === 'error' && (
                                    <span className="text-sm text-red-500">✗ {testError}</span>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* 底部按钮 */}
                {step === 'configure' && (
                    <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--border-secondary)]">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
                        >
                            取消
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!name || !baseUrl || !apiKey}
                            className="px-6 py-2 rounded-lg text-sm font-medium text-white bg-[var(--accent-primary)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                        >
                            {editingProvider ? '保存更改' : '添加服务商'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AddProviderModal;
