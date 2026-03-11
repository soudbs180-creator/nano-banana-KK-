/**
 * 安全API密钥管理组件
 * 特点：
 * 1. 永不显示完整API密钥（只显示配置状态）
 * 2. 密钥通过服务端加密存储
 * 3. 支持添加/启用/禁用/删除操作
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Key,
  Plus,
  Trash2,
  Power,
  PowerOff,
  Shield,
  AlertCircle,
  Check,
  X,
  ExternalLink,
  Lock,
} from 'lucide-react';
import {
  getUserApiKeys,
  addUserApiKey,
  deleteApiKey,
  toggleApiKeyStatus,
  API_PROVIDERS,
  type UserApiKeyInfo,
  type ApiProvider,
} from '@/services/security/apiKeySecureStorage';

interface SecureApiKeyManagerProps {
  className?: string;
}

export function SecureApiKeyManager({ className = '' }: SecureApiKeyManagerProps) {
  const [keys, setKeys] = useState<UserApiKeyInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 添加表单状态
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyProvider, setNewKeyProvider] = useState<ApiProvider>('Google');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newKeyBaseUrl, setNewKeyBaseUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 加载密钥列表
  const loadKeys = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await getUserApiKeys();
      setKeys(data);
      setError(null);
    } catch (err) {
      setError('加载密钥失败，请刷新重试');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  // 添加新密钥
  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim() || !newKeyValue.trim()) return;

    try {
      setIsSubmitting(true);
      setError(null);

      await addUserApiKey(
        newKeyName.trim(),
        newKeyProvider,
        newKeyValue.trim(),
        newKeyBaseUrl.trim() || undefined
      );

      setSuccess('API密钥已安全保存');
      setTimeout(() => setSuccess(null), 3000);

      // 重置表单
      setNewKeyName('');
      setNewKeyValue('');
      setNewKeyBaseUrl('');
      setIsAdding(false);

      // 刷新列表
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 删除密钥
  const handleDelete = async (keyId: string) => {
    if (!confirm('确定要删除这个API密钥吗？此操作不可恢复。')) return;

    try {
      await deleteApiKey(keyId);
      setSuccess('密钥已删除');
      setTimeout(() => setSuccess(null), 3000);
      await loadKeys();
    } catch (err) {
      setError('删除失败');
    }
  };

  // 切换状态
  const handleToggle = async (keyId: string, currentStatus: boolean) => {
    try {
      await toggleApiKeyStatus(keyId, !currentStatus);
      await loadKeys();
    } catch (err) {
      setError('状态更新失败');
    }
  };

  // 获取提供商图标/颜色
  const getProviderStyle = (provider: string) => {
    const styles: Record<string, { bg: string; text: string }> = {
      'Google': { bg: 'bg-blue-500/20', text: 'text-blue-400' },
      'OpenAI': { bg: 'bg-green-500/20', text: 'text-green-400' },
      'Anthropic': { bg: 'bg-orange-500/20', text: 'text-orange-400' },
      '智谱': { bg: 'bg-purple-500/20', text: 'text-purple-400' },
      '火山引擎': { bg: 'bg-red-500/20', text: 'text-red-400' },
      '阿里云': { bg: 'bg-orange-500/20', text: 'text-orange-400' },
      '腾讯云': { bg: 'bg-blue-500/20', text: 'text-blue-400' },
      'Custom': { bg: 'bg-gray-500/20', text: 'text-gray-400' },
    };
    return styles[provider] || styles['Custom'];
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 安全提示 */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-light)]">
        <Shield className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-[var(--text-secondary)]">
          <p className="font-medium text-[var(--text-primary)]">安全存储保障</p>
          <p>您的API密钥使用银行级加密存储，即使是系统管理员也无法查看。密钥仅在调用AI服务时临时解密。</p>
        </div>
      </div>

      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--text-secondary)]">
          已配置的密钥 ({keys.length})
        </h3>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          添加密钥
        </button>
      </div>

      {/* 添加表单 */}
      {isAdding && (
        <form
          onSubmit={handleAddKey}
          className="p-4 rounded-lg border border-[var(--border-light)] bg-[var(--bg-secondary)] space-y-3"
        >
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Key className="w-4 h-4 text-indigo-400" />
              添加新密钥
            </h4>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--text-tertiary)] mb-1">
                密钥名称 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="例如：我的 Google Key"
                className="w-full px-2.5 py-1.5 text-sm rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-light)] focus:border-indigo-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-tertiary)] mb-1">
                提供商 <span className="text-red-400">*</span>
              </label>
              <select
                value={newKeyProvider}
                onChange={(e) => setNewKeyProvider(e.target.value as ApiProvider)}
                className="w-full px-2.5 py-1.5 text-sm rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-light)] focus:border-indigo-500 focus:outline-none"
              >
                {API_PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-[var(--text-tertiary)] mb-1">
              API密钥 <span className="text-red-400">*</span>
              <span className="text-[var(--text-tertiary)] ml-1">(将加密存储，输入后不可查看)</span>
            </label>
            <input
              type="password"
              value={newKeyValue}
              onChange={(e) => setNewKeyValue(e.target.value)}
              placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full px-2.5 py-1.5 text-sm rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-light)] focus:border-indigo-500 focus:outline-none font-mono"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-[var(--text-tertiary)] mb-1">
              自定义Base URL (可选)
            </label>
            <input
              type="url"
              value={newKeyBaseUrl}
              onChange={(e) => setNewKeyBaseUrl(e.target.value)}
              placeholder="https://api.example.com"
              className="w-full px-2.5 py-1.5 text-sm rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-light)] focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !newKeyName.trim() || !newKeyValue.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-600 rounded-lg transition-colors"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  安全保存
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-4 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg"
            >
              取消
            </button>
          </div>
        </form>
      )}

      {/* 提示消息 */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
          <Check className="w-4 h-4 flex-shrink-0" />
          {success}
        </div>
      )}

      {/* 密钥列表 */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="text-center py-8 text-[var(--text-tertiary)] text-sm">
            <div className="w-5 h-5 border-2 border-[var(--border-light)] border-t-indigo-500 rounded-full animate-spin mx-auto mb-2" />
            加载中...
          </div>
        ) : keys.length === 0 ? (
          <div className="text-center py-8 text-[var(--text-tertiary)] text-sm border border-dashed border-[var(--border-light)] rounded-lg">
            <Key className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>暂无API密钥</p>
            <p className="text-xs mt-1">点击"添加密钥"配置您的第一个API密钥</p>
          </div>
        ) : (
          keys.map((key) => {
            const style = getProviderStyle(key.provider);
            return (
              <div
                key={key.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  key.is_active
                    ? 'bg-[var(--bg-secondary)] border-[var(--border-light)]'
                    : 'bg-[var(--bg-tertiary)] opacity-60 border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg ${style.bg} flex items-center justify-center`}>
                    <Key className={`w-4 h-4 ${style.text}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{key.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
                        {key.provider}
                      </span>
                      {!key.is_active && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400">
                          已禁用
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                      <Lock className="w-3 h-3" />
                      <span>{key.key_status}</span>
                      {key.base_url && (
                        <>
                          <span>•</span>
                          <span className="font-mono">{key.base_url}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleToggle(key.id, key.is_active)}
                    title={key.is_active ? '禁用' : '启用'}
                    className={`p-2 rounded-lg transition-colors ${
                      key.is_active
                        ? 'text-emerald-400 hover:bg-emerald-500/10'
                        : 'text-gray-400 hover:bg-gray-500/10'
                    }`}
                  >
                    {key.is_active ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleDelete(key.id)}
                    title="删除"
                    className="p-2 text-[var(--text-tertiary)] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default SecureApiKeyManager;
