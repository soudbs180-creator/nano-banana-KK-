import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Server, Globe, Key, Lock, DollarSign, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { supplierService, type Supplier } from '../../services/billing/supplierService';
import { newApiManagementService } from '../../services/api/newApiManagementService';
import { notify } from '../../services/system/notificationService';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  editSupplier?: Supplier | null;
  initialType?: 'official' | 'proxy' | 'third-party';
}

// 预设服务商配置
const PRESET_PROVIDERS = [
  { label: '12AI (推荐)', value: '12ai', url: 'https://cdn.12ai.org', icon: '⚡' },
  { label: 'OpenAI', value: 'openai', url: 'https://api.openai.com', icon: '🅾️' },
  { label: 'Gemini (Google)', value: 'gemini', url: 'https://generativelanguage.googleapis.com', icon: '♊' },
  { label: 'Anthropic (Claude)', value: 'anthropic', url: 'https://api.anthropic.com', icon: '🅰️' },
  { label: 'DeepSeek', value: 'deepseek', url: 'https://api.deepseek.com', icon: '🔮' },
  { label: '智谱 AI', value: 'zhipu', url: 'https://open.bigmodel.cn/api/paas/v4', icon: '🧠' },
  { label: 'SiliconFlow', value: 'siliconflow', url: 'https://api.siliconflow.cn', icon: '💎' },
  { label: 'Moonshot (Kimi)', value: 'moonshot', url: 'https://api.moonshot.cn', icon: '🌙' },
  { label: 'OneAPI / NewAPI', value: 'oneapi', url: 'https://ai.newapi.pro', icon: '🔌' },
  { label: '自定义', value: 'custom', url: '', icon: '⚙️' },
];

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ 
  isOpen, 
  onClose,
  editSupplier,
  initialType = 'third-party'
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [fetchedModels, setFetchedModels] = useState<Array<{
    id: string;
    name: string;
    billingType: string;
    inputPrice?: number;
    outputPrice?: number;
  }> | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    baseUrl: 'https://cdn.12ai.org',
    apiKey: '',
    systemToken: '',
    budgetLimit: '',
    presetProvider: '12ai',
  });

  // 根据 initialType 获取默认配置
  const getDefaultConfig = (type: 'official' | 'proxy' | 'third-party' | undefined) => {
    switch (type) {
      case 'official':
        return { presetProvider: 'openai', baseUrl: 'https://api.openai.com' };
      case 'proxy':
        return { presetProvider: 'oneapi', baseUrl: 'https://ai.newapi.pro' };
      case 'third-party':
      default:
        return { presetProvider: '12ai', baseUrl: 'https://cdn.12ai.org' };
    }
  };

  // Load edit data
  useEffect(() => {
    if (editSupplier) {
      setFormData({
        name: editSupplier.name,
        baseUrl: editSupplier.baseUrl,
        apiKey: editSupplier.apiKey,
        systemToken: editSupplier.systemToken || '',
        budgetLimit: editSupplier.budgetLimit?.toString() || '',
        presetProvider: 'custom',
      });
      setFetchedModels(editSupplier.models.map(m => ({
        id: m.id,
        name: m.name,
        billingType: m.billingType,
        inputPrice: m.inputPrice,
        outputPrice: m.outputPrice,
      })));
    } else {
      const defaultConfig = getDefaultConfig(initialType);
      setFormData({
        name: '',
        baseUrl: defaultConfig.baseUrl,
        apiKey: '',
        systemToken: '',
        budgetLimit: '',
        presetProvider: defaultConfig.presetProvider,
      });
      setFetchedModels(null);
      setTokenValid(null);
    }
  }, [editSupplier, isOpen, initialType]);

  // Handle preset provider selection
  const handlePresetChange = (value: string) => {
    const preset = PRESET_PROVIDERS.find(p => p.value === value);
    if (preset && preset.url) {
      setFormData(prev => ({
        ...prev,
        presetProvider: value,
        baseUrl: preset.url,
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        presetProvider: value,
      }));
    }
  };

  // Verify System Access Token
  const handleVerifyToken = async () => {
    if (!formData.systemToken) {
      notify.warning('请输入 System Access Token', '请先填写 System Access Token 后再进行验证');
      return;
    }

    setIsVerifying(true);
    try {
      const result = await newApiManagementService.verifyAccessToken(
        formData.systemToken,
        formData.baseUrl
      );
      
      if (result.success) {
        setTokenValid(true);
        notify.success('Token 验证成功', '可以获取模型和价格信息', '现在可以点击"获取模型"按钮获取模型列表');
      } else {
        setTokenValid(false);
        notify.error('Token 验证失败', result.error || '请检查 Token 是否正确', '请确保 System Access Token 正确无误');
      }
    } catch (error: any) {
      setTokenValid(false);
      notify.error('验证失败', error.message, '请检查网络连接和 Token 是否正确');
    } finally {
      setIsVerifying(false);
    }
  };

  // Fetch models using System Access Token
  const handleFetchModels = async () => {
    if (!formData.systemToken) {
      notify.warning('请输入 System Access Token', '请先填写 System Access Token 后再获取模型');
      return;
    }

    setIsLoading(true);
    try {
      const models = await supplierService.fetchModelsFromNewAPI(
        formData.baseUrl,
        formData.systemToken
      );
      
      setFetchedModels(models.map(m => ({
        id: m.id,
        name: m.name,
        billingType: m.billingType,
        inputPrice: m.inputPrice,
        outputPrice: m.outputPrice,
      })));
      
      notify.success('模型获取成功', `已获取 ${models.length} 个模型`, '模型列表已更新');
    } catch (error: any) {
      notify.error('获取失败', error.message, '请检查网络连接和配置是否正确');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      notify.warning('请输入供应商名称', '供应商名称不能为空');
      return;
    }
    if (!formData.baseUrl.trim()) {
      notify.warning('请输入 Base URL', 'Base URL 不能为空');
      return;
    }
    if (!formData.apiKey.trim()) {
      notify.warning('请输入 API Key', 'API Key 不能为空');
      return;
    }

    console.log('[ApiKeyModal] Submitting form:', formData);
    
    setIsLoading(true);
    try {
      const data = {
        name: formData.name.trim(),
        baseUrl: formData.baseUrl.trim(),
        apiKey: formData.apiKey.trim(),
        systemToken: formData.systemToken.trim() || undefined,
        budgetLimit: formData.budgetLimit ? parseFloat(formData.budgetLimit) : undefined,
      };

      if (editSupplier) {
        supplierService.update(editSupplier.id, data);
        notify.success('供应商已更新', '供应商信息已保存');
      } else {
        supplierService.create(data);
        notify.success('供应商已添加', '新供应商已保存到列表');
      }
      
      console.log('[ApiKeyModal] Form submitted successfully');
      onClose();
    } catch (error: any) {
      console.error('[ApiKeyModal] Submit error:', error);
      notify.error('保存失败', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || typeof window === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center">
      {/* Backdrop - 全屏模糊背景 */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-xl"
        onClick={onClose}
      />
      {/* Modal Container - 必须在 backdrop 之上 */}
      <div className="relative z-[1] w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-2xl border border-gray-700 m-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">
            {editSupplier ? '编辑供应商' : '添加第三方服务商'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-700/50 transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Preset Providers */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              选择服务商类型
            </label>
            <div className="grid grid-cols-3 gap-2">
              {PRESET_PROVIDERS.map(provider => (
                <button
                  key={provider.value}
                  type="button"
                  onClick={() => handlePresetChange(provider.value)}
                  className={`p-2 rounded-lg text-sm transition-all flex items-center justify-center gap-1 ${
                    formData.presetProvider === provider.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  <span>{provider.icon}</span>
                  <span className="truncate">{provider.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Supplier Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              供应商名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="例如：My AI Provider"
              className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <Globe className="w-4 h-4 inline mr-1" />
              Base URL <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.baseUrl}
              onChange={e => setFormData(prev => ({ ...prev, baseUrl: e.target.value }))}
              placeholder="https://cdn.12ai.org"
              className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              用于调用模型的 API 地址
            </p>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <Key className="w-4 h-4 inline mr-1" />
              API Key <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={formData.apiKey}
              onChange={e => setFormData(prev => ({ ...prev, apiKey: e.target.value }))}
              placeholder="sk-..."
              className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">用于调用 API 的密钥</p>
          </div>

          {/* System Access Token */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <Lock className="w-4 h-4 inline mr-1" />
              System Access Token <span className="text-gray-500">(可选)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={formData.systemToken}
                onChange={e => {
                  setFormData(prev => ({ ...prev, systemToken: e.target.value }));
                  setTokenValid(null);
                }}
                placeholder="用于获取模型价格信息 (NewAPI)"
                className="flex-1 px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={handleVerifyToken}
                disabled={isVerifying || !formData.systemToken}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-sm transition-colors flex items-center gap-2"
              >
                {isVerifying ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : tokenValid === true ? (
                  <CheckCircle className="w-4 h-4 text-green-400" />
                ) : tokenValid === false ? (
                  <AlertCircle className="w-4 h-4 text-red-400" />
                ) : null}
                验证
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              仅用于获取模型列表和价格，参考
              <a 
                href="https://docs.newapi.pro/en/docs/api" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 ml-1"
              >
                NewAPI 管理文档 →
              </a>
            </p>
          </div>

          {/* Fetch Models Button */}
          {formData.systemToken && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleFetchModels}
                disabled={isLoading}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                {isLoading ? '获取中...' : '获取模型和价格'}
              </button>
            </div>
          )}

          {/* Budget Limit */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <DollarSign className="w-4 h-4 inline mr-1" />
              预算限制 <span className="text-gray-500">(可选)</span>
            </label>
            <input
              type="number"
              value={formData.budgetLimit}
              onChange={e => setFormData(prev => ({ ...prev, budgetLimit: e.target.value }))}
              placeholder="0.00"
              min="0"
              step="0.01"
              className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">达到预算限制时发送警告（USD）</p>
          </div>

          {/* Fetched Models Preview */}
          {fetchedModels && fetchedModels.length > 0 && (
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <h4 className="text-sm font-medium text-gray-300 mb-3">
                已获取模型 ({fetchedModels.length}个)
              </h4>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {fetchedModels.slice(0, 10).map(model => (
                  <div key={model.id} className="flex items-center justify-between py-1 px-2 bg-gray-700/30 rounded">
                    <span className="text-sm text-gray-300 truncate">{model.name}</span>
                    <span className="text-xs text-gray-500">
                      {model.billingType === 'token' 
                        ? `$${model.inputPrice}/${model.outputPrice} per 1M tokens`
                        : model.billingType}
                    </span>
                  </div>
                ))}
                {fetchedModels.length > 10 && (
                  <p className="text-xs text-gray-500 text-center">
                    还有 {fetchedModels.length - 10} 个模型...
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-white font-medium transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 rounded-lg text-white font-medium transition-all"
            >
              {isLoading ? '保存中...' : editSupplier ? '更新' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default ApiKeyModal;
