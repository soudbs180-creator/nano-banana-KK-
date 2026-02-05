import { useState, useEffect } from 'react';
import { Server, Zap, Plus, Settings, ChevronDown, ChevronUp, Globe } from 'lucide-react';
import { ApiChannelsView } from './ApiChannelsView';
import { notify } from '../services/notificationService';
import keyManager, { ThirdPartyProvider } from '../services/keyManager';
import { ThirdPartyProviderCard } from './ThirdPartyProviderCard';
import { AddProviderModal } from './AddProviderModal';

/**
 * API 管理入口组件
 * 统一直连和代理两种模式
 */

// 默认代理模型列表（常用模型）
const DEFAULT_PROXY_MODELS = [
  // 图片模型
  'gemini-2.5-flash-image',
  'gemini-3-pro-image-preview',
  'imagen-4.0-generate-001',
  'imagen-4.0-ultra-generate-001',
  'imagen-4.0-fast-generate-001',
  // 视频模型
  'veo-3.1-generate-preview',
  'veo-3.1-fast-generate-preview',
  // 聊天模型
  'gemini-3-pro-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
];

// 代理服务器配置
interface ProxyConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  isActive: boolean;
  status: 'connected' | 'disconnected' | 'checking' | 'error';
  supportedModels?: string[];
  // 计费设置
  budgetLimit?: number;  // -1 = 无限制
  totalCost?: number;    // 累计消耗
  dailyCost?: number;    // 今日消耗
  lastCostReset?: number; // 上次重置时间
}

const PROXY_STORAGE_KEY = 'proxy_server_config';
const PROXY_SLOT_ID = 'proxy_virtual_slot';

// 加载代理配置
const loadProxyConfig = (): ProxyConfig | null => {
  try {
    const stored = localStorage.getItem(PROXY_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

// 保存代理配置
const saveProxyConfig = (config: ProxyConfig | null) => {
  if (config) {
    localStorage.setItem(PROXY_STORAGE_KEY, JSON.stringify(config));
  } else {
    localStorage.removeItem(PROXY_STORAGE_KEY);
  }
};

// 同步代理配置到 keyManager（创建或更新虚拟 slot）
const syncProxyToKeyManager = async (config: ProxyConfig | null) => {
  console.log('[ApiManagement] syncProxyToKeyManager called:', config);

  // 先删除所有代理 slot（通过多种方式识别）
  const existingSlots = keyManager.getSlots();
  const proxySlots = existingSlots.filter(s =>
    // 1. 名称前缀匹配
    s.name?.startsWith('[代理] ') ||
    s.name === '代理服务器' ||
    // 2. 相同 baseUrl（代理地址相同）
    (config?.baseUrl && s.baseUrl === config.baseUrl + '/v1') ||
    // 3. 相同 key（同一个 API key）
    (config?.apiKey && s.key === config.apiKey)
  );

  for (const slot of proxySlots) {
    console.log('[ApiManagement] Removing old proxy slot:', slot.id, slot.name);
    keyManager.removeKey(slot.id);
  }

  // 如果代理配置有效且激活，创建新的 slot
  if (config?.isActive && config.status === 'connected' && config.supportedModels?.length) {
    console.log('[ApiManagement] Creating proxy slot with models:', config.supportedModels);

    const result = await keyManager.addKey(config.apiKey, {
      name: `[代理] ${config.name || 'Antigravity'}`,
      provider: 'OpenAI',
      baseUrl: config.baseUrl + '/v1',
      supportedModels: config.supportedModels,
      budgetLimit: -1,
    });

    if (result.success && result.id) {
      // 立即标记为有效状态
      await keyManager.updateKey(result.id, {
        status: 'valid',
      });
      console.log('[ApiManagement] Proxy slot created:', result.id);
    } else {
      console.error('[ApiManagement] Failed to create proxy slot:', result.error);
    }
  }

  // 强制触发全局刷新
  console.log('[ApiManagement] Final slots:', keyManager.getSlots().map(s => ({ id: s.id, name: s.name, models: s.supportedModels })));
};


// 导出判断是否使用代理模式
export const isProxyModeActive = (): boolean => {
  const config = loadProxyConfig();
  return config?.isActive === true && config.status === 'connected';
};

// 导出获取代理配置
export const getActiveProxyConfig = (): { baseUrl: string; apiKey: string } | null => {
  const config = loadProxyConfig();
  if (config?.isActive && config.baseUrl && config.apiKey) {
    return { baseUrl: config.baseUrl, apiKey: config.apiKey };
  }
  return null;
};

type ApiMode = 'direct' | 'proxy';

const ApiManagementView = () => {
  const [activeMode, setActiveMode] = useState<ApiMode>(() => {
    const proxy = loadProxyConfig();
    return proxy?.isActive ? 'proxy' : 'direct';
  });

  const [proxyConfig, setProxyConfig] = useState<ProxyConfig | null>(loadProxyConfig);
  const [showProxyForm, setShowProxyForm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    baseUrl: '',
    apiKey: '',
    models: '',
    budgetLimit: -1,  // -1 = 无限制
  });

  // 第三方服务商状态
  const [providers, setProviders] = useState<ThirdPartyProvider[]>([]);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ThirdPartyProvider | null>(null);

  // 加载第三方服务商
  useEffect(() => {
    setProviders(keyManager.getProviders());

    // 监听变化
    const unsubscribe = keyManager.subscribe(() => {
      setProviders(keyManager.getProviders());
    });
    return unsubscribe;
  }, []);

  // 初始化时同步代理配置
  useEffect(() => {
    if (proxyConfig?.isActive) {
      syncProxyToKeyManager(proxyConfig);
    }
  }, []);

  // 切换模式时同步
  const handleModeChange = async (mode: ApiMode) => {
    setActiveMode(mode);

    if (proxyConfig) {
      const updatedConfig = { ...proxyConfig, isActive: mode === 'proxy' };
      setProxyConfig(updatedConfig);
      saveProxyConfig(updatedConfig);
      await syncProxyToKeyManager(updatedConfig);
    } else if (mode === 'proxy') {
      // 没有代理配置时不能切换到代理模式
      notify.warning('请先配置', '请先添加代理服务器配置');
      return;
    }

    notify.success('模式切换', mode === 'proxy' ? '已切换到代理模式' : '已切换到直连模式');
  };

  // 保存代理配置
  const handleSaveProxy = async () => {
    if (!formData.baseUrl || !formData.apiKey) {
      notify.error('验证失败', '请填写代理地址和 API Key');
      return;
    }

    // 解析模型列表
    const models = formData.models
      ? formData.models.split(/[,\n]/).map(m => m.trim()).filter(Boolean)
      : DEFAULT_PROXY_MODELS;

    const config: ProxyConfig = {
      id: proxyConfig?.id || Date.now().toString(),
      name: formData.name || 'Antigravity 代理',
      baseUrl: formData.baseUrl.replace(/\/+$/, ''),
      apiKey: formData.apiKey,
      isActive: activeMode === 'proxy',
      status: 'checking',
      supportedModels: models,
      budgetLimit: formData.budgetLimit,
      totalCost: proxyConfig?.totalCost ?? 0,
      dailyCost: proxyConfig?.dailyCost ?? 0,
      lastCostReset: proxyConfig?.lastCostReset ?? Date.now(),
    };

    // 测试连接
    try {
      const response = await fetch(`${config.baseUrl}/v1/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      config.status = response.ok ? 'connected' : 'error';

      // 尝试获取模型列表
      if (response.ok && !formData.models) {
        try {
          const data = await response.json();
          if (data.data && Array.isArray(data.data)) {
            const fetchedModels = data.data.map((m: any) => m.id).filter(Boolean);
            if (fetchedModels.length > 0) {
              config.supportedModels = fetchedModels;
            }
          }
        } catch {
          // 使用默认模型
        }
      }
    } catch {
      config.status = 'disconnected';
    }

    setProxyConfig(config);
    saveProxyConfig(config);
    setShowProxyForm(false);

    // 同步到 keyManager
    if (config.isActive) {
      await syncProxyToKeyManager(config);
    }

    if (config.status === 'connected') {
      notify.success('保存成功', `代理服务器已配置，检测到 ${config.supportedModels?.length || 0} 个模型`);
    } else {
      notify.warning('配置已保存', '但连接测试失败，请检查地址和密钥');
    }
  };

  // 编辑代理配置
  const handleEditProxy = () => {
    if (proxyConfig) {
      setFormData({
        name: proxyConfig.name,
        baseUrl: proxyConfig.baseUrl,
        apiKey: proxyConfig.apiKey,
        models: proxyConfig.supportedModels?.join(', ') || '',
        budgetLimit: proxyConfig.budgetLimit ?? -1,
      });
    }
    setShowProxyForm(true);
  };

  // 删除代理配置
  const handleDeleteProxy = async () => {
    // 删除 keyManager 中的虚拟 slot
    await syncProxyToKeyManager(null);

    setProxyConfig(null);
    saveProxyConfig(null);
    setActiveMode('direct');
    notify.success('删除成功', '已删除代理配置');
  };

  return (
    <div className="space-y-6">
      {/* 标题和模式切换 */}
      <div className="px-1 py-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-2xl font-bold text-left" style={{ color: 'var(--text-primary)' }}>
              API 管理
            </h3>

            {/* 模式切换 */}
            <div className="flex items-center gap-2 rounded-xl p-1" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-light)', borderWidth: '1px' }}>
              <button
                onClick={() => handleModeChange('direct')}
                className="px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors"
                style={{
                  backgroundColor: activeMode === 'direct' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                  color: activeMode === 'direct' ? 'var(--accent-color)' : 'var(--text-tertiary)',
                  borderColor: activeMode === 'direct' ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                  borderWidth: '1px'
                }}
              >
                <Zap size={14} /> 直连模式
              </button>
              <button
                onClick={() => handleModeChange('proxy')}
                disabled={!proxyConfig}
                className="px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors"
                style={{
                  backgroundColor: activeMode === 'proxy' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                  color: activeMode === 'proxy' ? 'var(--accent-color)' : 'var(--text-tertiary)',
                  borderColor: activeMode === 'proxy' ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                  borderWidth: '1px',
                  opacity: proxyConfig ? 1 : 0.5,
                }}
              >
                <Server size={14} /> 代理模式
              </button>
            </div>
          </div>

          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {activeMode === 'direct'
              ? '直接使用 Google API Key，由 KK-Studio 管理负载均衡和模型调度'
              : '通过 Antigravity/OneAPI 代理服务器中转所有请求'}
          </p>
        </div>
      </div>

      {/* 代理服务器配置卡片 */}
      <div className="glass rounded-xl border border-[var(--border-light)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border-light)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              <Server size={18} className="text-blue-400" />
            </div>
            <div>
              <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                代理服务器
              </h4>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Antigravity / OneAPI / NewAPI
              </p>
            </div>
          </div>

          {proxyConfig ? (
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-1 rounded ${proxyConfig.status === 'connected' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                {proxyConfig.status === 'connected' ? '● 已连接' : '○ 未连接'}
              </span>
              <button
                onClick={handleEditProxy}
                className="p-2 rounded-lg hover:bg-blue-500/10 transition-colors"
                style={{ color: '#6366f1' }}
              >
                <Settings size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowProxyForm(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ backgroundColor: 'rgba(99, 102, 241, 0.15)', color: '#6366f1' }}
            >
              <Plus size={12} /> 配置代理
            </button>
          )}
        </div>

        {/* 代理信息 */}
        {proxyConfig && !showProxyForm && (
          <div className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>地址:</span>
              <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{proxyConfig.baseUrl}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>名称:</span>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{proxyConfig.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>模型:</span>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{proxyConfig.supportedModels?.length || 0} 个已配置</span>
            </div>
            <button
              onClick={handleDeleteProxy}
              className="text-xs text-red-400 hover:text-red-300 mt-2"
            >
              删除配置
            </button>
          </div>
        )}

        {/* 代理配置表单 */}
        {showProxyForm && (
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                服务器名称
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Antigravity 代理"
                className="w-full px-3 py-2 rounded-lg text-sm border"
                style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
              />
            </div>
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

            {/* 高级选项 */}
            <div>
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-xs font-medium"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                高级选项
              </button>

              {showAdvanced && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      支持的模型（每行一个，留空自动获取）
                    </label>
                    <textarea
                      value={formData.models}
                      onChange={(e) => setFormData({ ...formData, models: e.target.value })}
                      placeholder={`gemini-2.5-flash-image\ngemini-3-pro-image-preview\nimagen-4.0-generate-001\n...`}
                      rows={6}
                      className="w-full px-3 py-2 rounded-lg text-xs border font-mono"
                      style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
                    />
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      留空将尝试从代理服务器自动获取模型列表
                    </p>
                  </div>

                  {/* 预算限制 */}
                  <div>
                    <label className="block text-xs font-medium mb-1.5 flex justify-between items-center" style={{ color: 'var(--text-secondary)' }}>
                      <span>💰 预算限制</span>
                      <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                        {formData.budgetLimit < 0 ? '♾️ 无限制' : `$${formData.budgetLimit.toFixed(2)}`}
                      </span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="-1"
                        className="flex-1 px-3 py-2 rounded-lg text-sm border font-mono"
                        style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
                        placeholder="-1 表示无限制"
                        value={formData.budgetLimit === -1 ? '' : formData.budgetLimit}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || val === '-') {
                            setFormData({ ...formData, budgetLimit: -1 });
                          } else {
                            const num = parseFloat(val);
                            if (!isNaN(num)) {
                              setFormData({ ...formData, budgetLimit: num });
                            }
                          }
                        }}
                        onBlur={(e) => {
                          const val = parseFloat(e.target.value);
                          if (isNaN(val) || val < 0) {
                            setFormData({ ...formData, budgetLimit: -1 });
                          }
                        }}
                      />
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>USD</span>
                    </div>
                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      -1 = 无限制 | &gt;0 = 达到预算后自动停用
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 justify-end pt-2">
              <button
                onClick={() => setShowProxyForm(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium transition-colors"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
              >
                取消
              </button>
              <button
                onClick={handleSaveProxy}
                className="px-4 py-2 rounded-lg text-xs font-medium transition-colors"
                style={{ backgroundColor: 'rgba(99, 102, 241, 0.15)', color: '#6366f1' }}
              >
                保存并测试
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 直连模式：显示原有的 API 通道管理 */}
      {activeMode === 'direct' && <ApiChannelsView />}

      {/* 代理模式提示 */}
      {activeMode === 'proxy' && proxyConfig && (
        <div className="glass rounded-xl p-4 border border-[var(--border-light)]">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            ✓ 代理模式已启用，所有 API 请求将通过 <span className="font-mono text-blue-400">{proxyConfig.baseUrl}</span> 中转
          </p>
          <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
            已配置 {proxyConfig.supportedModels?.length || 0} 个模型可供选择
          </p>
        </div>
      )}

      {/* 第三方 API 服务商区域 */}
      <div className="glass rounded-xl border border-[var(--border-light)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border-light)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              <Globe size={18} className="text-purple-400" />
            </div>
            <div>
              <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                第三方 API
              </h4>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                智谱、万清、DeepSeek 等
              </p>
            </div>
          </div>

          <button
            onClick={() => { setEditingProvider(null); setShowAddProvider(true); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ backgroundColor: 'rgba(147, 51, 234, 0.15)', color: '#a855f7' }}
          >
            <Plus size={12} /> 添加服务商
          </button>
        </div>

        {/* 服务商列表 */}
        <div className="p-4">
          {providers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                尚未配置第三方服务商
              </p>
              <button
                onClick={() => { setEditingProvider(null); setShowAddProvider(true); }}
                className="mt-3 text-xs text-purple-400 hover:text-purple-300 transition-colors"
              >
                + 点击添加第一个服务商
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {providers.map(provider => (
                <ThirdPartyProviderCard
                  key={provider.id}
                  provider={provider}
                  onEdit={(p) => { setEditingProvider(p); setShowAddProvider(true); }}
                  onDelete={(id) => {
                    keyManager.removeProvider(id);
                    notify.success('已删除', '服务商配置已删除');
                  }}
                  onToggle={(id, active) => {
                    keyManager.updateProvider(id, { isActive: active });
                    notify.success(active ? '已启用' : '已禁用', '服务商状态已更新');
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* 统计信息 */}
        {providers.length > 0 && (
          <div className="px-4 py-3 border-t border-[var(--border-light)] flex justify-between text-xs" style={{ color: 'var(--text-tertiary)' }}>
            <span>共 {providers.length} 个服务商，{providers.filter(p => p.isActive).length} 个已启用</span>
            <span>今日消耗：${keyManager.getProviderStats().dailyCost.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* 添加/编辑服务商模态框 */}
      <AddProviderModal
        isOpen={showAddProvider}
        onClose={() => { setShowAddProvider(false); setEditingProvider(null); }}
        onSave={() => {
          notify.success('保存成功', editingProvider ? '服务商配置已更新' : '已添加新服务商');
          setShowAddProvider(false);
          setEditingProvider(null);
        }}
        editingProvider={editingProvider}
      />
    </div>
  );
};

export default ApiManagementView;
