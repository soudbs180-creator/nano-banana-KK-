import React from 'react';
import { ArrowRight, ShieldAlert } from 'lucide-react';

function ReadOnlyApiNotice({ title, description }: { title: string; description: string }) {
    return (
        <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-secondary)] p-6">
            <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300">
                    <ShieldAlert size={18} />
                </div>
                <div>
                    <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
                    <p className="text-sm text-[var(--text-secondary)]">{description}</p>
                </div>
            </div>

            <div className="rounded-xl border border-dashed border-[var(--border-light)] bg-[var(--bg-tertiary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                API 配置写入口已统一收口到设置页中的 <span className="font-medium text-[var(--text-primary)]">ApiSettingsView</span>。
                这里保留为只读占位，避免多页面并行写入导致渠道串台。
            </div>

            <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-indigo-300">
                <ArrowRight size={14} />
                请前往“设置 → API 设置”修改渠道、Key、模型与价格能力。
            </div>
        </div>
    );
}

export const getActiveChannel = () => null;
export const isProxyMode = () => false;
export const getProxyConfig = () => null;

const UnifiedApiView: React.FC = () => (
    <ReadOnlyApiNotice
        title="Unified API View 已改为只读"
        description="统一 API 路由已切换到单一配置入口。"
    />
);

export default UnifiedApiView;
