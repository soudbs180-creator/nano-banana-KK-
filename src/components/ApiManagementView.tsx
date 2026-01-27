import { useState } from 'react';
import { Building2, SlidersHorizontal } from 'lucide-react';
import { ApiChannelsView } from './ApiChannelsView';
import NewApiAdminView from './NewApiAdminView';

const ApiManagementView = () => {
  const [activeTab, setActiveTab] = useState<'dispatch' | 'assets'>('dispatch');

  return (
    <div className="space-y-6">
      <div className="px-1 py-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-2xl font-bold text-white text-left">API 管理</h3>
            <div className="flex items-center gap-2 bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-xl p-1 w-full sm:w-fit">
              <button
                onClick={() => setActiveTab('dispatch')}
                className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${activeTab === 'dispatch'
                  ? 'bg-indigo-500/20 text-white border border-indigo-500/30'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
              >
                <SlidersHorizontal size={14} /> 通道管理 (Local)
              </button>
              <button
                onClick={() => setActiveTab('assets')}
                className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${activeTab === 'assets'
                  ? 'bg-indigo-500/20 text-white border border-indigo-500/30'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
              >
                <Building2 size={14} /> OneAPI 管理 (Remote)
              </button>
            </div>
          </div>
          <p className="text-xs text-zinc-500 text-left w-full">
            通道管理用于配置本地使用的 API Key 与模型映射；OneAPI 管理用于远程控制 NewAPI/OneAPI 系统。
          </p>
        </div>
      </div>

      {activeTab === 'dispatch' && <ApiChannelsView />}
      {activeTab === 'assets' && (
        <div className="flex flex-col gap-6">
          <NewApiAdminView />
        </div>
      )}
    </div>
  );
};

export default ApiManagementView;
