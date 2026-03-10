import React, { Suspense, lazy, useMemo, useState } from 'react';
import { KeyRound, Shield } from 'lucide-react';

const ApiSettingsView = lazy(() => import('../settings/ApiSettingsView'));
const AdminSystem = lazy(() => import('../settings/AdminSystem'));

interface ApiKeyManagerProps {
  onNavigateToPricing?: () => void;
}

type ManagerTab = 'api' | 'admin';

const managerNavItems: Array<{
  id: ManagerTab;
  label: string;
  description: string;
  icon: typeof KeyRound;
}> = [
  {
    id: 'api',
    label: '接口与供应商',
    description: '官方接口、第三方供应商与价格同步',
    icon: KeyRound,
  },
  {
    id: 'admin',
    label: '管理员后台',
    description: '积分模型、后台权限与系统配置',
    icon: Shield,
  },
];

export const ApiKeyManager: React.FC<ApiKeyManagerProps> = ({ onNavigateToPricing: _onNavigateToPricing }) => {
  const [activeTab, setActiveTab] = useState<ManagerTab>('api');

  const activeMeta = useMemo(
    () =>
      activeTab === 'api'
        ? {
            badge: '统一管理中心',
            title: '接口管理',
            description: '统一管理官方接口、第三方供应商与管理员后台，布局与系统设置页保持一致，便于在不同入口下获得同样的体验。',
          }
        : {
            badge: '后台控制台',
            title: '管理员后台',
            description: '管理积分模型、后台权限与系统级配置，使用与接口页一致的左右拆分布局，避免视觉风格不一致。',
          },
    [activeTab]
  );

  return (
    <div className="apple-page-shell">
      <main className="apple-shell py-5 md:py-6" style={{ maxWidth: '1480px' }}>
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <aside className="md:w-[240px] md:flex-shrink-0">
            <div className="apple-glass-card rounded-[28px] p-3 md:sticky md:top-6">
              <div className="space-y-1">
                {managerNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`apple-pill-button h-auto w-full justify-start px-4 py-3 text-left ${active ? 'active' : ''}`}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span className="flex min-w-0 flex-col items-start">
                        <span className="text-sm font-medium">{item.label}</span>
                        <span className={`mt-1 text-xs leading-5 ${active ? 'text-white/80' : 'text-[var(--text-tertiary)]'}`}>
                          {item.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          <section className="apple-glass-card min-w-0 flex-1 rounded-[28px] p-4 md:p-5">
            <div className="mb-5 border-b border-[var(--border-light)] pb-4">
              <div className="apple-badge info mb-3">{activeMeta.badge}</div>
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <h1 className="text-[28px] font-semibold tracking-tight text-[var(--text-primary)]">
                    {activeMeta.title}
                  </h1>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
                    {activeMeta.description}
                  </p>
                </div>
                <div className="apple-badge">
                  {activeTab === 'api' ? '管理官方接口、第三方与价格同步' : '管理积分模型与后台权限'}
                </div>
              </div>
            </div>

            <Suspense
              fallback={
                <div className="apple-empty-state rounded-[24px] px-6 py-10 text-center text-sm text-[var(--text-tertiary)]">
                  正在加载管理内容...
                </div>
              }
            >
              {activeTab === 'api' ? <ApiSettingsView /> : <AdminSystem />}
            </Suspense>
          </section>
        </div>
      </main>
    </div>
  );
};

export default ApiKeyManager;
