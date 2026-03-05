import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, ExternalLink, RefreshCw, DollarSign, Server } from 'lucide-react';
import { supplierService, type Supplier } from '../../services/billing/supplierService';
import { SupplierModal } from './SupplierModal';
import { notify } from '../../services/system/notificationService';

interface SupplierManagerProps {
  onViewPricing?: (supplierId: string) => void;
}

export const SupplierManager: React.FC<SupplierManagerProps> = ({ onViewPricing }) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  useEffect(() => {
    loadSuppliers();
    const unsubscribe = supplierService.subscribe(() => {
      setSuppliers(supplierService.getAll());
    });
    return unsubscribe;
  }, []);

  const loadSuppliers = () => {
    setSuppliers(supplierService.getAll());
  };

  const handleDelete = (supplier: Supplier) => {
    if (confirm(`确定要删除供应商 "${supplier.name}" 吗？\n相关的价格信息也会被删除。`)) {
      supplierService.delete(supplier.id);
      notify.success('删除成功', `供应商 "${supplier.name}" 已成功删除`);
    }
  };

  const handleEdit = (supplier: Supplier) => {
    setEditSupplier(supplier);
    setIsModalOpen(true);
  };

  const handleAdd = () => {
    setEditSupplier(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditSupplier(null);
  };

  const handleRefreshModels = async (supplier: Supplier) => {
    if (!supplier.systemToken) {
      notify.warning('未配置 System Access Token', '无法刷新模型信息', '请先配置 System Access Token 才能获取模型列表');
      return;
    }

    setRefreshingId(supplier.id);
    try {
      await supplierService.refreshModels(supplier.id);
      notify.success('刷新成功', `已从 "${supplier.name}" 获取到最新的模型信息`);
    } catch (error: any) {
      notify.error('刷新失败', `无法从 "${supplier.name}" 获取模型信息`, error.message);
    } finally {
      setRefreshingId(null);
    }
  };

  const maskKey = (key: string) => {
    if (key.length <= 8) return '****';
    return key.slice(0, 4) + '****' + key.slice(-4);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">供应商管理</h2>
          <p className="text-sm text-gray-400 mt-1">
            配置第三方 API 供应商，自动获取模型和价格信息
          </p>
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-lg text-white font-medium transition-all"
        >
          <Plus className="w-4 h-4" />
          添加供应商
        </button>
      </div>

      {/* Suppliers List */}
      {suppliers.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/50 rounded-xl border border-gray-700 border-dashed">
          <Server className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-400 mb-2">暂无供应商</h3>
          <p className="text-sm text-gray-500 mb-4">添加供应商以获取模型和价格信息</p>
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white text-sm transition-colors"
          >
            添加第一个供应商
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {suppliers.map(supplier => (
            <div
              key={supplier.id}
              className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl border border-gray-700 p-5 hover:border-gray-600 transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-white truncate">
                      {supplier.name}
                    </h3>
                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">
                      {supplier.models.length} 模型
                    </span>
                  </div>
                  
                  <div className="space-y-1 text-sm">
                    <p className="text-gray-400 flex items-center gap-2">
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span className="truncate">{supplier.baseUrl}</span>
                    </p>
                    <p className="text-gray-500">
                      API Key: {maskKey(supplier.apiKey)}
                    </p>
                    {supplier.budgetLimit && (
                      <p className="text-yellow-400 flex items-center gap-2">
                        <DollarSign className="w-3.5 h-3.5" />
                        预算限制: ${supplier.budgetLimit}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  {supplier.systemToken && (
                    <button
                      onClick={() => handleRefreshModels(supplier)}
                      disabled={refreshingId === supplier.id}
                      className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                      title="刷新模型信息"
                    >
                      <RefreshCw className={`w-4 h-4 ${refreshingId === supplier.id ? 'animate-spin' : ''}`} />
                    </button>
                  )}
                  
                  {onViewPricing && (
                    <button
                      onClick={() => onViewPricing(supplier.id)}
                      className="p-2 text-gray-400 hover:text-green-400 hover:bg-green-500/10 rounded-lg transition-colors"
                      title="查看定价"
                    >
                      <DollarSign className="w-4 h-4" />
                    </button>
                  )}
                  
                  <button
                    onClick={() => handleEdit(supplier)}
                    className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                    title="编辑"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  
                  <button
                    onClick={() => handleDelete(supplier)}
                    className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Models Preview */}
              {supplier.models.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <div className="flex flex-wrap gap-2">
                    {supplier.models.slice(0, 5).map(model => (
                      <span
                        key={model.id}
                        className="px-2 py-1 bg-gray-700/50 text-gray-300 text-xs rounded"
                      >
                        {model.name}
                      </span>
                    ))}
                    {supplier.models.length > 5 && (
                      <span className="px-2 py-1 bg-gray-700/50 text-gray-500 text-xs rounded">
                        +{supplier.models.length - 5} 更多
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <SupplierModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        editSupplier={editSupplier}
      />
    </div>
  );
};

export default SupplierManager;
