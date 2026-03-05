import React, { useState, useEffect } from 'react';
import { ArrowLeft, DollarSign, Calculator, Info, ExternalLink } from 'lucide-react';
import { SupplierPricing } from '../components/api/SupplierPricing';
import { supplierService } from '../services/billing/supplierService';
import { supabase } from '../lib/supabase';
import { creditService } from '../services/billing/creditService';
import { adminModelService, AdminModelConfig } from '../services/model/adminModelService';

interface CostEstimationProps {
  onBack: () => void;
}

export const CostEstimation: React.FC<CostEstimationProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<'suppliers' | 'credits'>('suppliers');
  const [hasSuppliers, setHasSuppliers] = useState(false);

  const [userBalance, setUserBalance] = useState<number | null>(null);
  const [adminModels, setAdminModels] = useState<AdminModelConfig[]>([]);

  useEffect(() => {
    setHasSuppliers(supplierService.getAll().length > 0);
    const unsubscribe = supplierService.subscribe(() => {
      setHasSuppliers(supplierService.getAll().length > 0);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const fetchBalance = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const credits = await creditService.getUserCredits(user.id);
        setUserBalance(credits?.balance ?? 0);
      }
    };
    fetchBalance();

    const updateAdminModels = () => {
      const models = adminModelService.getModels().filter(m => m.creditCost !== undefined && m.creditCost > 0);
      setAdminModels(models);
    };

    updateAdminModels();
    adminModelService.loadAdminModels().then(updateAdminModels);

    const unsubscribeAdmin = adminModelService.subscribe(updateAdminModels);
    return unsubscribeAdmin;
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-gray-900/80 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 hover:bg-gray-700/50 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-400" />
            </button>
            <h1 className="text-xl font-bold text-white">成本估算</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('suppliers')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'suppliers'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
          >
            <DollarSign className="w-4 h-4" />
            供应商定价
          </button>
          <button
            onClick={() => setActiveTab('credits')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'credits'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
          >
            <Calculator className="w-4 h-4" />
            积分系统
          </button>
        </div>

        {/* Content */}
        {activeTab === 'suppliers' ? (
          hasSuppliers ? (
            <SupplierPricing />
          ) : (
            <div className="text-center py-16 bg-gray-800/50 rounded-2xl border border-gray-700 border-dashed">
              <DollarSign className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-400 mb-2">暂无供应商定价</h3>
              <p className="text-sm text-gray-500 mb-4">
                添加供应商后，这里会显示模型定价信息
              </p>
              <p className="text-xs text-gray-600">
                前往"第三方服务商"添加供应商
              </p>
            </div>
          )
        ) : (
          <div className="space-y-6">
            {/* Credit System Info */}
            <div className="bg-gradient-to-br from-blue-900/20 to-indigo-900/20 rounded-xl p-6 border border-blue-700/30">
              <div className="flex items-center gap-3 mb-4">
                <Calculator className="w-6 h-6 text-blue-400" />
                <h3 className="text-lg font-semibold text-white">积分系统</h3>
              </div>
              <p className="text-gray-300 mb-4">
                积分系统用于结算特定的 AI 模型调用。管理员配置的积分模型会显示在这里。
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <p className="text-2xl font-bold text-white">
                    {userBalance !== null ? userBalance.toString() : '--'}
                  </p>
                  <p className="text-sm text-gray-400">当前可用积分</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <p className="text-2xl font-bold text-white">{adminModels.length}</p>
                  <p className="text-sm text-gray-400">可用积分模型</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <p className="text-2xl font-bold text-white">联系管理员</p>
                  <p className="text-sm text-gray-400">充值方式</p>
                </div>
              </div>
            </div>

            {/* Credit Models */}
            <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-700">
                <h4 className="text-lg font-medium text-white">积分模型列表</h4>
              </div>
              <div className="p-6">
                <div className="space-y-3">
                  {adminModels.length > 0 ? (
                    adminModels.map((model) => (
                      <div key={model.id} className="flex items-center justify-between p-4 bg-gray-700/30 rounded-lg">
                        <div>
                          <p className="font-medium text-white">{model.displayName}</p>
                          <p className="text-sm text-gray-400">{model.id}@system</p>
                        </div>
                        <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-sm">
                          {model.creditCost} 积分 / 次
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-sm text-gray-500 py-4">
                      暂无积分模型或正在加载中...
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="flex items-start gap-3 p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-gray-300">
                <p className="font-medium text-blue-300 mb-1">关于积分系统</p>
                <p>积分模型使用系统代理调用，无需用户配置 API Key。调用时会自动扣除相应积分，积分不足时请联系管理员充值。</p>
              </div>
            </div>
          </div>
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
    </div>
  );
};

export default CostEstimation;
