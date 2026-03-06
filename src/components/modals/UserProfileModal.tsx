import React, { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  AlertCircle,
  ChevronLeft,
  CreditCard,
  Loader2,
  Lock,
  LogOut,
  Pencil,
  Wallet,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useBilling } from '../../context/BillingContext';

export type UserProfileView = 'main' | 'change-password' | 'edit-profile' | 'billing';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onSignOut: () => void;
  initialView?: UserProfileView;
  isMobile?: boolean;
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const getStatusLabel = (status?: string | null) => {
  if (!status) return '已完成';
  const lower = status.toLowerCase();
  if (lower === 'completed') return '已完成';
  if (lower === 'pending') return '处理中';
  if (lower === 'failed') return '失败';
  if (lower === 'refunded') return '已退款';
  return status;
};

const getStatusClass = (status?: string | null) => {
  const lower = (status || '').toLowerCase();
  if (lower === 'failed') return 'bg-red-500/10 text-red-400 border-red-500/20';
  if (lower === 'pending') return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
  if (lower === 'refunded') return 'bg-blue-500/10 text-blue-300 border-blue-500/20';
  return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
};

const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  onSignOut,
  initialView = 'main',
  isMobile = false,
}) => {
  const { isTempUser, tempUserExpiry } = useAuth();
  const {
    balance,
    billingLogs,
    usageLogs,
    loading: billingLoading,
    fetchLogs,
    setShowRechargeModal,
  } = useBilling();

  const [view, setView] = useState<UserProfileView>('main');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [timeRemaining, setTimeRemaining] = useState('');

  const roleLabel = useMemo(() => {
    const role =
      (user?.user_metadata?.role as string | undefined) ||
      (user?.app_metadata?.role as string | undefined) ||
      'user';
    return role === 'admin' ? '管理员' : '普通用户';
  }, [user]);

  useEffect(() => {
    if (!isOpen) return;

    const safeView: UserProfileView =
      initialView === 'billing' || initialView === 'change-password' || initialView === 'edit-profile'
        ? initialView
        : 'main';

    setView(safeView);
    setMessage(null);
    setLoading(false);

    const defaultName = user?.user_metadata?.full_name || (user?.email ? user.email.split('@')[0] : '');
    setDisplayName(defaultName);
    setAvatarUrl(user?.user_metadata?.avatar_url || '');

    if (safeView === 'billing') {
      void fetchLogs();
    }
  }, [isOpen, initialView, user, fetchLogs]);

  useEffect(() => {
    if (!isTempUser || !tempUserExpiry) {
      setTimeRemaining('');
      return;
    }

    const update = () => {
      const remainMs = Math.max(0, tempUserExpiry - Date.now());
      const totalMinutes = Math.floor(remainMs / 60000);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;

      if (hours >= 24) {
        const days = Math.floor(hours / 24);
        setTimeRemaining(`${days} 天`);
        return;
      }

      if (hours > 0) {
        setTimeRemaining(`${hours} 小时 ${minutes} 分钟`);
        return;
      }

      setTimeRemaining(`${minutes} 分钟`);
    };

    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [isTempUser, tempUserExpiry]);

  const resetAndClose = () => {
    setView('main');
    setMessage(null);
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    onClose();
  };

  const openBilling = () => {
    setView('billing');
    void fetchLogs();
  };

  const handleUpdateProfile = async () => {
    const finalName = displayName.trim();
    if (!finalName) {
      setMessage({ type: 'error', text: '请输入昵称。' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: finalName,
          avatar_url: avatarUrl.trim(),
        },
      });

      if (error) throw error;
      setMessage({ type: 'success', text: '个人资料已更新。' });
      setTimeout(() => setView('main'), 900);
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || '更新失败，请稍后重试。' });
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user?.email) {
      setMessage({ type: 'error', text: '当前账户缺少邮箱信息，无法修改密码。' });
      return;
    }

    if (!oldPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      setMessage({ type: 'error', text: '请完整填写旧密码、新密码和确认密码。' });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: '新密码至少 6 位。' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: '两次输入的新密码不一致。' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: oldPassword,
      });
      if (signInError) {
        throw new Error('旧密码验证失败，请检查后重试。');
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      setMessage({ type: 'success', text: '密码修改成功。' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setView('main'), 1000);
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || '密码修改失败，请稍后重试。' });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const avatarSrc = avatarUrl || user?.user_metadata?.avatar_url || '';
  const nickname = displayName || user?.user_metadata?.full_name || user?.email?.split('@')[0] || '未命名用户';

  return (
    <div
      className={`fixed inset-0 z-[10002] flex justify-center bg-black/55 backdrop-blur-sm ${
        isMobile ? 'items-end px-2 pt-8 pb-0' : 'items-center px-3 py-4'
      }`}
    >
      <div
        className={`w-full overflow-hidden border shadow-2xl ${
          isMobile
            ? 'ios-mobile-sheet max-h-[88dvh] rounded-t-[26px] rounded-b-none'
            : 'max-w-[860px] rounded-2xl'
        }`}
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-light)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={`flex items-center justify-between border-b ${isMobile ? 'px-3 py-3' : 'px-4 py-3'}`}
          style={{ borderColor: 'var(--border-light)' }}
        >
          <div className="flex items-center gap-2">
            {view !== 'main' && (
              <button
                onClick={() => setView('main')}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border"
                style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
              >
                <ChevronLeft size={18} />
              </button>
            )}
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              {view === 'main' && '个人中心'}
              {view === 'edit-profile' && '编辑个人资料'}
              {view === 'change-password' && '修改密码'}
              {view === 'billing' && '账户管理'}
            </h2>
          </div>

          <button
            onClick={resetAndClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border"
            style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
          >
            <X size={18} />
          </button>
        </div>

        <div className={`${isMobile ? 'max-h-[74dvh] px-3 py-3' : 'max-h-[78vh] px-4 py-4'} overflow-y-auto`}>
          {message && (
            <div
              className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
                message.type === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-red-500/30 bg-red-500/10 text-red-300'
              }`}
            >
              {message.text}
            </div>
          )}

          {view === 'main' && (
            <div className={`${isMobile ? 'space-y-3' : 'space-y-4'}`}>
              {isTempUser && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={18} className="mt-0.5 text-amber-300" />
                    <div>
                      <div className="font-medium">临时账号</div>
                      <p className="mt-1 text-xs text-amber-200/90">
                        当前账号剩余有效期：{timeRemaining || '计算中'}。建议绑定正式账号，避免数据丢失。
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border-light)' }}>
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 overflow-hidden rounded-full bg-indigo-500/20 text-white">
                    {avatarSrc ? (
                      <img src={avatarSrc} alt="头像" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-lg font-bold">
                        {nickname.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {nickname}
                    </div>
                    <div className="mt-0.5 truncate text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {user?.email || '未绑定邮箱'}
                    </div>
                    <div className="mt-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                      用户 ID：{user?.id || '-'}
                    </div>
                  </div>

                  <span className="rounded-full border px-2 py-1 text-[11px]" style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}>
                    {roleLabel}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border-light)' }}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      可用余额
                    </div>
                    <div className="mt-1 text-2xl font-bold text-amber-300">{balance}</div>
                    <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                      仅管理员积分模型会消耗余额，个人 API 不扣积分
                    </div>
                  </div>
                  <button
                    onClick={() => setShowRechargeModal(true)}
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-amber-500 px-4 text-sm font-medium text-white"
                  >
                    立即充值
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => setView('edit-profile')}
                  className="flex h-11 w-full items-center justify-between rounded-lg border px-3 text-sm"
                  style={{ borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
                >
                  <span className="inline-flex items-center gap-2">
                    <Pencil size={15} /> 编辑个人资料
                  </span>
                  <span style={{ color: 'var(--text-tertiary)' }}>进入</span>
                </button>

                <button
                  onClick={() => setView('change-password')}
                  className="flex h-11 w-full items-center justify-between rounded-lg border px-3 text-sm"
                  style={{ borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
                >
                  <span className="inline-flex items-center gap-2">
                    <Lock size={15} /> 修改密码
                  </span>
                  <span style={{ color: 'var(--text-tertiary)' }}>进入</span>
                </button>

                <button
                  onClick={openBilling}
                  className="flex h-11 w-full items-center justify-between rounded-lg border px-3 text-sm"
                  style={{ borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
                >
                  <span className="inline-flex items-center gap-2">
                    <Wallet size={15} /> 账户管理
                  </span>
                  <span style={{ color: 'var(--text-tertiary)' }}>进入</span>
                </button>

                <button
                  onClick={() => {
                    resetAndClose();
                    onSignOut();
                  }}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 text-sm text-red-300"
                >
                  <LogOut size={15} /> 退出登录
                </button>
              </div>
            </div>
          )}

          {view === 'edit-profile' && (
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  昵称
                </span>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="请输入昵称"
                  className="h-10 w-full rounded-lg border bg-[var(--bg-tertiary)] px-3 text-sm"
                  style={{ borderColor: 'var(--border-light)' }}
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  头像链接（可选）
                </span>
                <input
                  value={avatarUrl}
                  onChange={(event) => setAvatarUrl(event.target.value)}
                  placeholder="请输入头像图片地址"
                  className="h-10 w-full rounded-lg border bg-[var(--bg-tertiary)] px-3 text-sm"
                  style={{ borderColor: 'var(--border-light)' }}
                />
              </label>

              <button
                onClick={() => void handleUpdateProfile()}
                disabled={loading}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white disabled:opacity-70"
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                保存资料
              </button>
            </div>
          )}

          {view === 'change-password' && (
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  当前密码
                </span>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(event) => setOldPassword(event.target.value)}
                  placeholder="请输入当前密码"
                  className="h-10 w-full rounded-lg border bg-[var(--bg-tertiary)] px-3 text-sm"
                  style={{ borderColor: 'var(--border-light)' }}
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  新密码
                </span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="至少 6 位"
                  className="h-10 w-full rounded-lg border bg-[var(--bg-tertiary)] px-3 text-sm"
                  style={{ borderColor: 'var(--border-light)' }}
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  确认新密码
                </span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="请再次输入新密码"
                  className="h-10 w-full rounded-lg border bg-[var(--bg-tertiary)] px-3 text-sm"
                  style={{ borderColor: 'var(--border-light)' }}
                />
              </label>

              <button
                onClick={() => void handleChangePassword()}
                disabled={loading}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white disabled:opacity-70"
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                保存新密码
              </button>
            </div>
          )}

          {view === 'billing' && (
            <div className="space-y-4">
              <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border-light)' }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      账户信息
                    </div>
                    <div className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      角色：{roleLabel}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      邮箱：{user?.email || '-'}
                    </div>
                  </div>

                  <div className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border-light)' }}>
                    <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                      当前积分
                    </div>
                    <div className="text-xl font-bold text-amber-300">{balance}</div>
                  </div>
                </div>

                <button
                  onClick={() => setShowRechargeModal(true)}
                  className="mt-3 inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 text-sm text-white"
                >
                  <CreditCard size={14} /> 充值余额
                </button>
              </div>

              <section className="rounded-xl border p-4" style={{ borderColor: 'var(--border-light)' }}>
                <div className="mb-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  生成记录（含失败与退款）
                </div>

                {billingLoading ? (
                  <div className="flex h-16 items-center justify-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
                    <Loader2 size={16} className="mr-2 animate-spin" /> 正在加载...
                  </div>
                ) : usageLogs.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-3 py-4 text-xs" style={{ borderColor: 'var(--border-light)', color: 'var(--text-tertiary)' }}>
                    暂无生成记录。
                  </div>
                ) : (
                  <div className="space-y-2">
                    {usageLogs.slice(0, 50).map((record) => {
                      const title = record.model_name || record.model_id || record.description || '模型调用';
                      const amountText = record.amount >= 0 ? `+${record.amount}` : `${record.amount}`;

                      return (
                        <div key={record.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--border-light)' }}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm" style={{ color: 'var(--text-primary)' }}>
                                {title}
                              </div>
                              <div className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                时间：{formatDateTime(record.created_at)}
                              </div>
                              {record.description && (
                                <div className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                  说明：{record.description}
                                </div>
                              )}
                            </div>

                            <div className="text-right">
                              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${getStatusClass(record.status)}`}>
                                {getStatusLabel(record.status)}
                              </span>
                              <div className={`mt-1 text-sm font-semibold ${record.amount >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                                {amountText}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="rounded-xl border p-4" style={{ borderColor: 'var(--border-light)' }}>
                <div className="mb-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  充值记录
                </div>

                {billingLoading ? (
                  <div className="flex h-16 items-center justify-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
                    <Loader2 size={16} className="mr-2 animate-spin" /> 正在加载...
                  </div>
                ) : billingLogs.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-3 py-4 text-xs" style={{ borderColor: 'var(--border-light)', color: 'var(--text-tertiary)' }}>
                    暂无充值记录。
                  </div>
                ) : (
                  <div className="space-y-2">
                    {billingLogs.slice(0, 50).map((record) => (
                      <div key={record.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--border-light)' }}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
                              充值 {record.amount} 积分
                            </div>
                            <div className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                              时间：{formatDateTime(record.created_at)}
                            </div>
                            {record.description && (
                              <div className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                备注：{record.description}
                              </div>
                            )}
                          </div>

                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${getStatusClass(record.status)}`}>
                            {getStatusLabel(record.status)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserProfileModal;
