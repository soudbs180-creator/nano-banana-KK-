import React, { useState, useEffect } from 'react';
import {
  Zap, Server, Globe, Plus, MoreHorizontal,
  Trash2, Edit2, Play, Pause, Activity, RefreshCw
} from 'lucide-react';
import keyManager, { KeySlot } from '../services/keyManager';
import { notify } from '../services/notificationService';
import { ApiKeyModal } from './ApiKeyModal';

const ApiManagementView = () => {
  const [slots, setSlots] = useState<KeySlot[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'official' | 'proxy' | 'third-party'>('official');
  const [editingSlot, setEditingSlot] = useState<KeySlot | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  // Filtered lists
  const officialSlots = slots.filter(s => s.type === 'official');
  const proxySlots = slots.filter(s => s.type === 'proxy');
  const thirdPartySlots = slots.filter(s => s.type === 'third-party');

  useEffect(() => {
    setSlots(keyManager.getSlots());
    return keyManager.subscribe(() => setSlots(keyManager.getSlots()));
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
    if (confirm('确定要删除此 API 吗？')) {
      keyManager.removeKey(id);
      notify.success('操作成功', '已删除 API Key');
    }
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
      return `总$${limit.toFixed(2)} 已用$${used.toFixed(2)} 剩$${remain.toFixed(2)}`;
    }
    return `总: 不限 已用$${used.toFixed(2)} 剩: 不限`;
  };

  const getHealthScore = (slot: KeySlot) => {
    const success = Number(slot.successCount || 0);
    const fail = Number(slot.failCount || 0);
    const total = success + fail;
    if (total <= 0) return 100;
    const score = Math.round((success / total) * 100);
    return Math.max(0, Math.min(100, score));
  };

  const renderCooldown = (slot: KeySlot) => {
    if (!slot.cooldownUntil) return null;
    const leftMs = slot.cooldownUntil - Date.now();
    if (leftMs <= 0) return null;
    return `${Math.ceil(leftMs / 1000)}s`;
  };

  // Card Renderer
  const renderCard = (slot: KeySlot) => (
    <div key={slot.id} className="bg-[#1e1e20] border border-white/5 rounded-xl p-4 flex items-center justify-between group hover:border-indigo-500/20 transition-all">
      {(() => {
        const health = getHealthScore(slot);
        const cooldown = renderCooldown(slot);
        return (
      <div className="flex items-center gap-4">
        {/* Status Dot */}
        <div className={`w-2 h-2 rounded-full ${slot.disabled ? 'bg-zinc-600' :
          slot.status === 'valid' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' :
            slot.status === 'invalid' ? 'bg-red-500' :
              'bg-amber-500'
          }`} />

        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-zinc-100">{slot.name}</h4>
            {slot.status === 'valid' && <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded">在线</span>}
            {slot.status === 'unknown' && !slot.disabled && <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded">待重试</span>}
            {slot.status === 'rate_limited' && !slot.disabled && <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded">限流中</span>}
            {slot.status === 'invalid' && !slot.disabled && <span className="text-[10px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded">认证失败</span>}
            {cooldown && <span className="text-[10px] bg-amber-500/10 text-amber-300 px-1.5 py-0.5 rounded">冷却 {cooldown}</span>}
            {slot.disabled && <span className="text-[10px] bg-zinc-700/50 text-zinc-400 px-1.5 py-0.5 rounded">已禁用</span>}
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-500 font-mono">
            <span>{slot.key.slice(0, 4)}...{slot.key.slice(-4)}</span>
            <span>{renderBudgetInfo(slot)}</span>
            {slot.provider && <span className="hidden sm:inline-block px-1.5 py-0.5 bg-white/5 rounded text-[10px]">{slot.provider}</span>}
            <span className={`hidden md:inline-block px-1.5 py-0.5 rounded text-[10px] ${health >= 85 ? 'bg-emerald-500/10 text-emerald-300' : health >= 60 ? 'bg-amber-500/10 text-amber-300' : 'bg-red-500/10 text-red-300'}`}>健康度 {health}%</span>
          </div>
        </div>
      </div>
      );
      })()}

      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => handleTest(slot.id)}
          disabled={!!refreshingId}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-indigo-400 hover:bg-white/5"
          title="测试连接"
        >
          <RefreshCw size={14} className={refreshingId === slot.id ? 'animate-spin' : ''} />
        </button>
        <button
          onClick={() => handleToggle(slot.id)}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-emerald-400 hover:bg-white/5"
          title={slot.disabled ? "启用" : "禁用"}
        >
          {slot.disabled ? <Play size={14} /> : <Pause size={14} />}
        </button>
        <button
          onClick={() => openEditModal(slot)}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-400 hover:bg-white/5"
          title="编辑"
        >
          <Edit2 size={14} />
        </button>
        <button
          onClick={() => handleDelete(slot.id)}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-white/5"
          title="删除"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="px-1 py-2">
        <h3 className="text-2xl font-bold text-zinc-100">API 管理</h3>
        <p className="text-xs text-zinc-500 mt-1">管理您的所有 API 连接，支持多渠道负载均衡</p>
      </div>

      {/* 1. Official Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
              <Zap size={16} />
            </div>
            <div>
              <h4 className="text-base font-bold text-zinc-200">官方直连</h4>
              <p className="text-[10px] text-zinc-500">Google Gemini 官方接口，自动匹配模型与负载</p>
            </div>
          </div>
          <button
            onClick={() => openAddModal('official')}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600/10 text-blue-500 hover:bg-blue-600/20 rounded-lg text-xs font-bold transition-colors"
          >
            <Plus size={12} /> 添加直连
          </button>
        </div>

        <div className="grid gap-3">
          {officialSlots.length > 0 ? officialSlots.map(renderCard) : (
            <div className="text-center py-6 border border-dashed border-white/10 rounded-xl">
              <p className="text-xs text-zinc-600">暂无官方直连配置</p>
            </div>
          )}
        </div>
      </section>

      {/* 2. Proxy Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <Server size={16} />
            </div>
            <div>
              <h4 className="text-base font-bold text-zinc-200">代理服务器</h4>
              <p className="text-[10px] text-zinc-500">OneAPI / NewAPI / Antigravity 中转服务</p>
            </div>
          </div>
          <button
            onClick={() => openAddModal('proxy')}
            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600/10 text-emerald-500 hover:bg-emerald-600/20 rounded-lg text-xs font-bold transition-colors"
          >
            <Plus size={12} /> 添加代理
          </button>
        </div>

        <div className="grid gap-3">
          {proxySlots.length > 0 ? proxySlots.map(renderCard) : (
            <div className="text-center py-6 border border-dashed border-white/10 rounded-xl">
              <p className="text-xs text-zinc-600">暂无代理服务器配置</p>
            </div>
          )}
        </div>
      </section>

      {/* 3. Third-Party Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500">
              <Globe size={16} />
            </div>
            <div>
              <h4 className="text-base font-bold text-zinc-200">第三方 API</h4>
              <p className="text-[10px] text-zinc-500">智谱、DeepSeek 等其他服务商接口</p>
            </div>
          </div>
          <button
            onClick={() => openAddModal('third-party')}
            className="flex items-center gap-1 px-3 py-1.5 bg-purple-600/10 text-purple-500 hover:bg-purple-600/20 rounded-lg text-xs font-bold transition-colors"
          >
            <Plus size={12} /> 添加服务商
          </button>
        </div>

        <div className="grid gap-3">
          {thirdPartySlots.length > 0 ? thirdPartySlots.map(renderCard) : (
            <div className="text-center py-6 border border-dashed border-white/10 rounded-xl">
              <p className="text-xs text-zinc-600">暂无第三方服务配置</p>
            </div>
          )}
        </div>
      </section>

      {/* Modal */}
      <ApiKeyModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialType={modalType}
        editingSlot={editingSlot}
      />
    </div>
  );
};

export default ApiManagementView;
