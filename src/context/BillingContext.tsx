import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

export interface CreditTransactionLog {
  id: string;
  user_id?: string;
  type: 'recharge' | 'consumption' | 'refund' | 'freeze' | 'unfreeze' | string;
  amount: number;
  balance_after?: number | null;
  model_id?: string | null;
  model_name?: string | null;
  provider_id?: string | null;
  description?: string | null;
  status?: 'pending' | 'completed' | 'failed' | 'refunded' | string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
  completed_at?: string | null;
}

interface BillingContextType {
  balance: number;
  loading: boolean;
  recharge: (amount: number, currency: 'CNY' | 'USD') => Promise<void>;
  consumeCredits: (modelId: string, count: number, details?: any) => Promise<boolean>;
  refundCredits: (amount: number, reason: string) => Promise<boolean>;
  billingLogs: CreditTransactionLog[];
  usageLogs: CreditTransactionLog[];
  fetchLogs: () => Promise<void>;
  showRechargeModal: boolean;
  setShowRechargeModal: (show: boolean) => void;
}

const BillingContext = createContext<BillingContextType>({
  balance: 0,
  loading: true,
  recharge: async () => {},
  consumeCredits: async () => false,
  refundCredits: async () => false,
  billingLogs: [],
  usageLogs: [],
  fetchLogs: async () => {},
  showRechargeModal: false,
  setShowRechargeModal: () => {},
});

export const useBilling = () => useContext(BillingContext);

export const BillingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [billingLogs, setBillingLogs] = useState<CreditTransactionLog[]>([]);
  const [usageLogs, setUsageLogs] = useState<CreditTransactionLog[]>([]);
  const [showRechargeModal, setShowRechargeModal] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!user) {
      setBalance(0);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_credits')
        .select('balance')
        .eq('user_id', user.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          const { data: created, error: createError } = await supabase
            .from('user_credits')
            .insert([{ user_id: user.id, balance: 0 }])
            .select('balance')
            .single();

          if (!createError && created) {
            setBalance(Number(created.balance || 0));
          }
          return;
        }

        console.error('[BillingContext] 读取余额失败:', error);
        return;
      }

      setBalance(Number(data?.balance || 0));
    } catch (error) {
      console.error('[BillingContext] 读取余额异常:', error);
    }
  }, [user]);

  const fetchLogs = useCallback(async () => {
    if (!user) {
      setBillingLogs([]);
      setUsageLogs([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) {
        console.error('[BillingContext] 读取交易记录失败:', error);
        return;
      }

      const rows = (data || []) as CreditTransactionLog[];
      const rechargeRows = rows.filter((row) => row.type === 'recharge');
      const usageRows = rows.filter((row) => row.type !== 'recharge');

      setBillingLogs(rechargeRows);
      setUsageLogs(usageRows);
    } catch (error) {
      console.error('[BillingContext] 读取交易记录异常:', error);
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (!user) {
        setBalance(0);
        setBillingLogs([]);
        setUsageLogs([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      await Promise.all([fetchBalance(), fetchLogs()]);
      if (!cancelled) {
        setLoading(false);
      }
    };

    void init();

    if (!user) {
      return () => {
        cancelled = true;
      };
    }

    const balanceChannel = supabase
      .channel(`balance_changes_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_credits',
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          if (payload?.new && typeof payload.new.balance !== 'undefined') {
            setBalance(Number(payload.new.balance || 0));
          }
        }
      )
      .subscribe();

    const transactionChannel = supabase
      .channel(`credit_transaction_changes_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'credit_transactions',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void fetchLogs();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(balanceChannel);
      void supabase.removeChannel(transactionChannel);
    };
  }, [user, fetchBalance, fetchLogs]);

  const consumeCredits = useCallback(
    async (modelId: string, count: number, details: any = {}) => {
      if (!user) return false;

      const needAmount = Math.max(0, Number(count || 0));
      if (needAmount <= 0) return true;

      try {
        const { data: latestBalanceRow } = await supabase
          .from('user_credits')
          .select('balance')
          .eq('user_id', user.id)
          .single();

        const latestBalance = Number(latestBalanceRow?.balance ?? balance);
        if (latestBalance < needAmount) {
          return false;
        }

        const { data: success, error } = await supabase.rpc('consume_user_credits', {
          p_user_id: user.id,
          p_consume_amount: needAmount,
          p_feature: details?.feature || `模型调用：${modelId}`,
        });

        if (error) throw error;
        if (!success) return false;

        await Promise.all([fetchBalance(), fetchLogs()]);
        return true;
      } catch (error) {
        console.error('[BillingContext] 扣减积分失败:', error);
        return false;
      }
    },
    [user, balance, fetchBalance, fetchLogs]
  );

  const refundCredits = useCallback(
    async (amount: number, reason: string) => {
      if (!user || amount <= 0) return false;

      try {
        const { data: success, error } = await supabase.rpc('refund_user_credits', {
          p_user_id: user.id,
          p_refund_amount: amount,
        });

        if (error) throw error;
        await Promise.all([fetchBalance(), fetchLogs()]);
        return Boolean(success);
      } catch (error) {
        console.error('[BillingContext] 退还积分失败:', reason, error);
        return false;
      }
    },
    [user, fetchBalance, fetchLogs]
  );

  const recharge = useCallback(
    async (amount: number, currency: 'CNY' | 'USD') => {
      if (!user) return;

      const creditsToAdd = currency === 'CNY' ? amount * 5 : amount * 30;
      const { error } = await supabase.rpc('process_payment_recharge', {
        p_user_id: user.id,
        p_transaction_id: `MOCK-TXN-${Date.now()}`,
        p_amount: amount,
        p_currency: currency,
        p_credits_added: creditsToAdd,
        p_payment_method: 'system_test',
      });

      if (error) {
        console.error('[BillingContext] 充值失败:', error);
        throw error;
      }

      await Promise.all([fetchBalance(), fetchLogs()]);
    },
    [user, fetchBalance, fetchLogs]
  );

  return (
    <BillingContext.Provider
      value={{
        balance,
        loading,
        recharge,
        consumeCredits,
        refundCredits,
        billingLogs,
        usageLogs,
        fetchLogs,
        showRechargeModal,
        setShowRechargeModal,
      }}
    >
      {children}
    </BillingContext.Provider>
  );
};
