import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, RefreshCw, ExternalLink, Calculator } from 'lucide-react';
import { supplierService, type Supplier, type SupplierModel } from '../../services/billing/supplierService';

interface SupplierPricingProps {
  supplierId?: string;
  onBack?: () => void;
}

export const SupplierPricing: React.FC<SupplierPricingProps> = ({ 
  supplierId,
  onBack 
}) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(supplierId || null);
  const [searchTerm, setSearchTerm] = useState('');
  const [calculator, setCalculator] = useState({
    inputTokens: 1000,
    outputTokens: 500,
  });

  useEffect(() => {
    loadSuppliers();
    const unsubscribe = supplierService.subscribe(() => {
      setSuppliers(supplierService.getAll());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (supplierId) {
      setSelectedSupplierId(supplierId);
    }
  }, [supplierId]);

  const loadSuppliers = () => {
    setSuppliers(supplierService.getAll());
  };

  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId);

  const filteredModels = selectedSupplier?.models.filter(model => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      model.id.toLowerCase().includes(search) ||
      model.name.toLowerCase().includes(search) ||
      model.group?.toLowerCase().includes(search)
    );
  }) || [];

  const calculateCost = (model: SupplierModel) => {
    if (model.billingType === 'token' && model.inputPrice && model.outputPrice) {
      const inputCost = (calculator.inputTokens / 1000000) * model.inputPrice;
      const outputCost = (calculator.outputTokens / 1000000) * model.outputPrice;
      return inputCost + outputCost;
    }
    if (model.billingType === 'per_request' && model.perRequestPrice) {
      return model.perRequestPrice;
    }
    if (model.billingType === 'multiplier' && model.multiplier) {
      return model.multiplier;
    }
    return null;
  };

  const formatPrice = (price?: number) => {
    if (price === undefined || price === null) return '-';
    return `$${price.toFixed(6)}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        {onBack && (
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-700/50 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </button>
        )}
        <div>
          <h2 className="text-xl font-bold text-white">供应商计价参考</h2>
          <p className="text-sm text-gray-400 mt-1">
            查看各供应商的模型定价信息
          </p>
        </div>
      </div>

      {/* Supplier Selector */}
      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
        <label className="block text-sm font-medium text-gray-300 mb-3">
          选择供应商
        </label>
        <div className="flex flex-wrap gap-2">
          {suppliers.map(supplier => (
            <button
              key={supplier.id}
              onClick={() => setSelectedSupplierId(supplier.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedSupplierId === supplier.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {supplier.name}
              <span className="ml-2 text-xs opacity-70">
                ({supplier.models.length})
              </span>
            </button>
          ))}
          {suppliers.length === 0 && (
            <p className="text-gray-500 text-sm">暂无供应商，请先添加</p>
          )}
        </div>
      </div>

      {/* Calculator */}
      {selectedSupplier && (
        <div className="bg-gradient-to-br from-blue-900/20 to-indigo-900/20 rounded-xl p-4 border border-blue-700/30">
          <div className="flex items-center gap-2 mb-3">
            <Calculator className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-blue-300">成本计算器</span>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-400">输入 Tokens:</label>
              <input
                type="number"
                value={calculator.inputTokens}
                onChange={e => setCalculator(prev => ({ ...prev, inputTokens: parseInt(e.target.value) || 0 }))}
                className="w-24 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-400">输出 Tokens:</label>
              <input
                type="number"
                value={calculator.outputTokens}
                onChange={e => setCalculator(prev => ({ ...prev, outputTokens: parseInt(e.target.value) || 0 }))}
                className="w-24 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* Models Table */}
      {selectedSupplier ? (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
          {/* Search */}
          <div className="p-4 border-b border-gray-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="搜索模型..."
                className="w-full pl-10 pr-4 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    模型名称
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    计费方式
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">
                    输入价格
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">
                    输出价格
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">
                    预估成本
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {filteredModels.map(model => {
                  const estimatedCost = calculateCost(model);
                  return (
                    <tr key={model.id} className="hover:bg-gray-700/30">
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-white">{model.name}</p>
                          <p className="text-xs text-gray-500">{model.id}</p>
                          {model.group && (
                            <span className="inline-block mt-1 px-2 py-0.5 bg-gray-700 text-gray-400 text-xs rounded">
                              {model.group}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs ${
                          model.billingType === 'token' 
                            ? 'bg-blue-500/20 text-blue-400'
                            : model.billingType === 'per_request'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-purple-500/20 text-purple-400'
                        }`}>
                          {model.billingType === 'token' ? '按 Token' : 
                           model.billingType === 'per_request' ? '按请求' : '倍率'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-300">
                        {model.billingType === 'token' 
                          ? formatPrice(model.inputPrice) + '/M'
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-300">
                        {model.billingType === 'token' 
                          ? formatPrice(model.outputPrice) + '/M'
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {estimatedCost !== null ? (
                          <span className="text-sm font-medium text-green-400">
                            ${estimatedCost.toFixed(6)}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-500">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredModels.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500">未找到匹配的模型</p>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-800/50 rounded-xl border border-gray-700 border-dashed">
          <p className="text-gray-500">请选择一个供应商查看定价</p>
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-xs text-gray-500">
        数据来源于 NewAPI 管理接口，使用 System Access Token 获取
        <a 
          href="https://docs.newapi.pro/en/docs/api" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 ml-1"
        >
          查看文档 <ExternalLink className="inline w-3 h-3" />
        </a>
      </div>
    </div>
  );
};

export default SupplierPricing;
