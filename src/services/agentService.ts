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
            } else {
                // 初始化默认Agent
                this.agents = [
                    {
                        id: 'default',
                        name: '通用助手',
                        description: '适用于日常对话和任务处理',
                        systemPrompt: '你是一个专业、友好的AI助手。请用简洁明了的方式回答用户的问题。',
                        temperature: 0.7,
                        maxTokens: 2048,
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
