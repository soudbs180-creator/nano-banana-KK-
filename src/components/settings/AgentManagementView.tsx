import { useState } from 'react';
import { Bot, Plus, Trash2, Settings, TestTube, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { notify } from '../../services/system/notificationService';

/**
 * Agent 管理界面
 * 用于配置和测试 AI Agent
 */

interface AgentConfig {
    id: string;
    name: string;
    description: string;
    systemPrompt: string;
    apiChannels: string[]; // 关联的API信道ID列表
    temperature?: number;
    maxTokens?: number;
    model?: string;
    isActive: boolean;
    createdAt: number;
}

const AgentManagementView = () => {
    const [agents, setAgents] = useState<AgentConfig[]>([]);
    const [showAddForm, setShowAddForm] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // 表单数据
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        systemPrompt: '',
        temperature: 0.7,
        maxTokens: 2048,
    });

    // 添加Agent
    const handleAdd = () => {
        if (!formData.name || !formData.systemPrompt) {
            notify.error('输入错误', '请填写名称和系统提示词');
            return;
        }

        const newAgent: AgentConfig = {
            id: Date.now().toString(),
            name: formData.name,
            description: formData.description,
            systemPrompt: formData.systemPrompt,
            temperature: formData.temperature,
            maxTokens: formData.maxTokens,
            apiChannels: [],
            isActive: true,
            createdAt: Date.now(),
        };

        setAgents([...agents, newAgent]);

        // 重置表单
        setFormData({
            name: '',
            description: '',
            systemPrompt: '',
            temperature: 0.7,
            maxTokens: 2048,
        });
        setShowAddForm(false);

        notify.success('创建成功', `已添加 Agent：${formData.name}`);
    };

    // 删除Agent
    const handleDelete = (id: string) => {
        setAgents(agents.filter(a => a.id !== id));
        notify.success('删除成功', '已删除 Agent');
    };

    // 切换展开/折叠
    const toggleExpand = (id: string) => {
        setExpandedId(expandedId === id ? null : id);
    };

    return (
        <div className="space-y-6 pb-6">
            {/* 顶部说明 */}
            <div className="glass rounded-xl p-4 border border-[var(--border-light)]">
                <div className="flex items-center gap-3 mb-2">
                    <Bot className="text-purple-400" size={20} />
                    <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Agent 智能助手配置
                    </h3>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    创建和管理 AI Agent，配置提示词模板和行为参数
                </p>
            </div>

            {/* Agent列表 */}
            <div className="space-y-3">
                {agents.map((agent) => {
                    const isExpanded = expandedId === agent.id;

                    return (
                        <div
                            key={agent.id}
                            className="glass rounded-xl border border-[var(--border-light)] overflow-hidden transition-all"
                        >
                            {/* 标题栏 */}
                            <div className="p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div
                                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                                        style={{ backgroundColor: 'rgba(168, 85, 247, 0.15)' }}
                                    >
                                        <Bot className="text-purple-400" size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                                                {agent.name}
                                            </h4>
                                            <span
                                                className="px-2 py-0.5 rounded text-[10px] font-medium"
                                                style={{
                                                    backgroundColor: agent.isActive ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-tertiary)',
                                                    color: agent.isActive ? '#10b981' : 'var(--text-secondary)'
                                                }}
                                            >
                                                {agent.isActive ? '激活' : '停用'}
                                            </span>
                                        </div>
                                        {agent.description && (
                                            <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                                                {agent.description}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={() => toggleExpand(agent.id)}
                                        className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-tertiary)]"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </button>
                                    <button
                                        onClick={() => handleDelete(agent.id)}
                                        className="p-2 rounded-lg transition-colors hover:bg-red-500/10"
                                        style={{ color: '#ef4444' }}
                                        title="删除"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>

                            {/* 展开部分 */}
                            {isExpanded && (
                                <div className="px-4 pb-4 space-y-4 border-t border-[var(--border-light)]">
                                    <div className="pt-4">
                                        {/* 系统提示词 */}
                                        <div className="mb-4">
                                            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                                                <Sparkles size={12} className="inline mr-1" />
                                                系统提示词
                                            </label>
                                            <div
                                                className="px-3 py-2 rounded-lg text-xs font-mono max-h-40 overflow-y-auto custom-scrollbar"
                                                style={{
                                                    backgroundColor: 'var(--bg-tertiary)',
                                                    color: 'var(--text-secondary)',
                                                    whiteSpace: 'pre-wrap',
                                                    wordBreak: 'break-word'
                                                }}
                                            >
                                                {agent.systemPrompt}
                                            </div>
                                        </div>

                                        {/* 参数配置 */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>
                                                    温度 (Temperature)
                                                </label>
                                                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                                    {agent.temperature ?? 0.7}
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>
                                                    最大令牌数
                                                </label>
                                                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                                    {agent.maxTokens ?? 2048}
                                                </div>
                                            </div>
                                        </div>

                                        {/* 测试按钮 */}
                                        <div className="mt-4 pt-4 border-t border-[var(--border-light)]">
                                            <button
                                                className="w-full px-4 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2"
                                                style={{
                                                    backgroundColor: 'rgba(99, 102, 241, 0.15)',
                                                    color: '#6366f1'
                                                }}
                                                onClick={() => notify.info('提示', '测试功能即将上线')}
                                            >
                                                <TestTube size={14} />
                                                测试 Agent
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* 空状态 */}
                {agents.length === 0 && !showAddForm && (
                    <div className="glass rounded-xl p-12 border border-dashed border-[var(--border-light)] text-center">
                        <Bot className="mx-auto mb-3" size={32} style={{ color: 'var(--text-tertiary)' }} />
                        <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
                            还没有配置 Agent
                        </p>
                        <p className="text-xs mb-4" style={{ color: 'var(--text-tertiary)' }}>
                            创建 AI Agent 来自定义助手行为和功能
                        </p>
                    </div>
                )}
            </div>

            {/* 添加表单 */}
            {showAddForm && (
                <div className="glass rounded-xl p-4 border border-[var(--border-light)] space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                            创建新 Agent
                        </h4>
                    </div>

                    <div className="space-y-3">
                        <div>
                            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                Agent 名称
                            </label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="例如：代码助手"
                                className="w-full px-3 py-2 rounded-lg text-sm border"
                                style={{
                                    backgroundColor: 'var(--bg-tertiary)',
                                    borderColor: 'var(--border-light)',
                                    color: 'var(--text-primary)'
                                }}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                描述（可选）
                            </label>
                            <input
                                type="text"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="简短描述这个 Agent 的用途"
                                className="w-full px-3 py-2 rounded-lg text-sm border"
                                style={{
                                    backgroundColor: 'var(--bg-tertiary)',
                                    borderColor: 'var(--border-light)',
                                    color: 'var(--text-primary)'
                                }}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                系统提示词
                            </label>
                            <textarea
                                value={formData.systemPrompt}
                                onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                                placeholder="你是一个专业的代码助手..."
                                rows={6}
                                className="w-full px-3 py-2 rounded-lg text-sm border font-mono resize-none custom-scrollbar"
                                style={{
                                    backgroundColor: 'var(--bg-tertiary)',
                                    borderColor: 'var(--border-light)',
                                    color: 'var(--text-primary)'
                                }}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    温度 (0-2)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max="2"
                                    step="0.1"
                                    value={formData.temperature}
                                    onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                                    className="w-full px-3 py-2 rounded-lg text-sm border"
                                    style={{
                                        backgroundColor: 'var(--bg-tertiary)',
                                        borderColor: 'var(--border-light)',
                                        color: 'var(--text-primary)'
                                    }}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    最大令牌数
                                </label>
                                <input
                                    type="number"
                                    min="256"
                                    max="8192"
                                    step="256"
                                    value={formData.maxTokens}
                                    onChange={(e) => setFormData({ ...formData, maxTokens: parseInt(e.target.value) })}
                                    className="w-full px-3 py-2 rounded-lg text-sm border"
                                    style={{
                                        backgroundColor: 'var(--bg-tertiary)',
                                        borderColor: 'var(--border-light)',
                                        color: 'var(--text-primary)'
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 justify-end pt-2">
                        <button
                            onClick={() => {
                                setShowAddForm(false);
                                setFormData({
                                    name: '',
                                    description: '',
                                    systemPrompt: '',
                                    temperature: 0.7,
                                    maxTokens: 2048,
                                });
                            }}
                            className="px-4 py-2 rounded-lg text-xs font-medium transition-colors"
                            style={{
                                backgroundColor: 'var(--bg-tertiary)',
                                color: 'var(--text-secondary)'
                            }}
                        >
                            取消
                        </button>
                        <button
                            onClick={handleAdd}
                            className="px-4 py-2 rounded-lg text-xs font-medium transition-colors"
                            style={{
                                backgroundColor: 'rgba(168, 85, 247, 0.15)',
                                color: '#a855f7'
                            }}
                        >
                            创建 Agent
                        </button>
                    </div>
                </div>
            )}

            {/* 底部添加按钮 */}
            {!showAddForm && (
                <button
                    onClick={() => setShowAddForm(true)}
                    className="w-full glass rounded-xl p-4 border border-dashed border-[var(--border-light)] hover:border-purple-400/50 transition-all flex items-center justify-center gap-2"
                >
                    <Plus size={16} style={{ color: '#a855f7' }} />
                    <span className="text-sm font-medium" style={{ color: '#a855f7' }}>
                        创建 Agent
                    </span>
                </button>
            )}
        </div>
    );
};

export default AgentManagementView;
