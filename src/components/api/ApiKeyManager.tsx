import React, { useState, useEffect } from 'react';
import { Plus, Key, ExternalLink, DollarSign, Settings, ChevronRight } from 'lucide-react';
import { SupplierManager } from './SupplierManager';
import { ApiKeyModal } from './ApiKeyModal';
import { AdminSystem } from '../settings/AdminSystem';
import { supplierService, type Supplier } from '../../services/billing/supplierService';

interface ApiKeyManagerProps {
  onNavigateToPricing?: () => void;
}

type ManagerTab = 'suppliers' | 'admin';

export const ApiKeyManager: React.FC<ApiKeyManagerProps> = ({ onNavigateToPricing }) => {
  const [activeTab, setActiveTab] = useState<ManagerTab>('suppliers');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [supplierCount, setSupplierCount] = useState(0);

  useEffect(() => {
    setSupplierCount(supplierService.getAll().length);
    const unsubscribe = supplierService.subscribe(() => {
      setSupplierCount(supplierService.getAll().length);
    });
    return unsubscribe;
  }, []);

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

  const handleViewPricing = (supplierId: string) => {
    if (onNavigateToPricing) {
      onNavigateToPricing();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-gray-900/80 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">第三方服务商</h1>
              <p className="text-sm text-gray-400 mt-1">
                管理 API 供应商，自动获取模型和价格信息
              </p>
            </div>
            <div className="flex items-center gap-3">
              {onNavigateToPricing && (
                <button
                  onClick={onNavigateToPricing}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm transition-colors"
                >
                  <DollarSign className="w-4 h-4" />
                  查看定价
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={handleAdd}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-lg text-white font-medium transition-all"
              >
                <Plus className="w-4 h-4" />
                添加供应商
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('suppliers')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'suppliers'
                ? 'text-blue-400 border-blue-400'
                : 'text-gray-400 border-transparent hover:text-gray-300'
                }`}
            >
              <Key className="w-4 h-4" />
              供应商管理
              {supplierCount > 0 && (
                <span className="ml-1 px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded-full">
                  {supplierCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('admin')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'admin'
                  ? 'text-blue-400 border-blue-400'
                  : 'text-gray-400 border-transparent hover:text-gray-300'
                }`}
            >
              <Settings className="w-4 h-4" />
              管理员后台
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'suppliers' ? (
          <SupplierManager onViewPricing={handleViewPricing} />
        ) : (
          <AdminSystem />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-700 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center text-sm text-gray-500">
            <p>API 文档参考：</p>
            <div className="flex items-center justify-center gap-4 mt-2">
              <a
                href="https://doc.12ai.org/api/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                12AI API 文档 <ExternalLink className="w-3 h-3" />
              </a>
              <span className="text-gray-600">|</span>
              <a
                href="https://docs.newapi.pro/en/docs/api"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                NewAPI 管理文档 <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Modal */}
      <ApiKeyModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        editSupplier={editSupplier}
      />
    </div>
  );
};

export default ApiKeyManager;
