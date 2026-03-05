/**
 * Credit Service
 * 
 * 处理积分相关的所有操作
 * 包括：查询余额、消费、充值、退款、交易记录
 */

import { supabase } from '../../lib/supabase';
import { notify } from '../system/notificationService';

export interface UserCredits {
  id: string;
  user_id: string;
  email: string;
  balance: number;
  total_earned: number;
  total_spent: number;
  frozen: number;
  version: number;
  last_transaction_at: string;
  created_at: string;
  updated_at: string;
}

export interface CreditTransaction {
  id: string;
  user_id: string;
  email: string;
  type: 'recharge' | 'consumption' | 'refund' | 'freeze' | 'unfreeze';
  amount: number;
  balance_after: number;
  model_id?: string;
  model_name?: string;
  provider_id?: string;
  description?: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  error_message?: string;
  metadata?: any;
  created_at: string;
  completed_at?: string;
}

class CreditService {
  private static instance: CreditService;

  static getInstance(): CreditService {
    if (!CreditService.instance) {
      CreditService.instance = new CreditService();
    }
    return CreditService.instance;
  }

  // ==================== 查询 ====================

  /**
   * 获取用户当前积分
   */
  async getUserCredits(userId: string): Promise<UserCredits | null> {
    const { data, error } = await supabase
      .from('user_credits')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('[CreditService] Get credits error:', error);
      return null;
    }

    return data;
  }

  /**
   * 获取或创建用户积分记录
   */
  async getOrCreateCredits(userId: string, email?: string): Promise<UserCredits | null> {
    const { data, error } = await supabase.rpc('get_or_create_user_credits', {
      p_user_id: userId,
      p_email: email
    });

    if (error) {
      console.error('[CreditService] Get or create credits error:', error);
      return null;
    }

    return data;
  }

  /**
   * 获取交易记录
   */
  async getTransactions(
    userId: string,
    options?: {
      type?: string;
      status?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<CreditTransaction[]> {
    let query = supabase
      .from('credit_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (options?.type) {
      query = query.eq('type', options.type);
    }
    if (options?.status) {
      query = query.eq('status', options.status);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[CreditService] Get transactions error:', error);
      return [];
    }

    return data || [];
  }

  // ==================== 消费 ====================

  /**
   * 消费积分
   * @returns 成功时返回 {success: true, transactionId, newBalance}
   */
  async consumeCredits(
    userId: string,
    amount: number,
    modelInfo: {
      model_id: string;
      model_name: string;
      provider_id: string;
    },
    description?: string
  ): Promise<{
    success: boolean;
    transactionId?: string;
    newBalance?: number;
    message: string;
  }> {
    const { data, error } = await supabase.rpc('consume_credits', {
      p_user_id: userId,
      p_amount: amount,
      p_model_id: modelInfo.model_id,
      p_model_name: modelInfo.model_name,
      p_provider_id: modelInfo.provider_id,
      p_description: description
    });

    if (error) {
      console.error('[CreditService] Consume credits error:', error);
      return { success: false, message: error.message };
    }

    const result = Array.isArray(data) ? data[0] : data;

    return {
      success: result?.success || false,
      transactionId: result?.transaction_id,
      newBalance: result?.new_balance,
      message: result?.message || '未知状态'
    };
  }

  /**
   * 检查积分是否足够
   */
  async hasEnoughCredits(userId: string, requiredAmount: number): Promise<boolean> {
    const credits = await this.getUserCredits(userId);
    return (credits?.balance || 0) >= requiredAmount;
  }

  // ==================== 退款 ====================

  /**
   * 退回积分（调用失败时使用）
   */
  async refundCredits(
    transactionId: string,
    reason: string = '调用失败退回'
  ): Promise<{
    success: boolean;
    newBalance?: number;
    message: string;
  }> {
    const { data, error } = await supabase.rpc('refund_credits', {
      p_transaction_id: transactionId,
      p_reason: reason
    });

    if (error) {
      console.error('[CreditService] Refund credits error:', error);
      return { success: false, message: error.message };
    }

    const result = Array.isArray(data) ? data[0] : data;

    return {
      success: result?.success || false,
      newBalance: result?.new_balance,
      message: result?.message || '未知状态'
    };
  }

  // ==================== 管理员功能 ====================

  /**
   * 管理员充值（仅限管理员调用）
   */
  async adminRecharge(
    targetUserId: string,
    amount: number,
    description: string = '管理员充值',
    adminUserId?: string
  ): Promise<{
    success: boolean;
    newBalance?: number;
    message: string;
  }> {
    const { data, error } = await supabase.rpc('admin_recharge_credits', {
      p_target_user_id: targetUserId,
      p_amount: amount,
      p_description: description,
      p_admin_user_id: adminUserId
    });

    if (error) {
      console.error('[CreditService] Admin recharge error:', error);
      notify.error('充值失败', error.message);
      return { success: false, message: error.message };
    }

    if (data.success) {
      notify.success('充值成功', `已为用户充值 ${amount} 积分，当前余额：${data.new_balance}`);
    } else {
      notify.error('充值失败', data.message);
    }

    return {
      success: data.success,
      newBalance: data.new_balance,
      message: data.message
    };
  }

  /**
   * 通过邮箱查找用户并充值
   */
  async rechargeByEmail(
    email: string,
    amount: number,
    description?: string,
    adminUserId?: string
  ): Promise<{
    success: boolean;
    newBalance?: number;
    message: string;
    userId?: string;
  }> {
    // 🚀 [Fix] 从 user_credits 查找用户（替代已删除的 profiles 表）
    const { data: users, error: userError } = await supabase
      .from('user_credits')
      .select('user_id, email')
      .eq('email', email)
      .single();

    if (userError || !users) {
      notify.error('用户不存在', '请检查邮箱地址是否正确');
      return { success: false, message: '用户不存在' };
    }

    const result = await this.adminRecharge(
      users.user_id,
      amount,
      description,
      adminUserId
    );

    return { ...result, userId: users.user_id };
  }

  // ==================== 统计 ====================

  /**
   * 获取用户积分统计
   */
  async getUserStats(userId: string): Promise<{
    currentBalance: number;
    totalEarned: number;
    totalSpent: number;
    transactionCount: number;
    lastTransactionAt?: string;
  } | null> {
    const credits = await this.getUserCredits(userId);
    if (!credits) return null;

    const { count, error } = await supabase
      .from('credit_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      console.error('[CreditService] Get stats error:', error);
    }

    return {
      currentBalance: credits.balance,
      totalEarned: credits.total_earned,
      totalSpent: credits.total_spent,
      transactionCount: count || 0,
      lastTransactionAt: credits.last_transaction_at
    };
  }

  /**
   * 获取今日消费统计
   */
  async getTodayConsumption(userId: string): Promise<{
    consumptionCount: number;
    totalCredits: number;
    byModel: Record<string, number>;
  }> {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('credit_transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('type', 'consumption')
      .eq('status', 'completed')
      .gte('created_at', today)
      .lt('created_at', today + 'T23:59:59');

    if (error || !data) {
      return { consumptionCount: 0, totalCredits: 0, byModel: {} };
    }

    const byModel: Record<string, number> = {};
    let totalCredits = 0;

    data.forEach(t => {
      const amount = Math.abs(t.amount);
      totalCredits += amount;
      if (t.model_id) {
        byModel[t.model_id] = (byModel[t.model_id] || 0) + amount;
      }
    });

    return {
      consumptionCount: data.length,
      totalCredits,
      byModel
    };
  }
}

export const creditService = CreditService.getInstance();
