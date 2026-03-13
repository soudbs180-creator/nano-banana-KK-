/**
 * User API Key Settings Component
 * 
 * 功能：
 * 1. 用户添加自己的API密钥
 * 2. 查看和管理已有的密钥
 * 3. 密钥隔离：只能看到自己的密钥
 */

import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Eye, EyeOff, Key, AlertCircle } from 'lucide-react';
import { userApiKeyService, type UserApiKey } from '../../services/api/userApiKeyService';
import { notify } from '../../services/system/notificationService';

const PROVIDER_OPTIONS = [
  { value: 'Google', label: 'Google Gemini', icon: '🔵' },
  { value: 'OpenAI', label: 'OpenAI', icon: '🟢' },
  { value: 'Anthropic', label: 'Anthropic Claude', icon: '🟡' },
  { value: '智谱', label: '智谱 AI', icon: '🔴' },
  { value: '火山引擎', label: '火山引擎', icon: '🟠' },
  { value: '阿里云', label: '阿里云', icon: '🟣' },
  { value: '腾讯云', label: '腾讯云', icon: '⚫' },
  { value: 'Custom', label: '自定义', icon: '⚪' },
];

export const UserApiKeySettings: React.FC = () => {
  const [apiKeys, setApiKeys] = useState<UserApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showKeyId, setShowKeyId] = useState<string | null>(null);
  
  // 表单状态
  const [formData, setFormData] = useState({
    name: '',
    provider: 'Google',
    apiKey: '',
    baseUrl: '',
  });

  // 加载API密钥列表
  const loadApiKeys = async () => {
    setLoading(true);
    try {
      const keys = await userApiKeyService.getUserApiKeys();
      setApiKeys(keys);
    } catch (error: any) {
      notify.error('加载失败', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApiKeys();
  }, []);

  // 添加新密钥
  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.apiKey.trim()) {
      notify.warning('请填写完整信息', '名称和API密钥不能为空');
      return;
    }

    try {
      await userApiKeyService.addUserApiKey(
        formData.name,
        formData.provider,
        formData.apiKey,
        formData.baseUrl || undefined
      );
      
      notify.success('添加成功', '您的API密钥已安全保存');
      setFormData({ name: '', provider: 'Google', apiKey: '', baseUrl: '' });
      setShowAddForm(false);
      await loadApiKeys();
    } catch (error: any) {
      notify.error('添加失败', error.message);
    }
  };

  // 删除密钥
  const handleDeleteKey = async (id: string) => {
    if (!confirm('确定要删除这个API密钥吗？此操作不可恢复。')) {
      return;
    }

    try {
      await userApiKeyService.deleteUserApiKey(id);
      notify.success('删除成功', 'API密钥已删除');
      await loadApiKeys();
    } catch (error: any) {
      notify.error('删除失败', error.message);
    }
  };

  // 切换密钥状态
  const handleToggleStatus = async (key: UserApiKey) => {
    try {
      await userApiKeyService.updateUserApiKey(key.id, {
        is_active: !key.is_active,
      });
      notify.success('状态更新', key.is_active ? '密钥已禁用' : '密钥已启用');
      await loadApiKeys();
    } catch (error: any) {
      notify.error('更新失败', error.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* 说明卡片 */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-blue-400 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-blue-200">API密钥安全说明</h4>
            <p className="mt-1 text-xs text-blue-300/80 leading-relaxed">
              • 您添加的API密钥仅您自己可见，其他用户无法查看<br/>
              • 密钥将加密存储，系统会在调用时自动解密使用<br/>
              • 使用自己的API密钥调用模型时，不会扣除您的积分<br/>
              • 如果未配置自己的密钥，系统会使用管理员提供的公共模型（需消耗积分）
            </p>
          </div>
        </div>
      </div>

      {/* 添加按钮 */}
      <button
        type="button"
        onClick={() => setShowAddForm(!showAddForm)}
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500 transition-colors"
      >
        <Plus size={16} />
        添加API密钥
      </button>

      {/* 添加表单 */}
      {showAddForm && (
        <form
          onSubmit={handleAddKey}
          className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-tertiary)]/50 p-4 space-y-3"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs text-[var(--text-tertiary)]">密钥名称</span>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="例如：我的OpenAI密钥"
                className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs text-[var(--text-tertiary)]">服务商</span>
              <select
                value={formData.provider}
                onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
              >
                {PROVIDER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.icon} {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 md:col-span-2">
              <span className="text-xs text-[var(--text-tertiary)]">API密钥</span>
              <input
                type="password"
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                placeholder="sk-xxxxxxxxxxxxxxxx"
                className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-mono"
              />
            </label>

            <label className="space-y-1 md:col-span-2">
              <span className="text-xs text-[var(--text-tertiary)]">
                自定义代理地址（可选）
              </span>
              <input
                type="text"
                value={formData.baseUrl}
                onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                placeholder="https://api.example.com"
                className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-surface)] px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 transition-colors"
            >
              保存
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-lg border border-[var(--border-light)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
            >
              取消
            </button>
          </div>
        </form>
      )}

      {/* API密钥列表 */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-[var(--text-primary)]">
          我的API密钥 ({apiKeys.length}/10)
        </h4>

        {loading ? (
          <div className="text-center py-8 text-[var(--text-tertiary)] text-sm">
            加载中...
          </div>
        ) : apiKeys.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-light)] p-8 text-center">
            <Key className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-2" />
            <p className="text-sm text-[var(--text-tertiary)]">
              还没有添加API密钥
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              添加自己的密钥后，使用这些密钥调用模型不会扣除积分
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className={`flex items-center justify-between gap-3 p-3 rounded-lg border transition-all ${
                  key.is_active
                    ? 'bg-[var(--bg-surface)] border-[var(--border-light)]'
                    : 'bg-[var(--bg-elevated)]/50 border-[var(--border-light)] opacity-60'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {key.name}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--text-tertiary)]">
                      {key.provider}
                    </span>
                    {!key.is_active && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400">
                        已禁用
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-xs text-[var(--text-tertiary)] font-mono">
                      {showKeyId === key.id
                        ? '实际密钥已解密使用'
                        : key.api_key_encrypted}
                    </code>
                    <button
                      type="button"
                      onClick={() =>
                        setShowKeyId(showKeyId === key.id ? null : key.id)
                      }
                      className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                    >
                      {showKeyId === key.id ? (
                        <EyeOff size={12} />
                      ) : (
                        <Eye size={12} />
                      )}
                    </button>
                  </div>
                  {key.call_count > 0 && (
                    <div className="text-xs text-[var(--text-tertiary)] mt-1">
                      已调用 {key.call_count} 次
                      {key.total_cost > 0 && ` · 累计费用 $${key.total_cost.toFixed(4)}`}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {/* 启用/禁用切换 */}
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(key)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      key.is_active ? 'bg-indigo-500' : 'bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        key.is_active ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>

                  {/* 删除按钮 */}
                  <button
                    type="button"
                    onClick={() => handleDeleteKey(key.id)}
                    className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="删除"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserApiKeySettings;
