import React, { useEffect, useMemo, useState } from 'react';
import { Clock3, Loader2, Lock, Settings, ShieldAlert, ShieldCheck, UserCog } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { notify } from '../../services/system/notificationService';
import CreditModelSettings from './CreditModelSettings';
import AdminConsoleSettings from './AdminConsoleSettings';
import {
  SETTINGS_ELEVATED_STYLE,
  SETTINGS_INPUT_CLASSNAME,
  SETTINGS_LABEL_CLASSNAME,
  SETTINGS_WARNING_STYLE,
  SettingsActionButton,
  SettingsBadge,
  SettingsSection,
  SettingsViewShell,
} from './SettingsScaffold';

type AdminTab = 'credit-models' | 'admin-console';

const SESSION_UNLOCK_KEY = 'admin_panel_unlocked_at';
const SESSION_UNLOCK_TTL_MS = 30 * 60 * 1000;

function isSessionUnlocked(): boolean {
  if (typeof window === 'undefined') return false;

  const raw = sessionStorage.getItem(SESSION_UNLOCK_KEY);
  if (!raw) return false;

  const ts = Number(raw);
  if (!Number.isFinite(ts)) return false;

  return Date.now() - ts < SESSION_UNLOCK_TTL_MS;
}

const infoCardStyle: React.CSSProperties = {
  borderColor: 'var(--border-light)',
  backgroundColor: 'var(--bg-overlay)',
};

const AdminAccessCard: React.FC<{
  tone: 'slate' | 'rose' | 'amber';
  icon: React.ComponentType<{ className?: string; size?: number }>;
  title: string;
  description: string;
  badge: string;
  children?: React.ReactNode;
  side?: React.ReactNode;
}> = ({ tone, icon: Icon, title, description, badge, children, side }) => (
  <section className="mx-auto max-w-[760px] rounded-[24px] border p-6 md:p-7" style={SETTINGS_ELEVATED_STYLE}>
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
            style={
              tone === 'rose'
                ? { border: '1px solid var(--state-danger-border)', background: 'var(--state-danger-bg)', color: 'var(--state-danger-text)' }
                : tone === 'amber'
                  ? { border: '1px solid var(--state-warning-border)', background: 'var(--state-warning-bg)', color: 'var(--state-warning-text)' }
                  : { border: '1px solid var(--border-light)', background: 'var(--bg-overlay)', color: 'var(--text-secondary)' }
            }
          >
            <Icon size={18} />
          </div>
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>
              Admin Access
            </div>
            <div className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              {title}
            </div>
            <p className="max-w-2xl text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              {description}
            </p>
          </div>
        </div>
        <SettingsBadge tone={tone}>{badge}</SettingsBadge>
      </div>

      <div className={`grid gap-4 ${side ? 'lg:grid-cols-[minmax(0,1fr)_240px]' : ''}`.trim()}>
        <div className="rounded-2xl border p-5" style={SETTINGS_ELEVATED_STYLE}>
          {children}
        </div>
        {side ? (
          <div className="rounded-2xl border p-5" style={infoCardStyle}>
            {side}
          </div>
        ) : null}
      </div>
    </div>
  </section>
);

export const AdminSystem: React.FC = () => {
  const { user, loading: authLoading } = useAuth();

  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [unlocked, setUnlocked] = useState(isSessionUnlocked());
  const [password, setPassword] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>('credit-models');
  const [mustChangeDefaultPassword, setMustChangeDefaultPassword] = useState(false);

  const userLabel = user?.email || user?.phone || user?.id || '未登录';

  const lockedReason = useMemo(() => {
    if (authLoading || checkingAdmin) return '正在校验管理员权限。';
    if (!user) return '请先登录管理员账号后再进入后台。';
    if (!isAdmin) return '当前账号没有管理员权限。';
    return '';
  }, [authLoading, checkingAdmin, isAdmin, user]);

  useEffect(() => {
    let alive = true;

    const checkAdmin = async () => {
      if (!user) {
        if (alive) {
          setIsAdmin(false);
          setCheckingAdmin(false);
          setUnlocked(false);
          setMustChangeDefaultPassword(false);
        }
        return;
      }

      setCheckingAdmin(true);
      try {
        const adminRpc = await supabase.rpc('is_admin');
        if (!adminRpc.error && Boolean(adminRpc.data) === true) {
          if (alive) {
            setIsAdmin(true);
            setCheckingAdmin(false);
          }
          return;
        }

        const profileResult = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();

        if (!alive) return;
        setIsAdmin(profileResult.data?.role === 'admin');
      } catch {
        if (alive) setIsAdmin(false);
      } finally {
        if (alive) setCheckingAdmin(false);
      }
    };

    void checkAdmin();

    return () => {
      alive = false;
    };
  }, [user]);

  const verifyAdminPassword = async () => {
    if (!password.trim()) {
      notify.error('缺少密码', '请输入管理员密码。');
      return;
    }

    setVerifying(true);
    try {
      const verifyResult = await supabase.rpc('verify_admin_password_admin', {
        input_password: password,
      });

      let ok = !verifyResult.error && Boolean(verifyResult.data) === true;

      if (!ok) {
        const legacyVerify = await supabase.rpc('verify_admin_password', {
          input_password: password,
        });
        ok = !legacyVerify.error && Boolean(legacyVerify.data) === true;
      }

      if (!ok) {
        const authResult = await supabase.rpc('authenticate_admin', {
          input_password: password,
        });
        const row = Array.isArray(authResult.data) ? authResult.data[0] : authResult.data;
        ok = !authResult.error && Boolean(row?.success);
      }

      if (!ok) {
        notify.error('验证失败', '管理员密码错误。');
        return;
      }

      sessionStorage.setItem(SESSION_UNLOCK_KEY, String(Date.now()));
      setUnlocked(true);
      setPassword('');
      notify.success('验证通过', '管理员后台已解锁。');

      try {
        const defaultPwdResult = await supabase.rpc('verify_admin_password_admin', {
          input_password: '123456',
        });
        setMustChangeDefaultPassword(!defaultPwdResult.error && defaultPwdResult.data === true);
      } catch {
        setMustChangeDefaultPassword(false);
      }
    } catch (error: any) {
      notify.error('验证失败', error.message || '请稍后重试。');
    } finally {
      setVerifying(false);
    }
  };

  const lockNow = () => {
    sessionStorage.removeItem(SESSION_UNLOCK_KEY);
    setUnlocked(false);
    setMustChangeDefaultPassword(false);
  };

  if (authLoading || checkingAdmin) {
    return (
      <SettingsViewShell>
        <AdminAccessCard
          tone="slate"
          icon={Loader2}
          title="管理员后台"
          description="正在确认当前账号是否具备管理员权限，校验完成后会显示登录入口。"
          badge="校验中"
          side={
            <div className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <div className="text-xs font-medium uppercase tracking-[0.14em]" style={{ color: 'var(--text-tertiary)' }}>
                当前账号
              </div>
              <div className="rounded-xl border px-3 py-3" style={SETTINGS_ELEVATED_STYLE}>
                {userLabel}
              </div>
              <div className="text-xs leading-6" style={{ color: 'var(--text-tertiary)' }}>
                会先检查 `is_admin` RPC，再回退到 `profiles.role`。
              </div>
            </div>
          }
        >
          <div className="flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed" style={infoCardStyle}>
            <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <Loader2 className="h-4 w-4 animate-spin" />
              正在校验管理员身份...
            </div>
          </div>
        </AdminAccessCard>
      </SettingsViewShell>
    );
  }

  if (!user || !isAdmin) {
    return (
      <SettingsViewShell>
        <AdminAccessCard
          tone="rose"
          icon={ShieldAlert}
          title="管理员后台"
          description="这里现在只保留轻量登录入口。当前账号未通过管理员校验，所以不会展示后台模块。"
          badge="访问受限"
          side={
            <div className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.14em]" style={{ color: 'var(--text-tertiary)' }}>
                  当前账号
                </div>
                <div className="mt-2 rounded-xl border px-3 py-3" style={SETTINGS_ELEVATED_STYLE}>
                  {userLabel}
                </div>
              </div>
              <div className="rounded-xl border px-3 py-3 text-xs leading-6" style={SETTINGS_WARNING_STYLE}>
                {lockedReason || '请确认当前登录的是管理员账号。'}
              </div>
            </div>
          }
        >
          <div className="space-y-3 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
            <div>只有管理员账号才能进入后台模块，普通用户不会看到任何后台配置入口。</div>
            <div>如果你本来就应该有权限，优先检查当前登录账号是否正确，以及 `profiles.role` 是否已设置为 `admin`。</div>
          </div>
        </AdminAccessCard>
      </SettingsViewShell>
    );
  }

  if (!unlocked) {
    return (
      <SettingsViewShell>
        <AdminAccessCard
          tone="amber"
          icon={ShieldCheck}
          title="管理员后台登录"
          description="管理员页面先只保留一个登录卡片。输入管理员密码后，再进入后续模块。"
          badge="会话 30 分钟"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              <span className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5" style={infoCardStyle}>
                <UserCog size={12} />
                {userLabel}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5" style={infoCardStyle}>
                <Clock3 size={12} />
                30 分钟会话
              </span>
            </div>

            <label className="block space-y-2">
              <span className={SETTINGS_LABEL_CLASSNAME}>管理员密码</span>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--text-tertiary)]">
                  <Lock className="h-4 w-4" />
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void verifyAdminPassword();
                    }
                  }}
                  placeholder="请输入管理员密码"
                  className={`${SETTINGS_INPUT_CLASSNAME} pl-10`}
                />
              </div>
            </label>

            <div className="flex flex-wrap gap-2">
              <SettingsActionButton icon={ShieldCheck} tone="primary" loading={verifying} onClick={() => void verifyAdminPassword()}>
                {verifying ? '验证中...' : '登录后台'}
              </SettingsActionButton>
            </div>

            <div className="rounded-xl border px-3 py-3 text-xs leading-6" style={infoCardStyle}>
              输入正确密码后，才会显示积分模型和后台管理模块。所有后台写入仍通过 Supabase RPC 执行。
            </div>
          </div>
        </AdminAccessCard>
      </SettingsViewShell>
    );
  }

  return (
    <SettingsViewShell>
      <section className="rounded-[24px] border p-5 md:p-6" style={SETTINGS_ELEVATED_STYLE}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                管理员后台
              </div>
              <SettingsBadge tone="emerald">已验证</SettingsBadge>
              {mustChangeDefaultPassword ? <SettingsBadge tone="amber">请修改默认密码</SettingsBadge> : null}
            </div>
            <p className="max-w-3xl text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              页面只保留必要入口。登录后在这里切换积分模型和后台管理模块，不再展示大块说明和统计卡片。
            </p>
            <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              <span className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5" style={infoCardStyle}>
                <UserCog size={12} />
                {userLabel}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5" style={infoCardStyle}>
                <Clock3 size={12} />
                会话 30 分钟
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <SettingsActionButton icon={Lock} onClick={lockNow}>
              立即锁定
            </SettingsActionButton>
          </div>
        </div>
      </section>

      {mustChangeDefaultPassword ? (
        <section className="rounded-2xl border p-4" style={SETTINGS_WARNING_STYLE}>
          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            默认密码仍然有效
          </div>
          <div className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
            建议先到“后台管理”里修改默认密码 `123456`，再继续执行其他后台操作。
          </div>
        </section>
      ) : null}

      <SettingsSection
        eyebrow="ADMIN MODULES"
        title="后台模块"
        description="只保留必要切换，避免后台入口本身塞入过多解释信息。"
        action={
          <div className="apple-pill-group">
            <button
              onClick={() => setActiveTab('credit-models')}
              className={`apple-pill-button ${activeTab === 'credit-models' ? 'active' : ''}`}
            >
              <Settings size={14} />
              积分模型
            </button>
            <button
              onClick={() => setActiveTab('admin-console')}
              className={`apple-pill-button ${activeTab === 'admin-console' ? 'active' : ''}`}
            >
              <ShieldCheck size={14} />
              后台管理
            </button>
          </div>
        }
      >
        {activeTab === 'credit-models' ? <CreditModelSettings /> : <AdminConsoleSettings />}
      </SettingsSection>
    </SettingsViewShell>
  );
};

export default AdminSystem;
