import { notify } from './notificationService';

/**
 * Agent 配置接口
 */
export interface AgentConfig {
    id: string;
    name: string;
    description: string;
    systemPrompt: string;
    temperature?: number;
    maxTokens?: number;
    isActive: boolean;
    createdAt: number;
}

const STORAGE_KEY = 'kk-agents';

const ADVANCED_AGENT_PROMPT = '你是 KK Studio 的全能执行 Agent。请在每次回复前先做意图识别（问答/生成图片/修改图片/文档总结），然后按对应策略输出：\n- 问答：先给结论，再给3-5条关键依据，最后给可执行建议。\n- 生成图片：输出结构化创作要点（主体、场景、构图、光线、风格、细节、限制项）。\n- 修改图片：明确“保留项/修改项/禁止项”，优先保持主体一致性。\n- 文档任务：先摘要，再提炼要点和行动清单。\n要求：准确、专业、结构化、可执行，避免空话。';

/**
 * Agent 配置管理服务
 */
class AgentService {
    private agents: AgentConfig[] = [];
    private listeners: Set<() => void> = new Set();

    constructor() {
        this.loadFromStorage();
    }

    /**
     * 从localStorage加载Agent配置
     */
    private loadFromStorage(): void {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                this.agents = JSON.parse(stored);
                const defaultAgent = this.agents.find(a => a.id === 'default');
                if (defaultAgent && (!defaultAgent.systemPrompt || defaultAgent.systemPrompt.includes('专业、友好的AI助手'))) {
                    defaultAgent.name = '全能执行Agent';
                    defaultAgent.description = '自动识别问答/生图/改图/文档等场景并执行';
                    defaultAgent.systemPrompt = ADVANCED_AGENT_PROMPT;
                    if (!defaultAgent.maxTokens || defaultAgent.maxTokens < 4096) {
                        defaultAgent.maxTokens = 4096;
                    }
                    this.saveToStorage();
                }
            } else {
                // 初始化默认Agent
                this.agents = [
                    {
                        id: 'default',
                        name: '全能执行Agent',
                        description: '自动识别问答/生图/改图/文档等场景并执行',
                        systemPrompt: ADVANCED_AGENT_PROMPT,
                        temperature: 0.7,
                        maxTokens: 4096,
                        isActive: true,
                        createdAt: Date.now()
                    }
                ];
                this.saveToStorage();
            }
        } catch (error) {
            console.error('[AgentService] 加载失败:', error);
            this.agents = [];
        }
    }

    /**
     * 保存到localStorage
     */
    private saveToStorage(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.agents));
            this.notifyListeners();
        } catch (error) {
            console.error('[AgentService] 保存失败:', error);
        }
    }

    /**
     * 订阅变更通知
     */
    subscribe(callback: () => void): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    /**
     * 通知所有订阅者
     */
    private notifyListeners(): void {
        this.listeners.forEach(callback => callback());
    }

    /**
     * 获取所有Agent
     */
    getAll(): AgentConfig[] {
        return [...this.agents];
    }

    /**
     * 获取当前激活的Agent
     */
    getActive(): AgentConfig | null {
        return this.agents.find(agent => agent.isActive) || null;
    }

    /**
     * 根据ID获取Agent
     */
    getById(id: string): AgentConfig | null {
        return this.agents.find(agent => agent.id === id) || null;
    }

    /**
     * 添加Agent
     */
    add(config: Omit<AgentConfig, 'id' | 'createdAt'>): AgentConfig {
        const newAgent: AgentConfig = {
            ...config,
            id: Date.now().toString(),
            createdAt: Date.now()
        };

        this.agents.push(newAgent);
        this.saveToStorage();

        return newAgent;
    }

    /**
     * 更新Agent
     */
    update(id: string, updates: Partial<AgentConfig>): boolean {
        const index = this.agents.findIndex(agent => agent.id === id);
        if (index === -1) return false;

        this.agents[index] = {
            ...this.agents[index],
            ...updates,
            id, // 确保ID不被修改
            createdAt: this.agents[index].createdAt // 确保创建时间不被修改
        };

        this.saveToStorage();
        return true;
    }

    /**
     * 删除Agent
     */
    delete(id: string): boolean {
        const index = this.agents.findIndex(agent => agent.id === id);
        if (index === -1) return false;

        // 不允许删除默认Agent
        if (this.agents[index].id === 'default') {
            notify.warning('无法删除', '默认Agent不能删除');
            return false;
        }

        this.agents.splice(index, 1);
        this.saveToStorage();
        return true;
    }

    /**
     * 激活Agent
     */
    activate(id: string): boolean {
        // 先取消所有激活状态
        this.agents.forEach(agent => agent.isActive = false);

        // 激活指定Agent
        const target = this.agents.find(agent => agent.id === id);
        if (!target) return false;

        target.isActive = true;
        this.saveToStorage();
        return true;
    }
}

// 导出单例
export const agentService = new AgentService();
