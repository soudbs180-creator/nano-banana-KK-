import React, { useEffect, useState } from 'react';
import { Edit2, Globe, Pause, Play, Plus, RefreshCw, Server, Trash2, Zap } from 'lucide-react';
import keyManager, { KeySlot } from '../../services/auth/keyManager';
import { notify } from '../../services/system/notificationService';
import { KeySlotModal } from './KeySlotModal';

const ApiManagementView: React.FC = () => {
  const [slots, setSlots] = useState<KeySlot[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'official' | 'proxy' | 'third-party'>('official');
  const [editingSlot, setEditingSlot] = useState<KeySlot | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  const officialSlots = slots.filter((slot) => slot.type === 'official');
  const proxySlots = slots.filter((slot) => slot.type === 'proxy');
  const thirdPartySlots = slots.filter((slot) => slot.type === 'third-party');

  useEffect(() => {
    setSlots(keyManager.getSlots());
    return keyManager.subscribe(() => setSlots(keyManager.getSlots()));
  }, []);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const openAddModal = (type: 'official' | 'proxy' | 'third-party') => {
    setEditingSlot(null);
    setModalType(type);
    setIsModalOpen(true);
  };

  const openEditModal = (slot: KeySlot) => {
    setEditingSlot(slot);
    setModalType(slot.type);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (!confirm('确定要删除该 API 配置吗？')) return;
    keyManager.removeKey(id);
    notify.success('删除成功', '该 API 配置已移除。');
  };

  const handleToggle = (id: string) => {
    keyManager.toggleKey(id);
  };

  const handleTest = async (id: string) => {
    setRefreshingId(id);
    try {
      await keyManager.refreshKey(id);
    } finally {
      setRefreshingId(null);
    }
  };

  const renderBudgetInfo = (slot: KeySlot) => {
    const used = Number(slot.totalCost || 0);
    const limit = Number(slot.budgetLimit || -1);
    if (limit > 0) {
      const remain = Math.max(0, limit - used);
      return `预算 $${limit.toFixed(2)} · 已用 $${used.toFixed(2)} · 剩余 $${remain.toFixed(2)}`;
    }
    return `预算不限 · 已用 $${used.toFixed(2)}`;
  };

  const getHealthScore = (slot: KeySlot) => {
    const success = Number(slot.successCount || 0);
    const fail = Number(slot.failCount || 0);
    const total = success + fail;
    if (total <= 0) return 100;
    const score = Math.round((success / total) * 100);
    return Math.max(0, Math.min(100, score));
  };

  const getStatusLabel = (slot: KeySlot) => {
    if (slot.disabled) return '已暂停';
    if (slot.status === 'valid') return '在线';
    if (slot.status === 'invalid') return '认证失败';
    if (slot.status === 'rate_limited') return '限流中';
    return '待验证';
  };

  const getStatusClass = (slot: KeySlot) => {
    if (slot.disabled) return 'bg-zinc-700/50 text-zinc-300 border-zinc-600/50';
    if (slot.status === 'valid') return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25';
    if (slot.status === 'invalid') return 'bg-red-500/10 text-red-300 border-red-500/25';
    if (slot.status === 'rate_limited') return 'bg-amber-500/10 text-amber-300 border-amber-500/25';
    return 'bg-indigo-500/10 text-indigo-300 border-indigo-500/25';
  };

  const renderCooldown = (slot: KeySlot) => {
    if (!slot.cooldownUntil) return null;
    const leftMs = slot.cooldownUntil - Date.now();
    if (leftMs <= 0) return null;
    return `${Math.ceil(leftMs / 1000)} 秒`;
  };

  const renderCard = (slot: KeySlot) => {
    const health = getHealthScore(slot);
    const cooldown = renderCooldown(slot);
    const actionVisibleClass = isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100';

    return (
      <div
        key={slot.id}
        className="group rounded-2xl border p-3 md:p-4 transition-all"
        style={{
          borderColor: 'rgba(255,255,255,0.08)',
          background: 'linear-gradient(180deg, rgba(30,30,34,0.88) 0%, rgba(22,22,25,0.92) 100%)',
        }}
      >
        <div className={`flex ${isMobile ? 'flex-col gap-3' : 'items-center justify-between gap-4'}`}>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full ${
                  slot.disabled
                    ? 'bg-zinc-500'
                    : slot.status === 'valid'
                    ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.45)]'
                    : slot.status === 'invalid'
                    ? 'bg-red-500'
                    : 'bg-amber-500'
                }`}
              />
              <h4 className="truncate text-sm font-semibold text-zinc-100">{slot.name}</h4>
              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${getStatusClass(slot)}`}>
                {getStatusLabel(slot)}
              </span>
              {cooldown && (
                <span className="inline-flex rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
                  冷却 {cooldown}
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
              <span className="font-mono">{slot.key.slice(0, 4)}...{slot.key.slice(-4)}</span>
              <span className="hidden sm:inline">·</span>
              <span>{renderBudgetInfo(slot)}</span>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
              {slot.provider && (
                <span className="inline-flex rounded-md border border-white/10 px-1.5 py-0.5">{slot.provider}</span>
              )}
              <span
                className={`inline-flex rounded-md px-1.5 py-0.5 ${
                  health >= 85
                    ? 'bg-emerald-500/10 text-emerald-300'
                    : health >= 60
                    ? 'bg-amber-500/10 text-amber-300'
                    : 'bg-red-500/10 text-red-300'
                }`}
              >
                健康度 {health}%
              </span>
            </div>
          </div>

          <div className={`flex items-center gap-1.5 transition-opacity ${actionVisibleClass}`}>
            <button
              onClick={() => handleTest(slot.id)}
              disabled={!!refreshingId}
              className="h-9 w-9 rounded-xl text-zinc-300 hover:text-indigo-300 hover:bg-white/10 disabled:opacity-60"
              title="刷新并验证"
            >
              <RefreshCw size={16} className={refreshingId === slot.id ? 'mx-auto animate-spin' : 'mx-auto'} />
            </button>
            <button
              onClick={() => handleToggle(slot.id)}
              className="h-9 w-9 rounded-xl text-zinc-300 hover:text-emerald-300 hover:bg-white/10"
              title={slot.disabled ? '启用' : '暂停'}
            >
              {slot.disabled ? <Play size={16} className="mx-auto" /> : <Pause size={16} className="mx-auto" />}
            </button>
            <button
              onClick={() => openEditModal(slot)}
              className="h-9 w-9 rounded-xl text-zinc-300 hover:text-sky-300 hover:bg-white/10"
              title="编辑"
            >
              <Edit2 size={16} className="mx-auto" />
            </button>
            <button
              onClick={() => handleDelete(slot.id)}
              className="h-9 w-9 rounded-xl text-zinc-300 hover:text-red-300 hover:bg-white/10"
              title="删除"
            >
              <Trash2 size={16} className="mx-auto" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderSection = (
    key: string,
    title: string,
    description: string,
    icon: React.ReactNode,
    buttonText: string,
    onAdd: () => void,
    list: KeySlot[],
    emptyText: string
  ) => (
    <section key={key} className="space-y-3">
      <div className={`flex ${isMobile ? 'flex-col gap-2' : 'items-center justify-between'} px-1`}>
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 text-indigo-300">
            {icon}
          </div>
          <div>
            <h4 className="text-base font-bold text-zinc-100">{title}</h4>
            <p className="text-[11px] text-zinc-400">{description}</p>
          </div>
        </div>
        <button
          onClick={onAdd}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-indigo-500/15 px-3 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20"
        >
          <Plus size={13} /> {buttonText}
        </button>
      </div>

      <div className="grid gap-3">
        {list.length > 0 ? (
          list.map(renderCard)
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-7 text-center text-xs text-zinc-500">
            {emptyText}
          </div>
        )}
      </div>
    </section>
  );

  return (
    <div className={`${isMobile ? 'space-y-6 pb-7' : 'space-y-8 pb-10'}`}>
      <div className="px-1 py-1">
        <h3 className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold text-zinc-100`}>API 管理</h3>
        <p className="mt-1 text-xs text-zinc-400">
          管理你自己的官方接口与第三方接口。此页面配置仅对当前用户生效，不会影响其他用户。
        </p>
      </div>

      {renderSection(
        'official',
        '官方接口',
        '直接接入官方服务商，适合稳定主力调用。',
        <Zap size={16} />,
        '添加官方接口',
        () => openAddModal('official'),
        officialSlots,
        '暂无官方接口，请先添加。'
      )}

      {renderSection(
        'proxy',
        '代理接口',
        '适配 OneAPI / NewAPI 等代理服务。',
        <Server size={16} />,
        '添加代理接口',
        () => openAddModal('proxy'),
        proxySlots,
        '暂无代理接口配置。'
      )}

      {renderSection(
        'third-party',
        '第三方接口',
        '接入其他供应商，支持独立 URL 和独立价格体系。',
        <Globe size={16} />,
        '添加第三方接口',
        () => openAddModal('third-party'),
        thirdPartySlots,
        '暂无第三方接口配置。'
      )}

      <KeySlotModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        modalType={modalType}
        editingSlot={editingSlot || undefined}
        providerId={modalType === 'third-party' && !editingSlot ? undefined : undefined}
      />
    </div>
  );
};

export default ApiManagementView;
