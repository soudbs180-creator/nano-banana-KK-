import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle, DollarSign, Globe, Key, Lock, RefreshCw, X } from 'lucide-react';
import { type ApiProtocolFormat } from '../../services/api/apiConfig';
import { newApiManagementService } from '../../services/api/newApiManagementService';
import { supplierService, type Supplier } from '../../services/billing/supplierService';
import { notify } from '../../services/system/notificationService';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  editSupplier?: Supplier | null;
  initialType?: 'official' | 'proxy' | 'third-party';
}

const PRESET_PROVIDERS: Array<{
  label: string;
  value: string;
  url: string;
  icon: string;
  format: ApiProtocolFormat;
}> = [
  { label: '通用 OpenAI 兼容', value: 'openai-generic', url: 'https://api.example.com/v1', icon: '◎', format: 'openai' },
  { label: 'Gemini 格式兼容', value: 'gemini-generic', url: 'https://api.example.com/v1', icon: '◇', format: 'gemini' },
  { label: '本地服务', value: 'local-openai', url: 'http://127.0.0.1:3000/v1', icon: '◉', format: 'openai' },
  { label: '自定义配置', value: 'custom', url: '', icon: '⚙', format: 'auto' },
];

const modalShellClass =
  'relative z-[1] flex w-full max-w-[920px] flex-col overflow-hidden rounded-[28px] border shadow-[0_28px_80px_rgba(0,0,0,0.42)]';
const fieldClass =
  'w-full rounded-xl border border-[var(--border-light)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-tertiary)] focus:border-indigo-500';
const compactFieldClass =
  'flex-1 rounded-xl border border-[var(--border-light)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-tertiary)] focus:border-indigo-500';
const labelClass = 'mb-2 block text-sm font-medium text-[var(--text-secondary)]';
const helperTextClass = 'mt-1 text-xs text-[var(--text-tertiary)]';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border-light)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-overlay)] disabled:opacity-50';

type FormDataState = {
  name: string;
  baseUrl: string;
  apiKey: string;
  format: ApiProtocolFormat;
  systemToken: string;
  budgetLimit: string;
  presetProvider: string;
};

const DEFAULT_PRESET_BY_TYPE: Record<'official' | 'proxy' | 'third-party', string> = {
  official: 'openai-generic',
  proxy: 'openai-generic',
  'third-party': 'custom',
};

const getPresetByValue = (value: string) => PRESET_PROVIDERS.find((provider) => provider.value === value);

const buildDefaultFormData = (type: 'official' | 'proxy' | 'third-party'): FormDataState => {
  const presetProvider = DEFAULT_PRESET_BY_TYPE[type];
  const preset = getPresetByValue(presetProvider) || PRESET_PROVIDERS[0];

  return {
    name: '',
    baseUrl: preset.url,
    apiKey: '',
    format: preset.format,
    systemToken: '',
    budgetLimit: '',
    presetProvider,
  };
};

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  editSupplier,
  initialType = 'third-party',
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
  const [formData, setFormData] = useState<FormDataState>(() => buildDefaultFormData(initialType));

  useEffect(() => {
    if (!isOpen) return;

    if (editSupplier) {
      setFormData({
        name: editSupplier.name,
        baseUrl: editSupplier.baseUrl,
        apiKey: editSupplier.apiKey,
        format: editSupplier.format || 'auto',
        systemToken: editSupplier.systemToken || '',
        budgetLimit: editSupplier.budgetLimit?.toString() || '',
        presetProvider: 'custom',
      });
      setFetchedModels(
        editSupplier.models.map((model) => ({
          id: model.id,
          name: model.name,
          billingType: model.billingType,
          inputPrice: model.inputPrice,
          outputPrice: model.outputPrice,
        })),
      );
      return;
    }

    setFormData(buildDefaultFormData(initialType));
    setFetchedModels(null);
    setTokenValid(null);
  }, [editSupplier, initialType, isOpen]);

  const handlePresetChange = (value: string) => {
    const preset = getPresetByValue(value);
    if (!preset) return;

    setFormData((previous) => ({
      ...previous,
      presetProvider: value,
      baseUrl: preset.url || previous.baseUrl,
      format: preset.format,
    }));
  };

  const handleVerifyToken = async () => {
    if (!formData.systemToken) {
      notify.warning('请输入 System Access Token', '请先填写 System Access Token 后再进行验证。');
      return;
    }

    setIsVerifying(true);
    try {
      const result = await newApiManagementService.verifyAccessToken(formData.systemToken, formData.baseUrl);

      if (result.success) {
        setTokenValid(true);
        notify.success('Token 验证成功', '现在可以继续获取模型和价格信息。');
      } else {
        setTokenValid(false);
        notify.error('Token 验证失败', result.error || '请检查 Token 是否正确。');
      }
    } catch (error: any) {
      setTokenValid(false);
      notify.error('验证失败', error.message || '请检查网络和 Token 配置。');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleFetchModels = async () => {
    if (!formData.systemToken) {
      notify.warning('请输入 System Access Token', '请先填写 System Access Token。');
      return;
    }

    setIsLoading(true);
    try {
      const models = await supplierService.fetchModelsFromNewAPI(formData.baseUrl, formData.systemToken);
      setFetchedModels(
        models.map((model) => ({
          id: model.id,
          name: model.name,
          billingType: model.billingType,
          inputPrice: model.inputPrice,
          outputPrice: model.outputPrice,
        })),
      );
      notify.success('模型获取成功', `已获取 ${models.length} 个模型。`);
    } catch (error: any) {
      notify.error('获取失败', error.message || '请检查地址和凭据配置。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.name.trim()) {
      notify.warning('请输入供应商名称', '供应商名称不能为空。');
      return;
    }
    if (!formData.baseUrl.trim()) {
      notify.warning('请输入 Base URL', 'Base URL 不能为空。');
      return;
    }
    if (!formData.apiKey.trim()) {
      notify.warning('请输入 API Key', 'API Key 不能为空。');
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        name: formData.name.trim(),
        baseUrl: formData.baseUrl.trim(),
        apiKey: formData.apiKey.trim(),
        format: formData.format,
        systemToken: formData.systemToken.trim() || undefined,
        budgetLimit: formData.budgetLimit ? parseFloat(formData.budgetLimit) : undefined,
      };

      if (editSupplier) {
        supplierService.update(editSupplier.id, payload);
        notify.success('供应商已更新', '配置已经保存。');
      } else {
        supplierService.create(payload);
        notify.success('供应商已添加', '新配置已经保存。');
      }

      onClose();
    } catch (error: any) {
      notify.error('保存失败', error.message || '请稍后重试。');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || typeof window === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center px-4 py-5 sm:px-6 sm:py-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" onClick={onClose} />

      <div
        className={modalShellClass}
        style={{
          borderColor: 'var(--border-light)',
          background: 'linear-gradient(180deg, var(--bg-surface) 0%, var(--bg-elevated) 100%)',
          maxHeight: 'calc(100vh - 24px)',
        }}
      >
        <div
          className="flex items-start justify-between gap-4 border-b p-5 sm:p-6"
          style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-surface)' }}
        >
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">
              {editSupplier ? '编辑供应商' : '添加第三方服务商'}
            </h2>
            <p className="mt-2 text-sm text-[var(--text-tertiary)]">
              支持 OpenAI 兼容、Gemini 原生和自动检测三种协议模式。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-light)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 sm:p-6">
            <div>
              <label className={labelClass}>选择服务商类型</label>
              <div className="grid grid-cols-2 gap-2">
                {PRESET_PROVIDERS.map((provider) => (
                  <button
                    key={provider.value}
                    type="button"
                    onClick={() => handlePresetChange(provider.value)}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-all ${
                      formData.presetProvider === provider.value
                        ? 'border-transparent bg-gradient-to-r from-indigo-600 to-blue-500 text-white shadow-[0_12px_28px_rgba(79,70,229,0.24)]'
                        : 'border-[var(--border-light)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span>{provider.icon}</span>
                    <span className="truncate">{provider.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={labelClass}>
                供应商名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(event) => setFormData((previous) => ({ ...previous, name: event.target.value }))}
                placeholder="例如：My AI Provider"
                className={fieldClass}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>
                  <Globe className="mr-1 inline h-4 w-4" />
                  Base URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.baseUrl}
                  onChange={(event) => setFormData((previous) => ({ ...previous, baseUrl: event.target.value }))}
                  placeholder="https://api.example.com/v1"
                  className={fieldClass}
                />
                <p className={helperTextClass}>填写服务商 API 根地址。</p>
              </div>

              <div>
                <label className={labelClass}>协议格式</label>
                <select
                  value={formData.format}
                  onChange={(event) =>
                    setFormData((previous) => ({ ...previous, format: event.target.value as ApiProtocolFormat }))
                  }
                  className={fieldClass}
                >
                  <option value="openai">OpenAI 兼容</option>
                  <option value="gemini">Gemini 原生</option>
                  <option value="auto">自动检测</option>
                </select>
                <p className={helperTextClass}>
                  OpenAI 使用 Bearer Token；Gemini 使用 URL 参数 `?key=...`。
                </p>
              </div>
            </div>

            <div>
              <label className={labelClass}>
                <Key className="mr-1 inline h-4 w-4" />
                API Key <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={formData.apiKey}
                onChange={(event) => setFormData((previous) => ({ ...previous, apiKey: event.target.value }))}
                placeholder="sk-..."
                className={fieldClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                <Lock className="mr-1 inline h-4 w-4" />
                System Access Token <span className="text-[var(--text-tertiary)]">(可选)</span>
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="password"
                  value={formData.systemToken}
                  onChange={(event) => {
                    setFormData((previous) => ({ ...previous, systemToken: event.target.value }));
                    setTokenValid(null);
                  }}
                  placeholder="用于拉取模型和价格信息"
                  className={compactFieldClass}
                />
                <button
                  type="button"
                  onClick={handleVerifyToken}
                  disabled={isVerifying || !formData.systemToken}
                  className={secondaryButtonClass}
                >
                  {isVerifying ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : tokenValid === true ? (
                    <CheckCircle className="h-4 w-4 text-green-400" />
                  ) : tokenValid === false ? (
                    <AlertCircle className="h-4 w-4 text-red-400" />
                  ) : null}
                  验证
                </button>
              </div>
            </div>

            {formData.systemToken ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleFetchModels}
                  disabled={isLoading}
                  className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                >
                  <span className="inline-flex items-center gap-2">
                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    {isLoading ? '获取中...' : '获取模型和价格'}
                  </span>
                </button>
              </div>
            ) : null}

            <div>
              <label className={labelClass}>
                <DollarSign className="mr-1 inline h-4 w-4" />
                预算限制 <span className="text-[var(--text-tertiary)]">(可选)</span>
              </label>
              <input
                type="number"
                value={formData.budgetLimit}
                onChange={(event) => setFormData((previous) => ({ ...previous, budgetLimit: event.target.value }))}
                placeholder="0.00"
                min="0"
                step="0.01"
                className={fieldClass}
              />
            </div>

            {fetchedModels && fetchedModels.length > 0 ? (
              <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-overlay)] p-4">
                <h4 className="mb-3 text-sm font-medium text-[var(--text-primary)]">
                  已获取模型 ({fetchedModels.length} 个)
                </h4>
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {fetchedModels.slice(0, 10).map((model) => (
                    <div
                      key={model.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-light)] bg-[var(--bg-elevated)] px-3 py-2"
                    >
                      <span className="truncate text-sm text-[var(--text-primary)]">{model.name}</span>
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {model.billingType === 'token'
                          ? `$${model.inputPrice}/${model.outputPrice} per 1M tokens`
                          : model.billingType}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div
            className="flex shrink-0 flex-col gap-3 border-t p-5 sm:flex-row sm:justify-end sm:p-6"
            style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-surface)' }}
          >
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-xl border border-[var(--border-light)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-overlay)] sm:min-w-[128px]"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-blue-500 px-4 py-2.5 text-sm font-medium text-white transition hover:from-indigo-500 hover:to-blue-400 disabled:opacity-50 sm:min-w-[140px]"
            >
              {isLoading ? '保存中...' : editSupplier ? '更新' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export default ApiKeyModal;
