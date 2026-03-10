import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { supplierService, type Supplier } from '../../services/billing/supplierService';
import { newApiManagementService } from '../../services/api/newApiManagementService';
import { notify } from '../../services/system/notificationService';

interface SupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  editSupplier?: Supplier | null;
}

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

export const SupplierModal: React.FC<SupplierModalProps> = ({ 
  isOpen, 
  onClose,
  editSupplier 
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    baseUrl: 'https://ai.newapi.pro',
    apiKey: '',
    systemToken: '',
    budgetLimit: '',
  });

  const [fetchedModels, setFetchedModels] = useState<Array<{
    id: string;
    name: string;
    billingType: string;
    inputPrice?: number;
    outputPrice?: number;
  }> | null>(null);

  // Load edit data
  useEffect(() => {
    if (editSupplier) {
      setFormData({
        name: editSupplier.name,
        baseUrl: editSupplier.baseUrl,
        apiKey: editSupplier.apiKey,
        systemToken: editSupplier.systemToken || '',
        budgetLimit: editSupplier.budgetLimit?.toString() || '',
      });
      setFetchedModels(editSupplier.models.map(m => ({
        id: m.id,
        name: m.name,
        billingType: m.billingType,
        inputPrice: m.inputPrice,
        outputPrice: m.outputPrice,
      })));
    } else {
      setFormData({
        name: '',
        baseUrl: 'https://ai.newapi.pro',
        apiKey: '',
        systemToken: '',
        budgetLimit: '',
      });
      setFetchedModels(null);
      setTokenValid(null);
    }
  }, [editSupplier, isOpen]);

  // Verify System Access Token
  const handleVerifyToken = async () => {
    if (!formData.systemToken) {
      notify.warning('请输入 System Access Token', 'System Access Token 不能为空');
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
        notify.error('Token 验证失败', result.error || '请检查 Token 是否正确');
      }
    } catch (error: any) {
      setTokenValid(false);
      notify.error('验证失败', error.message);
    } finally {
      setIsVerifying(false);
    }
  };

  // Fetch models using System Access Token
  const handleFetchModels = async () => {
    if (!formData.systemToken) {
      notify.warning('请输入 System Access Token', 'System Access Token 不能为空');
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
      notify.error('获取模型失败', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      notify.warning('请输入供应商名称', '供应商名称为必填项');
      return;
    }
    if (!formData.baseUrl.trim()) {
      notify.warning('请输入 Base URL', 'Base URL 为必填项');
      return;
    }
    if (!formData.apiKey.trim()) {
      notify.warning('请输入 API Key', 'API Key 为必填项');
      return;
    }

    console.log('[SupplierModal] Submitting form:', formData);
    
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
      
      console.log('[SupplierModal] Form submitted successfully');
      onClose();
    } catch (error: any) {
      console.error('[SupplierModal] Submit error:', error);
      notify.error('保存失败', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // API Key file upload
  const onDropKey = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        const lines = content.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length > 0) {
          setFormData(prev => ({ ...prev, apiKey: lines[0] }));
          notify.success('API Key 已加载', `从文档 ${file.name}`, 'API Key 已从文档读取');
        }
      };
      reader.readAsText(file);
    }
  }, []);

  const { getRootProps: getKeyRootProps, getInputProps: getKeyInputProps } = useDropzone({
    onDrop: onDropKey,
    accept: ['.txt', '.key'] as any,
    multiple: false,
  });

  if (!isOpen || typeof window === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center px-4 py-5 sm:px-6 sm:py-6">
      {/* Backdrop - 全屏模糊背景 */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-xl"
        onClick={onClose}
      />
      {/* Modal Container - 必须在 backdrop 之上 */}
      <div
        className={modalShellClass}
        style={{
          borderColor: 'var(--border-light)',
          background: 'linear-gradient(180deg, var(--bg-surface) 0%, var(--bg-elevated) 100%)',
          maxHeight: 'calc(100vh - 24px)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between gap-4 border-b p-5 sm:p-6"
          style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-surface)' }}
        >
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">
              {editSupplier ? '编辑供应商' : '添加供应商'}
            </h2>
            <p className="mt-2 text-sm text-[var(--text-tertiary)]">
              编辑窗口已改为更高可视区域，滚动区与底部操作栏分离，保存按钮不会再被裁切。
            </p>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-light)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 sm:p-6">
          {/* Supplier Name */}
          <div>
            <label className={labelClass}>
              供应商名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="例如：My AI Provider"
              className={fieldClass}
            />
          </div>

          {/* Base URL */}
          <div>
            <label className={labelClass}>
              Base URL <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.baseUrl}
              onChange={e => setFormData(prev => ({ ...prev, baseUrl: e.target.value }))}
              placeholder="https://ai.newapi.pro"
              className={fieldClass}
            />
            <p className={helperTextClass}>NewAPI 地址，用于调用模型</p>
          </div>

          {/* API Key */}
          <div>
            <label className={labelClass}>
              API Key <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="password"
                value={formData.apiKey}
                onChange={e => setFormData(prev => ({ ...prev, apiKey: e.target.value }))}
                placeholder="sk-..."
                className={compactFieldClass}
              />
              <div
                {...getKeyRootProps()}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-light)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]"
              >
                <input {...getKeyInputProps()} />
                <Plus className="h-4 w-4" />
                <span>上传</span>
              </div>
            </div>
            <p className={helperTextClass}>用于调用 API 的密钥</p>
          </div>

          {/* System Access Token (Optional) */}
          <div>
            <label className={labelClass}>
              System Access Token <span className="text-[var(--text-tertiary)]">(可选)</span>
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="password"
                value={formData.systemToken}
                onChange={e => {
                  setFormData(prev => ({ ...prev, systemToken: e.target.value }));
                  setTokenValid(null);
                }}
                placeholder="用于获取模型价格信息"
                className={compactFieldClass}
              />
              <button
                type="button"
                onClick={handleVerifyToken}
                disabled={isVerifying || !formData.systemToken}
                className={secondaryButtonClass}
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
            <p className={helperTextClass}>
              仅用于获取模型列表和价格，不会保存到前端
              <a 
                href="https://docs.newapi.pro/en/docs/api" 
                target="_blank" 
                rel="noopener noreferrer"
                className="ml-1 text-indigo-400 hover:text-indigo-300"
              >
                查看文档 →
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

          {/* Budget Limit (Optional) */}
          <div>
            <label className={labelClass}>
              预算限制 <span className="text-[var(--text-tertiary)]">(可选)</span>
            </label>
            <input
              type="number"
              value={formData.budgetLimit}
              onChange={e => setFormData(prev => ({ ...prev, budgetLimit: e.target.value }))}
              placeholder="0.00"
              min="0"
              step="0.01"
              className={fieldClass}
            />
            <p className={helperTextClass}>达到预算限制时发送警告（USD）</p>
          </div>

          {/* Fetched Models Preview */}
          {fetchedModels && fetchedModels.length > 0 && (
            <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-overlay)] p-4">
              <h4 className="mb-3 text-sm font-medium text-[var(--text-primary)]">
                已获取模型 ({fetchedModels.length} 个)
              </h4>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {fetchedModels.slice(0, 10).map(model => (
                  <div key={model.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-light)] bg-[var(--bg-elevated)] px-3 py-2">
                    <span className="truncate text-sm text-[var(--text-primary)]">{model.name}</span>
                    <span className="text-xs text-[var(--text-tertiary)]">
                      {model.billingType === 'token' 
                        ? `$${model.inputPrice}/${model.outputPrice} per 1M tokens`
                        : model.billingType}
                    </span>
                  </div>
                ))}
                {fetchedModels.length > 10 && (
                  <p className="text-center text-xs text-[var(--text-tertiary)]">
                    还有 {fetchedModels.length - 10} 个模型...
                  </p>
                )}
              </div>
            </div>
          )}

          </div>

          {/* Actions */}
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
    document.body
  );
};

export default SupplierModal;
