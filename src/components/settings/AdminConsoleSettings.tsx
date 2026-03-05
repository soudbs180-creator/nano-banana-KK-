import React, { useMemo, useState } from 'react';
import { KeyRound, Shield, Wallet } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { notify } from '../../services/system/notificationService';

const AdminConsoleSettings: React.FC = () => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [identity, setIdentity] = useState('');
  const [rechargeAmount, setRechargeAmount] = useState(100);
  const [rechargeRemark, setRechargeRemark] = useState('管理员充值');
  const [recharging, setRecharging] = useState(false);

  const [newAdminIdentity, setNewAdminIdentity] = useState('');
  const [settingAdmin, setSettingAdmin] = useState(false);

  const amountLabel = useMemo(() => `${rechargeAmount} 积分`, [rechargeAmount]);

  const handleChangePassword = async () => {
    if (!oldPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      notify.error('信息不完整', '请填写旧密码、新密码和确认密码。');
      return;
    }
    if (newPassword !== confirmPassword) {
      notify.error('密码不一致', '两次输入的新密码不一致。');
      return;
    }
    if (newPassword.length < 8) {
      notify.error('密码过短', '新密码至少 8 位。');
      return;
    }

    setChangingPassword(true);
    try {
      const { data, error } = await supabase.rpc('admin_change_password_secure', {
        p_old_password: oldPassword,
        p_new_password: newPassword,
      });
      if (error || data !== true) {
        throw error || new Error('修改失败');
      }
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      notify.success('修改成功', '管理员密码已更新。');
    } catch (error: any) {
      notify.error('修改失败', error?.message || '请检查旧密码后重试。');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleRecharge = async () => {
    if (!identity.trim()) {
      notify.error('信息不完整', '请输入用户 ID 或邮箱。');
      return;
    }
    setRecharging(true);
    try {
      const { data, error } = await supabase.rpc('admin_recharge_credits_by_identity', {
        p_identity: identity.trim(),
        p_amount: rechargeAmount,
        p_description: rechargeRemark.trim() || '管理员充值',
      });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.success) {
        throw new Error(row?.message || '充值失败');
      }
      notify.success('充值成功', `新余额：${row.new_balance} 积分`);
    } catch (error: any) {
      notify.error('充值失败', error?.message || '请检查用户信息后重试。');
    } finally {
      setRecharging(false);
    }
  };

  const handleSetAdmin = async () => {
    if (!newAdminIdentity.trim()) {
      notify.error('信息不完整', '请输入用户 ID 或邮箱。');
      return;
    }
    setSettingAdmin(true);
    try {
      const { data, error } = await supabase.rpc('admin_set_user_role_by_identity', {
        p_identity: newAdminIdentity.trim(),
        p_role: 'admin',
      });
      if (error) throw error;
      notify.success('设置成功', `用户已设为管理员（${data}）。`);
      setNewAdminIdentity('');
    } catch (error: any) {
      notify.error('设置失败', error?.message || '请检查用户信息后重试。');
    } finally {
      setSettingAdmin(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-100">
        <div className="text-sm font-semibold">管理员控制台</div>
        <p className="mt-2 text-xs text-emerald-200/90">
          本页仅处理管理员操作：改密、充值、设置管理员。默认管理员初始密码为 123456，请首次登录后立即修改。
        </p>
      </div>

      <section className="rounded-2xl border border-[var(--border-light)] p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <KeyRound size={16} />
          修改管理员密码
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="space-y-1">
            <span className="text-[11px] text-[var(--text-tertiary)]">旧密码</span>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="请输入旧密码"
              className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-[var(--text-tertiary)]">新密码</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="至少 8 位"
              className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-[var(--text-tertiary)]">确认新密码</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次输入新密码"
              className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm"
            />
          </label>
        </div>
        <button
          onClick={() => void handleChangePassword()}
          disabled={changingPassword}
          className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-xs text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {changingPassword ? '提交中...' : '保存新密码'}
        </button>
      </section>

      <section className="rounded-2xl border border-[var(--border-light)] p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <Wallet size={16} />
          充值用户积分
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[11px] text-[var(--text-tertiary)]">用户 ID 或邮箱</span>
            <input
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
              placeholder="例如：用户 UUID 或 user@example.com"
              className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-[var(--text-tertiary)]">备注</span>
            <input
              value={rechargeRemark}
              onChange={(e) => setRechargeRemark(e.target.value)}
              placeholder="充值说明（可选）"
              className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="mt-3">
          <div className="mb-1 text-[11px] text-[var(--text-tertiary)]">充值积分：{amountLabel}</div>
          <input
            type="range"
            min={1}
            max={1000}
            value={rechargeAmount}
            onChange={(e) => setRechargeAmount(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <button
          onClick={() => void handleRecharge()}
          disabled={recharging}
          className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-xs text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {recharging ? '充值中...' : '确认充值'}
        </button>
      </section>

      <section className="rounded-2xl border border-[var(--border-light)] p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <Shield size={16} />
          设置新的管理员
        </div>
        <label className="space-y-1 block">
          <span className="text-[11px] text-[var(--text-tertiary)]">用户 ID 或邮箱</span>
          <input
            value={newAdminIdentity}
            onChange={(e) => setNewAdminIdentity(e.target.value)}
            placeholder="输入后将该用户设置为管理员"
            className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm"
          />
        </label>
        <button
          onClick={() => void handleSetAdmin()}
          disabled={settingAdmin}
          className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-xs text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {settingAdmin ? '设置中...' : '确认设置管理员'}
        </button>
      </section>
    </div>
  );
};

export default AdminConsoleSettings;
