import React from 'react';
import { ArrowRight, ShieldAlert } from 'lucide-react';

const ApiManagementView: React.FC = () => {
    return (
        <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-secondary)] p-6">
            <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300">
                    <ShieldAlert size={18} />
                </div>
                <div>
                    <h3 className="text-base font-semibold text-[var(--text-primary)]">API Management 已改为只读</h3>
                    <p className="text-sm text-[var(--text-secondary)]">用户渠道的可写配置已经统一收口。</p>
                </div>
            </div>

            <div className="rounded-xl border border-dashed border-[var(--border-light)] bg-[var(--bg-tertiary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                为避免多个页面同时写入本地配置，这个页面不再直接修改 API 渠道。
            </div>

            <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-indigo-300">
                <ArrowRight size={14} />
                请在“设置 → API 设置”中维护实际调用渠道。
            </div>
        </div>
    );
};

export default ApiManagementView;
