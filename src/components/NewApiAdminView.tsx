import { useState, useEffect } from 'react';
import { Server, Link, Key, BarChart3, Plus, Trash2, CheckCircle, XCircle, Clock, RefreshCw, Activity, TrendingUp, Zap, Database, ChevronDown, ChevronUp } from 'lucide-react';
import { notify } from '../services/notificationService';
import { cliProxyService, CLIProxyConfig, CLIProxyUsage, UsageResponse } from '../services/cliProxyService';

/**
 * OneAPI / CLIProxyAPI 管理界面
 * 支持 OneAPI/NewAPI 和 CLIProxyAPI/RouterForMe 服务器配置
 */

const NewApiAdminView = () => {
  const [profiles, setProfiles] = useState<CLIProxyConfig[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [usageData, setUsageData] = useState<UsageResponse | null>(null);
  const [showUsageDetails, setShowUsageDetails] = useState(false);

  // 表单数据
  const [formData, setFormData] = useState({
    name: '',
    baseUrl: '',
    managementKey: ''
  });

  // 初始化加载
  useEffect(() => {
    loadProfiles();
  }, []);

  // 加载配置
  const loadProfiles = () => {
    const configs = cliProxyService.getConfigs();
    setProfiles(configs);

    // 加载激活配置的 Usage
    const activeConfig = configs.find(c => c.isActive);
    if (activeConfig) {
      loadUsage(activeConfig.id);
    }
  };

  // 加载 Usage 统计
  const loadUsage = async (configId?: string) => {
    setLoading(true);
    try {
      const usage = await cliProxyService.getUsage(configId);
      setUsageData(usage);
    } catch (error) {
      console.error('加载 Usage 失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 添加配置
  const handleAdd = async () => {
    if (!formData.name || !formData.baseUrl || !formData.managementKey) {
      notify.error('验证失败', '请填写完整信息');
      return;
    }

    const newConfig = cliProxyService.addConfig({
      name: formData.name,
      baseUrl: formData.baseUrl.replace(/\/+$/, ''), // 移除结尾斜杠
      managementKey: formData.managementKey,
      isActive: profiles.length === 0,
    });

    // 重置表单
    setFormData({ name: '', baseUrl: '', managementKey: '' });
    setShowAddForm(false);
    loadProfiles();

    notify.success('添加成功', `已添加配置: ${formData.name}`);

    // 测试连接
    const result = await cliProxyService.testConnection(newConfig);
    if (result.success) {
      notify.success('连接成功', result.version ? `版本: ${result.version}` : '服务器响应正常');
      loadProfiles();
      loadUsage(newConfig.id);
    } else {
      notify.error('连接失败', result.message);
      loadProfiles();
    }
  };

  // 删除配置
  const handleDelete = (id: string) => {
    const profile = profiles.find(p => p.id === id);
    if (profile?.isActive && profiles.length > 1) {
      notify.error('操作失败', '请先切换到其他配置再删除');
      return;
    }

    cliProxyService.removeConfig(id);
    loadProfiles();
    notify.success('删除成功', '已删除配置');
  };

  // 切换激活状态
  const handleSetActive = (id: string) => {
    cliProxyService.setActive(id);
    loadProfiles();
    loadUsage(id);

    const profile = profiles.find(p => p.id === id);
    notify.success('切换成功', `已切换到: ${profile?.name}`);
  };

  // 刷新连接
  const handleRefresh = async (config: CLIProxyConfig) => {
    cliProxyService.updateConfig(config.id, { status: 'checking' });
    loadProfiles();

    const result = await cliProxyService.testConnection(config);
    if (result.success) {
      notify.success('刷新成功', '服务器状态正常');
      loadUsage(config.id);
    } else {
      notify.error('刷新失败', result.message);
    }
    loadProfiles();
  };

  // 获取状态配置
  const getStatusConfig = (status: CLIProxyConfig['status']) => {
    switch (status) {
      case 'connected':
        return { icon: CheckCircle, color: '#10b981', text: '已连接' };
      case 'disconnected':
        return { icon: XCircle, color: '#6b7280', text: '未连接' };
      case 'checking':
        return { icon: Clock, color: '#f59e0b', text: '检测中' };
      case 'error':
        return { icon: XCircle, color: '#ef4444', text: '错误' };
    }
  };

  // 格式化数字
  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  // 计算成功率
  const getSuccessRate = (usage: CLIProxyUsage) => {
    if (usage.total_requests === 0) return 0;
    return ((usage.success_count / usage.total_requests) * 100).toFixed(1);
  };

  return (
    <div className="space-y-6 pb-6">
      {/* 顶部说明 */}
      <div className="glass rounded-xl p-4 border border-[var(--border-light)]">
        <div className="flex items-center gap-3 mb-2">
          <Server className="text-blue-400" size={20} />
          <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            API 代理服务管理
          </h3>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          管理 OneAPI/NewAPI 或 CLIProxyAPI/RouterForMe 服务器，统一调度多个 API 渠道
        </p>
      </div>

      {/* Usage 统计面板 */}
      {usageData && usageData.usage && (
        <div className="glass rounded-xl border border-[var(--border-light)] overflow-hidden">
          <button
            onClick={() => setShowUsageDetails(!showUsageDetails)}
            className="w-full p-4 flex items-center justify-between hover:bg-[var(--bg-secondary)] transition-colors"
          >
            <div className="flex items-center gap-3">
              <Activity className="text-emerald-400" size={18} />
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Usage 统计
              </span>
              {loading && <RefreshCw size={14} className="animate-spin text-blue-400" />}
            </div>
            {showUsageDetails ? (
              <ChevronUp size={16} style={{ color: 'var(--text-tertiary)' }} />
            ) : (
              <ChevronDown size={16} style={{ color: 'var(--text-tertiary)' }} />
            )}
          </button>

          {/* 统计概览 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 pb-4">
            <div className="glass rounded-lg p-3 border border-[var(--border-light)]">
              <div className="flex items-center gap-2 mb-1">
                <Zap size={14} className="text-blue-400" />
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>总请求</span>
              </div>
              <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                {formatNumber(usageData.usage.total_requests)}
              </div>
            </div>

            <div className="glass rounded-lg p-3 border border-[var(--border-light)]">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={14} className="text-emerald-400" />
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>成功率</span>
              </div>
              <div className="text-lg font-bold text-emerald-400">
                {getSuccessRate(usageData.usage)}%
              </div>
            </div>

            <div className="glass rounded-lg p-3 border border-[var(--border-light)]">
              <div className="flex items-center gap-2 mb-1">
                <Database size={14} className="text-purple-400" />
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>总 Token</span>
              </div>
              <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                {formatNumber(usageData.usage.total_tokens)}
              </div>
            </div>

            <div className="glass rounded-lg p-3 border border-[var(--border-light)]">
              <div className="flex items-center gap-2 mb-1">
                <XCircle size={14} className="text-red-400" />
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>失败</span>
              </div>
              <div className="text-lg font-bold text-red-400">
                {usageData.usage.failure_count}
              </div>
            </div>
          </div>

          {/* 详细统计 */}
          {showUsageDetails && (
            <div className="px-4 pb-4 space-y-4 border-t border-[var(--border-light)] pt-4">
              {/* 按日统计 */}
              {Object.keys(usageData.usage.requests_by_day).length > 0 && (
                <div>
                  <h5 className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    按日请求量
                  </h5>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(usageData.usage.requests_by_day).slice(-7).map(([date, count]) => (
                      <div key={date} className="px-2 py-1 rounded-md text-xs" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                        <span style={{ color: 'var(--text-tertiary)' }}>{date.slice(5)}: </span>
                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 按模型统计 */}
              {Object.keys(usageData.usage.apis).length > 0 && (
                <div>
                  <h5 className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    API 调用统计
                  </h5>
                  <div className="space-y-2">
                    {Object.entries(usageData.usage.apis).slice(0, 5).map(([api, data]) => (
                      <div key={api} className="flex items-center justify-between p-2 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                        <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                          {api.length > 40 ? api.slice(0, 40) + '...' : api}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            {data.total_requests} 次
                          </span>
                          <span className="text-xs text-purple-400">
                            {formatNumber(data.total_tokens)} tokens
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 刷新按钮 */}
              <button
                onClick={() => loadUsage()}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors hover:bg-blue-500/10"
                style={{ color: '#6366f1' }}
              >
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                刷新统计
              </button>
            </div>
          )}
        </div>
      )}

      {/* 配置列表 */}
      <div className="space-y-3">
        {profiles.map((profile) => {
          const statusConfig = getStatusConfig(profile.status);
          const StatusIcon = statusConfig.icon;

          return (
            <div
              key={profile.id}
              className="glass rounded-xl p-4 border transition-all"
              style={{
                borderColor: profile.isActive ? 'rgba(99, 102, 241, 0.5)' : 'var(--border-light)',
                backgroundColor: profile.isActive ? 'rgba(99, 102, 241, 0.05)' : 'var(--bg-secondary)'
              }}
            >
              {/* 标题栏 */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="px-3 py-1 rounded-lg text-xs font-semibold"
                    style={{
                      backgroundColor: profile.isActive ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-tertiary)',
                      color: profile.isActive ? '#6366f1' : 'var(--text-secondary)'
                    }}
                  >
                    {profile.isActive ? '✓ 激活中' : '未激活'}
                  </div>
                  <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {profile.name}
                  </h4>
                  <div className="flex items-center gap-1.5">
                    <StatusIcon size={14} style={{ color: statusConfig.color }} />
                    <span className="text-xs" style={{ color: statusConfig.color }}>
                      {statusConfig.text}
                    </span>
                  </div>
                  {profile.version && (
                    <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}>
                      v{profile.version}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRefresh(profile)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-blue-500/10"
                    style={{ color: '#6366f1' }}
                    title="刷新状态"
                  >
                    <RefreshCw size={14} />
                  </button>
                  {!profile.isActive && (
                    <button
                      onClick={() => handleSetActive(profile.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        color: '#6366f1'
                      }}
                    >
                      切换激活
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(profile.id)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10"
                    style={{ color: '#ef4444' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* 配置信息 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <Link size={14} style={{ color: 'var(--text-tertiary)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>服务器:</span>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {profile.baseUrl}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Key size={14} style={{ color: 'var(--text-tertiary)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>密钥:</span>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {profile.managementKey.substring(0, 10)}...
                  </span>
                </div>
              </div>

              {/* 上次检查时间 */}
              {profile.lastChecked && (
                <div className="mt-2 pt-2 border-t border-[var(--border-light)]">
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    上次检查: {new Date(profile.lastChecked).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {/* 空状态 */}
        {profiles.length === 0 && !showAddForm && (
          <div className="glass rounded-xl p-12 border border-dashed border-[var(--border-light)] text-center">
            <Server className="mx-auto mb-3" size={32} style={{ color: 'var(--text-tertiary)' }} />
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              还没有配置 API 代理服务器
            </p>
            <p className="text-xs mb-4" style={{ color: 'var(--text-tertiary)' }}>
              支持 OneAPI/NewAPI 和 CLIProxyAPI/RouterForMe
            </p>
          </div>
        )}
      </div>

      {/* 添加表单 */}
      {showAddForm && (
        <div className="glass rounded-xl p-4 border border-[var(--border-light)] space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              添加 API 代理服务器
            </h4>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                配置名称
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="例如: 主服务器"
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
                服务器地址
              </label>
              <input
                type="text"
                value={formData.baseUrl}
                onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                placeholder="http://127.0.0.1:8045"
                className="w-full px-3 py-2 rounded-lg text-sm border font-mono"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  borderColor: 'var(--border-light)',
                  color: 'var(--text-primary)'
                }}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                不需要加 /v1 后缀
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                管理密钥
              </label>
              <input
                type="password"
                value={formData.managementKey}
                onChange={(e) => setFormData({ ...formData, managementKey: e.target.value })}
                placeholder="sk-..."
                className="w-full px-3 py-2 rounded-lg text-sm border font-mono"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  borderColor: 'var(--border-light)',
                  color: 'var(--text-primary)'
                }}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                用于管理 API 和获取统计信息
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 justify-end pt-2">
            <button
              onClick={() => {
                setShowAddForm(false);
                setFormData({ name: '', baseUrl: '', managementKey: '' });
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
                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                color: '#6366f1'
              }}
            >
              确认添加
            </button>
          </div>
        </div>
      )}

      {/* 底部添加按钮 */}
      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full glass rounded-xl p-4 border border-dashed border-[var(--border-light)] hover:border-blue-400/50 transition-all flex items-center justify-center gap-2"
        >
          <Plus size={16} style={{ color: '#6366f1' }} />
          <span className="text-sm font-medium" style={{ color: '#6366f1' }}>
            添加服务器
          </span>
        </button>
      )}
    </div>
  );
};

export default NewApiAdminView;
