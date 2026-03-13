import React, { useMemo, useState } from 'react';
import { KeyRound, Shield, ShieldAlert, Wallet } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { notify } from '../../services/system/notificationService';
import {
  SETTINGS_ELEVATED_STYLE,
  SETTINGS_INPUT_CLASSNAME,
  SETTINGS_LABEL_CLASSNAME,
  SETTINGS_WARNING_STYLE,
  SettingsActionButton,
  SettingsBadge,
  SettingsMetricCard,
  SettingsSection,
} from './SettingsScaffold';

const AdminConsoleSettings: React.FC = () => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [identity, setIdentity] = useState('');
  const [rechargeAmount, setRechargeAmount] = useState(100);
  const [rechargeRemark, setRechargeRemark] = useState('管理员手动充值');
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
      notify.error('两次输入不一致', '请确认两次输入的新密码完全一致。');
      return;
    }

    if (newPassword.length < 8) {
      notify.error('密码过短', '新密码至少需要 8 位。');
      return;
    }

    setChangingPassword(true);
    try {
      const { data, error } = await supabase.rpc('admin_change_password_secure', {
        p_old_password: oldPassword,
        p_new_password: newPassword,
      });

      if (error || data !== true) {
        throw error || new Error('密码修改失败');
      }

      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      notify.success('修改成功', '管理员密码已经更新。');
    } catch (error: any) {
      notify.error('修改失败', error?.message || '请检查旧密码后重试。');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleRecharge = async () => {
    if (!identity.trim()) {
      notify.error('缺少目标用户', '请输入用户 ID 或邮箱。');
      return;
    }

    setRecharging(true);
    try {
      const { data, error } = await supabase.rpc('admin_recharge_credits_by_identity', {
        p_identity: identity.trim(),
        p_amount: rechargeAmount,
        p_description: rechargeRemark.trim() || '管理员手动充值',
      });

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.success) {
        throw new Error(row?.message || '充值失败');
      }

      notify.success('充值成功', `新余额：${row.new_balance} 积分`);
      setIdentity('');
    } catch (error: any) {
      notify.error('充值失败', error?.message || '请检查用户信息后重试。');
    } finally {
      setRecharging(false);
    }
  };

  const handleSetAdmin = async () => {
    if (!newAdminIdentity.trim()) {
      notify.error('缺少目标用户', '请输入用户 ID 或邮箱。');
      return;
    }

    setSettingAdmin(true);
    try {
      const { data, error } = await supabase.rpc('admin_set_user_role_by_identity', {
        p_identity: newAdminIdentity.trim(),
        p_role: 'admin',
      });

      if (error) throw error;

      notify.success('设置成功', `已将 ${newAdminIdentity.trim()} 设为管理员。`);
      setNewAdminIdentity('');
    } catch (error: any) {
      notify.error('设置失败', error?.message || '请检查用户信息后重试。');
    } finally {
      setSettingAdmin(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-3">
        <SettingsMetricCard
          label="密码策略"
          value="至少 8 位"
          helper="建议优先完成管理员密码更新，避免继续使用默认密码。"
          icon={KeyRound}
          tone="amber"
        />
        <SettingsMetricCard
          label="本次充值"
          value={amountLabel}
          helper="支持先预览后提交，减少误充。"
          icon={Wallet}
          tone="emerald"
        />
        <SettingsMetricCard
          label="操作范围"
          value="全局管理员"
          helper="这里的修改会影响系统级后台权限与积分。"
          icon={Shield}
          tone="indigo"
        />
      </div>

      <SettingsSection
        eyebrow="PASSWORD"
        title="修改管理员密码"
        description="默认密码建议在首次进入后台后立即替换。"
        action={<SettingsBadge tone="amber">高优先级</SettingsBadge>}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="rounded-2xl border p-5" style={SETTINGS_ELEVATED_STYLE}>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-2">
                <span className={SETTINGS_LABEL_CLASSNAME}>旧密码</span>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(event) => setOldPassword(event.target.value)}
                  placeholder="输入当前密码"
                  className={SETTINGS_INPUT_CLASSNAME}
                />
              </label>

              <label className="space-y-2">
                <span className={SETTINGS_LABEL_CLASSNAME}>新密码</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="至少 8 位"
                  className={SETTINGS_INPUT_CLASSNAME}
                />
              </label>

              <label className="space-y-2">
                <span className={SETTINGS_LABEL_CLASSNAME}>确认新密码</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="再次输入新密码"
                  className={SETTINGS_INPUT_CLASSNAME}
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <SettingsActionButton icon={KeyRound} tone="primary" loading={changingPassword} onClick={() => void handleChangePassword()}>
                {changingPassword ? '保存中...' : '保存新密码'}
              </SettingsActionButton>
            </div>
          </div>

          <div className="rounded-2xl border p-5" style={SETTINGS_WARNING_STYLE}>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              密码建议
            </div>
            <div className="mt-3 space-y-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              <div>推荐使用字母、数字和符号的组合。</div>
              <div>修改成功后，后续重新解锁后台需要使用新密码。</div>
              <div>如果多人共同维护后台，建议同步更新内部记录。</div>
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        eyebrow="CREDITS"
        title="给用户充值积分"
        description="通过用户 ID 或邮箱定位目标用户，再补充积分与备注。"
        action={<SettingsBadge tone="neutral">{amountLabel}</SettingsBadge>}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="rounded-2xl border p-5" style={SETTINGS_ELEVATED_STYLE}>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-2">
                <span className={SETTINGS_LABEL_CLASSNAME}>用户 ID 或邮箱</span>
                <input
                  value={identity}
                  onChange={(event) => setIdentity(event.target.value)}
                  placeholder="例如 user@example.com"
                  className={SETTINGS_INPUT_CLASSNAME}
                />
              </label>

              <label className="space-y-2">
                <span className={SETTINGS_LABEL_CLASSNAME}>备注</span>
                <input
                  value={rechargeRemark}
                  onChange={(event) => setRechargeRemark(event.target.value)}
                  placeholder="可选备注"
                  className={SETTINGS_INPUT_CLASSNAME}
                />
              </label>
            </div>

            <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-tertiary)' }}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className={SETTINGS_LABEL_CLASSNAME}>充值额度</span>
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {amountLabel}
                </span>
              </div>

              <input
                type="range"
                min={1}
                max={1000}
                value={rechargeAmount}
                onChange={(event) => setRechargeAmount(Number(event.target.value))}
                className="mt-3 w-full"
              />

              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                <div className="text-xs leading-5" style={{ color: 'var(--text-tertiary)' }}>
                  可先拖动滑杆快速调整，再根据需要微调具体数字。
                </div>
                <input
                  type="number"
                  min={1}
                  max={100000}
                  value={rechargeAmount}
                  onChange={(event) => setRechargeAmount(Math.max(1, Number(event.target.value) || 1))}
                  className={SETTINGS_INPUT_CLASSNAME}
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <SettingsActionButton icon={Wallet} tone="primary" loading={recharging} onClick={() => void handleRecharge()}>
                {recharging ? '充值中...' : '确认充值'}
              </SettingsActionButton>
            </div>
          </div>

          <div className="rounded-2xl border p-5" style={SETTINGS_ELEVATED_STYLE}>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              提交预览
            </div>
            <div className="mt-3 space-y-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              <div>目标用户：{identity.trim() || '尚未填写'}</div>
              <div>充值额度：{amountLabel}</div>
              <div>备注信息：{rechargeRemark.trim() || '管理员手动充值'}</div>
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        eyebrow="PERMISSIONS"
        title="授予管理员权限"
        description="输入用户 ID 或邮箱后，系统会将对应账户提升为管理员。"
        action={<SettingsBadge tone="rose">谨慎操作</SettingsBadge>}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="rounded-2xl border p-5" style={SETTINGS_ELEVATED_STYLE}>
            <label className="block space-y-2">
              <span className={SETTINGS_LABEL_CLASSNAME}>用户 ID 或邮箱</span>
              <input
                value={newAdminIdentity}
                onChange={(event) => setNewAdminIdentity(event.target.value)}
                placeholder="输入后将授予管理员权限"
                className={SETTINGS_INPUT_CLASSNAME}
              />
            </label>

            <div className="mt-4 flex flex-wrap gap-2">
              <SettingsActionButton icon={Shield} tone="primary" loading={settingAdmin} onClick={() => void handleSetAdmin()}>
                {settingAdmin ? '设置中...' : '确认设为管理员'}
              </SettingsActionButton>
            </div>
          </div>

          <div className="rounded-2xl border p-5" style={SETTINGS_WARNING_STYLE}>
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              <ShieldAlert className="h-4 w-4" />
              操作提醒
            </div>
            <div className="mt-3 space-y-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              <div>管理员拥有全局配置能力，请先核对目标账号身份。</div>
              <div>更推荐通过邮箱定位，方便人工复核。</div>
              <div>权限生效后，对方重新进入后台即可看到管理员模块。</div>
            </div>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
};

export default AdminConsoleSettings;
