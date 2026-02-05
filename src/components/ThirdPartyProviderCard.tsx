/**
 * 第三方 API 服务商卡片组件
 * 显示服务商状态、使用量和配置
 */
import React, { useState } from 'react';
import { ThirdPartyProvider } from '../services/keyManager';

interface ThirdPartyProviderCardProps {
    provider: ThirdPartyProvider;
    onEdit: (provider: ThirdPartyProvider) => void;
    onDelete: (id: string) => void;
    onToggle: (id: string, active: boolean) => void;
}

export const ThirdPartyProviderCard: React.FC<ThirdPartyProviderCardProps> = ({
    provider,
    onEdit,
    onDelete,
    onToggle
}) => {
    const [showMenu, setShowMenu] = useState(false);

    // 格式化费用显示
    const formatCost = (cost: number) => {
        if (cost < 0.01) return '< $0.01';
        return `$${cost.toFixed(2)}`;
    };

    // 状态颜色
    const statusColors = {
        active: 'bg-green-500',
        error: 'bg-red-500',
        checking: 'bg-yellow-500'
    };

    const statusLabels = {
        active: '正常',
        error: '错误',
        checking: '检测中'
    };

    return (
        <div
            className={`
                relative p-4 rounded-xl border transition-all duration-200
                ${provider.isActive
                    ? 'border-[var(--border-primary)] bg-[var(--bg-secondary)]'
                    : 'border-[var(--border-secondary)] bg-[var(--bg-tertiary)] opacity-60'
                }
                hover:border-[var(--accent-primary)] hover:shadow-lg
            `}
        >
            {/* 头部：图标 + 名称 + 状态 */}
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-2xl">{provider.icon || '🔌'}</span>
                    <div>
                        <h4 className="font-medium text-[var(--text-primary)]">
                            {provider.name}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`w-2 h-2 rounded-full ${statusColors[provider.status]}`} />
                            <span className="text-xs text-[var(--text-tertiary)]">
                                {statusLabels[provider.status]}
                            </span>
                        </div>
                    </div>
                </div>

                {/* 开关 + 菜单 */}
                <div className="flex items-center gap-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={provider.isActive}
                            onChange={(e) => onToggle(provider.id, e.target.checked)}
                            className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-[var(--bg-tertiary)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--accent-primary)]"></div>
                    </label>

                    <div className="relative">
                        <button
                            onClick={() => setShowMenu(!showMenu)}
                            className="p-1 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
                        >
                            <svg className="w-5 h-5 text-[var(--text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                            </svg>
                        </button>

                        {showMenu && (
                            <>
                                <div
                                    className="fixed inset-0 z-10"
                                    onClick={() => setShowMenu(false)}
                                />
                                <div className="absolute right-0 top-full mt-1 z-20 w-32 py-1 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-primary)] shadow-lg">
                                    <button
                                        onClick={() => { onEdit(provider); setShowMenu(false); }}
                                        className="w-full px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
                                    >
                                        ✏️ 编辑
                                    </button>
                                    <button
                                        onClick={() => { onDelete(provider.id); setShowMenu(false); }}
                                        className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-[var(--bg-secondary)]"
                                    >
                                        🗑️ 删除
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* 模型数量 */}
            <div className="flex flex-wrap gap-1 mb-3">
                {provider.models.slice(0, 3).map(model => (
                    <span
                        key={model}
                        className="px-2 py-0.5 text-xs rounded-md bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                    >
                        {model}
                    </span>
                ))}
                {provider.models.length > 3 && (
                    <span className="px-2 py-0.5 text-xs rounded-md bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]">
                        +{provider.models.length - 3}
                    </span>
                )}
            </div>

            {/* 费用统计 */}
            <div className="flex justify-between text-xs border-t border-[var(--border-secondary)] pt-2">
                <div>
                    <span className="text-[var(--text-tertiary)]">今日消耗</span>
                    <span className="ml-1 text-[var(--text-primary)] font-medium">
                        {formatCost(provider.usage.dailyCost)}
                    </span>
                </div>
                <div>
                    <span className="text-[var(--text-tertiary)]">累计消耗</span>
                    <span className="ml-1 text-[var(--text-primary)] font-medium">
                        {formatCost(provider.usage.totalCost)}
                    </span>
                </div>
            </div>

            {/* 错误提示 */}
            {provider.status === 'error' && provider.lastError && (
                <div className="mt-2 p-2 rounded-lg bg-red-500/10 text-xs text-red-400">
                    {provider.lastError}
                </div>
            )}
        </div>
    );
};

export default ThirdPartyProviderCard;
