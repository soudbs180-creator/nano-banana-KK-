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
            <h3 className="text-2xl font-bold text-left" style={{ color: 'var(--text-primary)' }}>API 管理</h3>
            <div className="flex items-center gap-2 rounded-xl p-1 w-full sm:w-fit" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-light)', borderWidth: '1px' }}>
              <button
                onClick={() => setActiveTab('dispatch')}
                className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors`}
                style={{
                  backgroundColor: activeTab === 'dispatch' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                  color: activeTab === 'dispatch' ? 'var(--accent-color)' : 'var(--text-tertiary)',
                  borderColor: activeTab === 'dispatch' ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                  borderWidth: '1px'
                }}
              >
                <SlidersHorizontal size={14} /> 通道管理
              </button>
              <button
                onClick={() => setActiveTab('assets')}
                className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors`}
                style={{
                  backgroundColor: activeTab === 'assets' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                  color: activeTab === 'assets' ? 'var(--accent-color)' : 'var(--text-tertiary)',
                  borderColor: activeTab === 'assets' ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                  borderWidth: '1px'
                }}
              >
                <Building2 size={14} /> OneAPI
              </button>
            </div>
          </div>
          <p className="text-xs text-zinc-500 text-left w-full">
            {activeTab === 'dispatch' && '配置本地 API Key 与模型映射,支持顺序和并发调度'}
            {activeTab === 'assets' && '远程管理 OneAPI/NewAPI 服务器,统一调度多个API渠道'}
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
