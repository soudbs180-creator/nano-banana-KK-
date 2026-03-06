import React, { useEffect, useMemo, useState } from 'react';
import { Lock, ShieldCheck, Settings, UserCog } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { notify } from '../../services/system/notificationService';
import CreditModelSettings from './CreditModelSettings';
import AdminConsoleSettings from './AdminConsoleSettings';

type AdminTab = 'credit-models' | 'admin-console';

const SESSION_UNLOCK_KEY = 'admin_panel_unlocked_at';
const SESSION_UNLOCK_TTL_MS = 30 * 60 * 1000;

function isSessionUnlocked(): boolean {
  const raw = sessionStorage.getItem(SESSION_UNLOCK_KEY);
  if (!raw) return false;
  const ts = Number(raw);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < SESSION_UNLOCK_TTL_MS;
}

export const AdminSystem: React.FC = () => {
  const { user, loading: authLoading } = useAuth();

  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [unlocked, setUnlocked] = useState(isSessionUnlocked());
  const [password, setPassword] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>('credit-models');
  const [mustChangeDefaultPassword, setMustChangeDefaultPassword] = useState(false);

  const lockedReason = useMemo(() => {
    if (authLoading || checkingAdmin) return '正在校验管理员权限...';
    if (!user) return '请先登录后再打开管理后台。';
    if (!isAdmin) return '当前账号不是管理员。';
    return '';
  }, [authLoading, checkingAdmin, user, isAdmin]);

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

        const profileResult = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

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
      notify.success('已解锁', '管理后台已解锁。');

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
      <div className="rounded-2xl border border-[var(--border-light)] p-4 text-sm text-[var(--text-secondary)]">
        正在加载管理后台...
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-red-100">
        <div className="text-sm font-semibold">管理员访问受限</div>
        <p className="mt-2 text-xs text-red-200/90">{lockedReason}</p>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-emerald-100">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
            <h3 className="text-sm font-semibold">管理员安全验证</h3>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-emerald-200/90">
            已识别为管理员账号，请输入密码继续。所有写入操作均通过 Supabase RPC 执行。
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-secondary)] p-4">
          <label className="mb-2 block text-xs text-[var(--text-tertiary)]">管理员密码</label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                <Lock className="h-4 w-4 text-[var(--text-tertiary)]" />
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void verifyAdminPassword();
                  }
                }}
                placeholder="请输入管理员密码"
                className="h-10 w-full rounded-xl border border-[var(--border-light)] bg-[var(--bg-tertiary)] pl-10 pr-3 text-sm text-[var(--text-primary)]"
              />
            </div>
            <button
              onClick={() => void verifyAdminPassword()}
              disabled={verifying}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {verifying ? '验证中...' : '解锁'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-emerald-100">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
            <h3 className="text-sm font-semibold">管理后台（已解锁）</h3>
          </div>
          <button
            onClick={lockNow}
            className="rounded-lg border border-emerald-300/40 px-2 py-1 text-xs text-emerald-100 hover:bg-emerald-400/10"
          >
            锁定
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-emerald-200/90">
          管理员配置的积分模型面向全体用户；用户 API 管理仅作用于本人，两者已隔离。
        </p>
        {mustChangeDefaultPassword && (
          <p className="mt-2 text-xs text-amber-200">
            检测到当前仍是默认密码 123456，请立即在“后台管理”里修改管理员密码。
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveTab('credit-models')}
          className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs ${
            activeTab === 'credit-models' ? 'bg-indigo-600 text-white' : 'border border-[var(--border-light)] text-[var(--text-secondary)]'
          }`}
        >
          <Settings size={14} />
          积分模型
        </button>
        <button
          onClick={() => setActiveTab('admin-console')}
          className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs ${
            activeTab === 'admin-console' ? 'bg-indigo-600 text-white' : 'border border-[var(--border-light)] text-[var(--text-secondary)]'
          }`}
        >
          <UserCog size={14} />
          后台管理
        </button>
      </div>

      {activeTab === 'credit-models' ? <CreditModelSettings /> : <AdminConsoleSettings />}
    </div>
  );
};

export default AdminSystem;
