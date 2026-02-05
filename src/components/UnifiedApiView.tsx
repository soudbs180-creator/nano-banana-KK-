import { useState, useEffect } from 'react';
import { Server, Key, Plus, Trash2, CheckCircle, XCircle, RefreshCw, Edit2, Radio, Zap, Globe, ChevronDown, ChevronUp, Activity } from 'lucide-react';
import { notify } from '../services/notificationService';

/**
 * 统一 API 配置界面
 * 整合直连和代理两种模式的配置
 */

// API 通道类型
export type ApiChannelType = 'proxy' | 'direct';

// API 通道配置
export interface ApiChannel {
    id: string;
    name: string;
    type: ApiChannelType;
    isActive: boolean;
    status: 'connected' | 'disconnected' | 'checking' | 'error';
    lastChecked?: string;
    // 代理模式
    baseUrl?: string;
    apiKey?: string;
    // 直连模式
    googleApiKey?: string;
}

// 存储键
const STORAGE_KEY = 'unified_api_channels';
const ACTIVE_CHANNEL_KEY = 'active_api_channel';

// 加载配置
const loadChannels = (): ApiChannel[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
};

// 保存配置
const saveChannels = (channels: ApiChannel[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(channels));
};

// 获取激活的通道
export const getActiveChannel = (): ApiChannel | null => {
    const channels = loadChannels();
    return channels.find(c => c.isActive) || null;
};

// 导出判断是否使用代理模式
export const isProxyMode = (): boolean => {
    const active = getActiveChannel();
    return active?.type === 'proxy';
};

// 导出获取代理配置
export const getProxyConfig = (): { baseUrl: string; apiKey: string } | null => {
    const active = getActiveChannel();
    if (active?.type === 'proxy' && active.baseUrl && active.apiKey) {
        return { baseUrl: active.baseUrl, apiKey: active.apiKey };
    }
    return null;
};

const UnifiedApiView = () => {
    const [channels, setChannels] = useState<ApiChannel[]>([]);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // 表单状态
    const [formData, setFormData] = useState<{
        name: string;
        type: ApiChannelType;
        baseUrl: string;
        apiKey: string;
        googleApiKey: string;
    }>({
        name: '',
        type: 'proxy',
        baseUrl: '',
        apiKey: '',
        googleApiKey: '',
    });

    // 加载配置
    useEffect(() => {
        setChannels(loadChannels());
    }, []);

    // 保存配置
    const updateChannels = (newChannels: ApiChannel[]) => {
        setChannels(newChannels);
        saveChannels(newChannels);
    };

    // 重置表单
    const resetForm = () => {
        setFormData({
            name: '',
            type: 'proxy',
            baseUrl: '',
            apiKey: '',
            googleApiKey: '',
        });
        setShowAddForm(false);
        setEditingId(null);
    };

    // 添加/编辑通道
    const handleSave = async () => {
        // 验证
        if (!formData.name) {
            notify.error('验证失败', '请输入通道名称');
            return;
        }
        if (formData.type === 'proxy' && (!formData.baseUrl || !formData.apiKey)) {
            notify.error('验证失败', '请填写代理地址和 API Key');
            return;
        }
        if (formData.type === 'direct' && !formData.googleApiKey) {
            notify.error('验证失败', '请填写 Google API Key');
            return;
        }

        const newChannel: ApiChannel = {
            id: editingId || Date.now().toString(),
            name: formData.name,
            type: formData.type,
            isActive: channels.length === 0, // 第一个自动激活
            status: 'checking',
            baseUrl: formData.type === 'proxy' ? formData.baseUrl.replace(/\/+$/, '') : undefined,
            apiKey: formData.type === 'proxy' ? formData.apiKey : undefined,
            googleApiKey: formData.type === 'direct' ? formData.googleApiKey : undefined,
        };

        let newChannels: ApiChannel[];
        if (editingId) {
            newChannels = channels.map(c => c.id === editingId ? { ...newChannel, isActive: c.isActive } : c);
            notify.success('更新成功', `已更新通道: ${formData.name}`);
        } else {
            newChannels = [...channels, newChannel];
            notify.success('添加成功', `已添加通道: ${formData.name}`);
        }

        updateChannels(newChannels);
        resetForm();

        // 测试连接
        await testConnection(newChannel.id);
    };

    // 删除通道
    const handleDelete = (id: string) => {
        const channel = channels.find(c => c.id === id);
        if (channel?.isActive && channels.length > 1) {
            notify.error('操作失败', '请先切换到其他通道再删除');
            return;
        }

        const newChannels = channels.filter(c => c.id !== id);
        // 如果删除的是激活通道且还有其他通道，激活第一个
        if (channel?.isActive && newChannels.length > 0) {
            newChannels[0].isActive = true;
        }
        updateChannels(newChannels);
        notify.success('删除成功', '已删除通道');
    };

    // 切换激活通道
    const handleSetActive = (id: string) => {
        const newChannels = channels.map(c => ({
            ...c,
            isActive: c.id === id,
        }));
        updateChannels(newChannels);
        const channel = channels.find(c => c.id === id);
        notify.success('切换成功', `已切换到: ${channel?.name}`);
    };

    // 编辑通道
    const handleEdit = (channel: ApiChannel) => {
        setFormData({
            name: channel.name,
            type: channel.type,
            baseUrl: channel.baseUrl || '',
            apiKey: channel.apiKey || '',
            googleApiKey: channel.googleApiKey || '',
        });
        setEditingId(channel.id);
        setShowAddForm(true);
    };

    // 测试连接
    const testConnection = async (channelId: string) => {
        const channel = channels.find(c => c.id === channelId);
        if (!channel) return;

        // 更新状态为检测中
        const updatedChannels = channels.map(c =>
            c.id === channelId ? { ...c, status: 'checking' as const } : c
        );
        updateChannels(updatedChannels);

        try {
            let success = false;
            let message = '';

            if (channel.type === 'proxy') {
                // 代理模式：测试 /v1/models 端点
                const response = await fetch(`${channel.baseUrl}/v1/models`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${channel.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                });
                success = response.ok;
                message = success ? '代理服务器响应正常' : `连接失败: ${response.status}`;
            } else {
                // 直连模式：测试 Google API
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models?key=${channel.googleApiKey}`
                );
                success = response.ok;
                message = success ? 'Google API 连接正常' : `连接失败: ${response.status}`;
            }

            const finalChannels = loadChannels().map(c =>
                c.id === channelId ? {
                    ...c,
                    status: success ? 'connected' as const : 'error' as const,
                    lastChecked: new Date().toISOString(),
                } : c
            );
            updateChannels(finalChannels);

            if (success) {
                notify.success('连接成功', message);
            } else {
                notify.error('连接失败', message);
            }
        } catch (error) {
            const finalChannels = loadChannels().map(c =>
                c.id === channelId ? {
                    ...c,
                    status: 'disconnected' as const,
                    lastChecked: new Date().toISOString(),
                } : c
            );
            updateChannels(finalChannels);
            notify.error('网络错误', error instanceof Error ? error.message : '未知错误');
        }
    };

    // 获取状态配置
    const getStatusConfig = (status: ApiChannel['status']) => {
        switch (status) {
            case 'connected':
                return { icon: CheckCircle, color: '#10b981', text: '已连接' };
            case 'disconnected':
                return { icon: XCircle, color: '#6b7280', text: '未连接' };
            case 'checking':
                return { icon: RefreshCw, color: '#f59e0b', text: '检测中', animate: true };
            case 'error':
                return { icon: XCircle, color: '#ef4444', text: '错误' };
        }
    };

    return (
        <div className="space-y-4">
            {/* 顶部说明 */}
            <div className="glass rounded-xl p-4 border border-[var(--border-light)]">
                <div className="flex items-center gap-3 mb-2">
                    <Activity className="text-blue-400" size={20} />
                    <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                        API 通道配置
                    </h3>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    配置 API 通道后，图片生成将自动使用激活的通道。支持代理模式（Antigravity/OneAPI）和直连模式（Google API）。
                </p>
            </div>

            {/* 通道列表 */}
            <div className="space-y-3">
                {channels.map((channel) => {
                    const statusConfig = getStatusConfig(channel.status);
                    const StatusIcon = statusConfig.icon;
                    const isExpanded = expandedId === channel.id;

                    return (
                        <div
                            key={channel.id}
                            className="glass rounded-xl border transition-all overflow-hidden"
                            style={{
                                borderColor: channel.isActive ? 'rgba(99, 102, 241, 0.5)' : 'var(--border-light)',
                                backgroundColor: channel.isActive ? 'rgba(99, 102, 241, 0.05)' : 'var(--bg-secondary)'
                            }}
                        >
                            {/* 主要信息 */}
                            <div className="p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        {/* 类型图标 */}
                                        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                            {channel.type === 'proxy' ? (
                                                <Server size={18} className="text-blue-400" />
                                            ) : (
                                                <Zap size={18} className="text-amber-400" />
                                            )}
                                        </div>

                                        {/* 名称和状态 */}
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                                    {channel.name}
                                                </h4>
                                                {channel.isActive && (
                                                    <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: 'rgba(99, 102, 241, 0.15)', color: '#6366f1' }}>
                                                        ✓ 激活
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                                    {channel.type === 'proxy' ? '代理模式' : '直连模式'}
                                                </span>
                                                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>•</span>
                                                <div className="flex items-center gap-1">
                                                    <StatusIcon size={12} style={{ color: statusConfig.color }} className={statusConfig.animate ? 'animate-spin' : ''} />
                                                    <span className="text-xs" style={{ color: statusConfig.color }}>{statusConfig.text}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 操作按钮 */}
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => testConnection(channel.id)}
                                            className="p-2 rounded-lg transition-colors hover:bg-blue-500/10"
                                            style={{ color: '#6366f1' }}
                                            title="测试连接"
                                        >
                                            <RefreshCw size={14} />
                                        </button>
                                        <button
                                            onClick={() => handleEdit(channel)}
                                            className="p-2 rounded-lg transition-colors hover:bg-blue-500/10"
                                            style={{ color: 'var(--text-tertiary)' }}
                                            title="编辑"
                                        >
                                            <Edit2 size={14} />
                                        </button>
                                        {!channel.isActive && (
                                            <button
                                                onClick={() => handleSetActive(channel.id)}
                                                className="p-2 rounded-lg transition-colors hover:bg-green-500/10"
                                                style={{ color: '#10b981' }}
                                                title="激活"
                                            >
                                                <Radio size={14} />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleDelete(channel.id)}
                                            className="p-2 rounded-lg transition-colors hover:bg-red-500/10"
                                            style={{ color: '#ef4444' }}
                                            title="删除"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                        <button
                                            onClick={() => setExpandedId(isExpanded ? null : channel.id)}
                                            className="p-2 rounded-lg transition-colors"
                                            style={{ color: 'var(--text-tertiary)' }}
                                        >
                                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* 展开详情 */}
                            {isExpanded && (
                                <div className="px-4 pb-4 pt-2 border-t border-[var(--border-light)] space-y-2">
                                    {channel.type === 'proxy' ? (
                                        <>
                                            <div className="flex items-center gap-2">
                                                <Globe size={12} style={{ color: 'var(--text-tertiary)' }} />
                                                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>地址:</span>
                                                <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{channel.baseUrl}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Key size={12} style={{ color: 'var(--text-tertiary)' }} />
                                                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Key:</span>
                                                <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{channel.apiKey?.substring(0, 15)}...</span>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <Key size={12} style={{ color: 'var(--text-tertiary)' }} />
                                            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Google API Key:</span>
                                            <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{channel.googleApiKey?.substring(0, 15)}...</span>
                                        </div>
                                    )}
                                    {channel.lastChecked && (
                                        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                            上次检查: {new Date(channel.lastChecked).toLocaleString()}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* 空状态 */}
                {channels.length === 0 && !showAddForm && (
                    <div className="glass rounded-xl p-12 border border-dashed border-[var(--border-light)] text-center">
                        <Server className="mx-auto mb-3" size={32} style={{ color: 'var(--text-tertiary)' }} />
                        <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
                            还没有配置 API 通道
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            添加代理服务器（推荐）或 Google API Key 开始使用
                        </p>
                    </div>
                )}
            </div>

            {/* 添加/编辑表单 */}
            {showAddForm && (
                <div className="glass rounded-xl p-4 border border-[var(--border-light)] space-y-4">
                    <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {editingId ? '编辑通道' : '添加 API 通道'}
                    </h4>

                    {/* 类型选择 */}
                    <div>
                        <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                            通道类型
                        </label>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setFormData({ ...formData, type: 'proxy' })}
                                className="flex-1 p-3 rounded-lg border flex items-center gap-2 transition-colors"
                                style={{
                                    borderColor: formData.type === 'proxy' ? 'rgba(99, 102, 241, 0.5)' : 'var(--border-light)',
                                    backgroundColor: formData.type === 'proxy' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                                }}
                            >
                                <Server size={16} className="text-blue-400" />
                                <div className="text-left">
                                    <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>代理模式</div>
                                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Antigravity / OneAPI</div>
                                </div>
                            </button>
                            <button
                                onClick={() => setFormData({ ...formData, type: 'direct' })}
                                className="flex-1 p-3 rounded-lg border flex items-center gap-2 transition-colors"
                                style={{
                                    borderColor: formData.type === 'direct' ? 'rgba(99, 102, 241, 0.5)' : 'var(--border-light)',
                                    backgroundColor: formData.type === 'direct' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                                }}
                            >
                                <Zap size={16} className="text-amber-400" />
                                <div className="text-left">
                                    <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>直连模式</div>
                                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Google API</div>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* 名称 */}
                    <div>
                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                            通道名称
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="例如: Antigravity 主服务器"
                            className="w-full px-3 py-2 rounded-lg text-sm border"
                            style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
                        />
                    </div>

                    {/* 代理模式字段 */}
                    {formData.type === 'proxy' && (
                        <>
                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    代理地址
                                </label>
                                <input
                                    type="text"
                                    value={formData.baseUrl}
                                    onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                                    placeholder="http://127.0.0.1:8045"
                                    className="w-full px-3 py-2 rounded-lg text-sm border font-mono"
                                    style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
                                />
                                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                                    不需要加 /v1 后缀
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    API Key
                                </label>
                                <input
                                    type="password"
                                    value={formData.apiKey}
                                    onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                                    placeholder="sk-antigravity"
                                    className="w-full px-3 py-2 rounded-lg text-sm border font-mono"
                                    style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
                                />
                            </div>
                        </>
                    )}

                    {/* 直连模式字段 */}
                    {formData.type === 'direct' && (
                        <div>
                            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                Google API Key
                            </label>
                            <input
                                type="password"
                                value={formData.googleApiKey}
                                onChange={(e) => setFormData({ ...formData, googleApiKey: e.target.value })}
                                placeholder="AIza..."
                                className="w-full px-3 py-2 rounded-lg text-sm border font-mono"
                                style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
                            />
                            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                                从 Google AI Studio 获取
                            </p>
                        </div>
                    )}

                    {/* 按钮 */}
                    <div className="flex items-center gap-2 justify-end pt-2">
                        <button
                            onClick={resetForm}
                            className="px-4 py-2 rounded-lg text-xs font-medium transition-colors"
                            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                        >
                            取消
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-4 py-2 rounded-lg text-xs font-medium transition-colors"
                            style={{ backgroundColor: 'rgba(99, 102, 241, 0.15)', color: '#6366f1' }}
                        >
                            {editingId ? '保存修改' : '确认添加'}
                        </button>
                    </div>
                </div>
            )}

            {/* 添加按钮 */}
            {!showAddForm && (
                <button
                    onClick={() => setShowAddForm(true)}
                    className="w-full glass rounded-xl p-4 border border-dashed border-[var(--border-light)] hover:border-blue-400/50 transition-all flex items-center justify-center gap-2"
                >
                    <Plus size={16} style={{ color: '#6366f1' }} />
                    <span className="text-sm font-medium" style={{ color: '#6366f1' }}>
                        添加 API 通道
                    </span>
                </button>
            )}
        </div>
    );
};

export default UnifiedApiView;
