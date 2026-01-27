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
                  backgroundColor: activeTab === 'dispatch' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                  color: activeTab === 'dispatch' ? '#fff' : 'var(--text-tertiary)',
                  borderColor: activeTab === 'dispatch' ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                  borderWidth: '1px'
                }}
              >
                <SlidersHorizontal size={14} /> 通道管理 (Local)
              </button>
              <button
                onClick={() => setActiveTab('assets')}
                className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors`}
                style={{
                  backgroundColor: activeTab === 'assets' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                  color: activeTab === 'assets' ? '#fff' : 'var(--text-tertiary)',
                  borderColor: activeTab === 'assets' ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                  borderWidth: '1px'
                }}
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
