import { useState } from 'react';
import { Server, Link, Key, BarChart3, Settings, Plus, Trash2, CheckCircle, XCircle, Clock } from 'lucide-react';
import { notify } from '../services/notificationService';

/**
 * OneAPI 管理界面 - 简化版
 * 用于管理 OneAPI/NewAPI 服务器配置
 */

interface OneAPIProfile {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  status: 'online' | 'offline' | 'checking';
  isActive: boolean;
  // 统计数据
  totalRequests?: number;
  successRate?: number;
  avgResponseTime?: number;
}

const NewApiAdminView = () => {
  const [profiles, setProfiles] = useState<OneAPIProfile[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // 表单数据
  const [formData, setFormData] = useState({
    name: '',
    baseUrl: '',
    apiKey: ''
  });

  // 添加配置
  const handleAdd = () => {
    if (!formData.name || !formData.baseUrl || !formData.apiKey) {
      notify({ message: '请填写完整信息', type: 'error' });
      return;
    }

    const newProfile: OneAPIProfile = {
      id: Date.now().toString(),
      name: formData.name,
      baseUrl: formData.baseUrl,
      apiKey: formData.apiKey,
      status: 'checking',
      isActive: profiles.length === 0, // 第一个自动设为激活
    };

    setProfiles([...profiles, newProfile]);

    // 重置表单
    setFormData({ name: '', baseUrl: '', apiKey: '' });
    setShowAddForm(false);

    notify({ message: `已添加配置: ${formData.name}`, type: 'success' });

    // 模拟检查状态
    setTimeout(() => {
      setProfiles(prev => prev.map(p =>
        p.id === newProfile.id ? { ...p, status: 'online' as const, successRate: 99.5, avgResponseTime: 245 } : p
      ));
    }, 1500);
  };

  // 删除配置
  const handleDelete = (id: string) => {
    const profile = profiles.find(p => p.id === id);
    if (profile?.isActive && profiles.length > 1) {
      notify({ message: '请先切换到其他配置再删除', type: 'error' });
      return;
    }

    setProfiles(profiles.filter(p => p.id !== id));
    notify({ message: '已删除配置', type: 'success' });
  };

  // 切换激活状态
  const handleSetActive = (id: string) => {
    setProfiles(profiles.map(p => ({
      ...p,
      isActive: p.id === id
    })));

    const profile = profiles.find(p => p.id === id);
    notify({ message: `已切换到: ${profile?.name}`, type: 'success' });
  };

  // 获取状态图标和颜色
  const getStatusConfig = (status: OneAPIProfile['status']) => {
    switch (status) {
      case 'online':
        return { icon: CheckCircle, color: '#10b981', text: '在线' };
      case 'offline':
        return { icon: XCircle, color: '#ef4444', text: '离线' };
      case 'checking':
        return { icon: Clock, color: '#f59e0b', text: '检测中' };
    }
  };

  return (
    <div className="space-y-6 pb-6">
      {/* 顶部说明 */}
      <div className="glass rounded-xl p-4 border border-[var(--border-light)]">
        <div className="flex items-center gap-3 mb-2">
          <Server className="text-blue-400" size={20} />
          <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            OneAPI 服务器配置
          </h3>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          管理远程 OneAPI/NewAPI 服务器,统一调度多个API密钥和渠道
        </p>
      </div>

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
                </div>

                <div className="flex items-center gap-2">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
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
                    {profile.apiKey.substring(0, 10)}...
                  </span>
                </div>
              </div>

              {/* 统计信息 */}
              {profile.status === 'online' && profile.successRate !== undefined && (
                <div className="flex items-center gap-4 pt-3 border-t border-[var(--border-light)]">
                  <div className="flex items-center gap-2">
                    <BarChart3 size={14} style={{ color: 'var(--text-tertiary)' }} />
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>成功率:</span>
                    <span className="text-xs font-semibold text-emerald-400">
                      {profile.successRate}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock size={14} style={{ color: 'var(--text-tertiary)' }} />
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>响应:</span>
                    <span className="text-xs font-semibold text-blue-400">
                      {profile.avgResponseTime}ms
                    </span>
                  </div>
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
              还没有配置 OneAPI 服务器
            </p>
            <p className="text-xs mb-4" style={{ color: 'var(--text-tertiary)' }}>
              添加 OneAPI 服务器以统一管理多个 API 渠道
            </p>
          </div>
        )}
      </div>

      {/* 添加表单 */}
      {showAddForm && (
        <div className="glass rounded-xl p-4 border border-[var(--border-light)] space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              添加 OneAPI 服务器
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
                placeholder="https://api.example.com"
                className="w-full px-3 py-2 rounded-lg text-sm border font-mono"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  borderColor: 'var(--border-light)',
                  color: 'var(--text-primary)'
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                API 密钥
              </label>
              <input
                type="password"
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                placeholder="sk-..."
                className="w-full px-3 py-2 rounded-lg text-sm border font-mono"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  borderColor: 'var(--border-light)',
                  color: 'var(--text-primary)'
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 justify-end pt-2">
            <button
              onClick={() => {
                setShowAddForm(false);
                setFormData({ name: '', baseUrl: '', apiKey: '' });
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
            添加 OneAPI 服务器
          </span>
        </button>
      )}
    </div>
  );
};

export default NewApiAdminView;
