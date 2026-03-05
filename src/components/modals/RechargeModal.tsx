import React, { useMemo, useState, useEffect } from 'react';
import { X, Zap, ShieldCheck, Globe, Loader2 } from 'lucide-react';
import { useBilling } from '../../context/BillingContext';
import { useAuth } from '../../context/AuthContext';
import { notify } from '../../services/system/notificationService';
import alipayIcon from '../../assets/payment/alipay.png';
import wechatIcon from '../../assets/payment/wechat.png';
import cardIcon from '../../assets/payment/card.png';

const RechargeModal: React.FC = () => {
  const { showRechargeModal, setShowRechargeModal } = useBilling();
  const { user } = useAuth();

  const [currency, setCurrency] = useState<'CNY' | 'USD'>('CNY');
  const [amount, setAmount] = useState<number>(20);
  const [selectedChannel, setSelectedChannel] = useState<'alipay' | 'wechat' | 'paypal'>('alipay');
  const [isProcessing, setIsProcessing] = useState(false);
  const [qrCodeResult, setQrCodeResult] = useState<{ qrCode: string; outTradeNo: string } | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  const isCny = currency === 'CNY';

  const calculateCredits = (amt: number, curr: 'CNY' | 'USD') => {
    return curr === 'CNY' ? amt * 5 : amt * 30;
  };

  const credits = useMemo(() => calculateCredits(amount, currency), [amount, currency]);

  const theme = useMemo(() => {
    if (currency === 'USD') {
      return {
        primary: 'bg-amber-500',
        text: 'text-amber-500',
        border: 'border-amber-500',
        light: 'bg-amber-500/10',
        gradient: 'from-amber-600 to-amber-500',
        shadow: 'shadow-amber-500/50',
        accent: '#f59e0b',
        via: 'via-amber-500/50',
      };
    }

    if (selectedChannel === 'wechat') {
      return {
        primary: 'bg-emerald-500',
        text: 'text-emerald-500',
        border: 'border-emerald-500',
        light: 'bg-emerald-500/10',
        gradient: 'from-emerald-600 to-emerald-500',
        shadow: 'shadow-emerald-500/50',
        accent: '#10b981',
        via: 'via-emerald-500/50',
      };
    }

    return {
      primary: 'bg-blue-600',
      text: 'text-blue-600',
      border: 'border-blue-500',
      light: 'bg-blue-500/10',
      gradient: 'from-blue-600 to-blue-500',
      shadow: 'shadow-blue-500/50',
      accent: '#3b82f6',
      via: 'via-blue-500/50',
    };
  }, [currency, selectedChannel]);

  const handleRecharge = async () => {
    if (!user) {
      notify.error(isCny ? '请先登录' : 'Please sign in first', isCny ? '登录后才能发起支付。' : 'You need to sign in before payment.');
      return;
    }

    if (currency !== 'CNY' || selectedChannel !== 'alipay') {
      notify.info('提示', '当前演示仅支持支付宝扫码充值');
      return;
    }

    setIsProcessing(true);
    setQrCodeResult(null);
    setPaymentSuccess(false);

    try {
      const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const isFileProtocol = window.location.protocol === 'file:' || window.location.origin === 'null';
      const baseUrl = import.meta.env.VITE_PAYMENT_GATEWAY_URL || ((isLocalHost || isFileProtocol) ? 'http://localhost:8080/api/pay' : `${window.location.origin}/api/pay`);
      const safeUserId = encodeURIComponent(user.id);

      const targetUrl = `${baseUrl}/qrcode?method=${selectedChannel}&userId=${safeUserId}&amount=${amount}&currency=${currency}`;

      const res = await fetch(targetUrl);
      const data = await res.json();

      if (data.qrCode && data.outTradeNo) {
        setQrCodeResult({ qrCode: data.qrCode, outTradeNo: data.outTradeNo });
        // Auto-open the payment link
        window.open(data.qrCode, '_blank', 'noopener,noreferrer');
      } else {
        throw new Error(data.error || '获取支付二维码失败');
      }
    } catch (err: any) {
      notify.error('支付发起失败', err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (!showRechargeModal || !qrCodeResult || paymentSuccess) return;

    let timer: NodeJS.Timeout;
    let isSubscribed = true;

    const checkStatus = async () => {
      try {
        const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const isFileProtocol = window.location.protocol === 'file:' || window.location.origin === 'null';
        const baseUrl = import.meta.env.VITE_PAYMENT_GATEWAY_URL || ((isLocalHost || isFileProtocol) ? 'http://localhost:8080/api/pay' : `${window.location.origin}/api/pay`);
        const safeUserId = user ? encodeURIComponent(user.id) : '';

        const res = await fetch(`${baseUrl}/status?outTradeNo=${qrCodeResult.outTradeNo}&userId=${safeUserId}`);
        const data = await res.json();

        if (data.tradeStatus === 'TRADE_SUCCESS' || data.tradeStatus === 'TRADE_FINISHED') {
          if (isSubscribed) {
            setPaymentSuccess(true);
            notify.success('支付成功', '积分已自动到账，页面即将刷新...');
            setTimeout(() => {
              if (isSubscribed) {
                setShowRechargeModal(false);
                setQrCodeResult(null);
                setPaymentSuccess(false);
                window.location.reload(); // Reload to refresh user credits
              }
            }, 3000);
          }
          return;
        }
      } catch (err) {
        console.error('Polling error', err);
      }

      if (isSubscribed) {
        timer = setTimeout(checkStatus, 3000); // 3 seconds poll
      }
    };

    timer = setTimeout(checkStatus, 3000);
    return () => {
      isSubscribed = false;
      clearTimeout(timer);
    };
  }, [showRechargeModal, qrCodeResult, paymentSuccess, setShowRechargeModal]);

  const handleCurrencyChange = (curr: 'CNY' | 'USD') => {
    setCurrency(curr);
    setAmount(curr === 'CNY' ? 20 : 5);
    setSelectedChannel(curr === 'CNY' ? 'alipay' : 'paypal');
    setQrCodeResult(null);
  };

  if (!showRechargeModal) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[10020] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div
        className="w-full max-w-[440px] rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 border border-gray-200 dark:border-white/10"
        style={{ backgroundColor: 'var(--bg-surface, #ffffff)' }}
      >
        <div className="relative p-6 pb-4">
          <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent ${theme.via} to-transparent`} />
          <div className="flex justify-between items-center mb-1">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg ${theme.light} ${theme.text}`}>
                <Zap size={18} fill="currentColor" />
              </div>
              <h3 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">
                {isCny ? '积分充值' : 'Credits Top-up'}
              </h3>
            </div>
            <button onClick={() => setShowRechargeModal(false)} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-gray-500 dark:text-zinc-400">
              <X size={20} />
            </button>
          </div>
          <p className="text-gray-400 dark:text-zinc-500 text-[10px] font-bold uppercase tracking-widest pl-9">
            {isCny ? '积分充值系统' : 'Credits Refill System'}
          </p>
        </div>

        <div className="px-6 py-2 space-y-6">
          {qrCodeResult ? (
            <div className="flex flex-col items-center justify-center py-6 gap-4">
              {paymentSuccess ? (
                <div className="flex flex-col items-center justify-center text-emerald-500 animate-in zoom-in slide-in-from-bottom-2">
                  <ShieldCheck size={80} className="mb-4 drop-shadow-lg" />
                  <h3 className="text-xl font-bold">支付成功</h3>
                  <p className="text-sm opacity-80 mt-1">积分已到账，正在返回...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center animate-in zoom-in slide-in-from-bottom-2">
                  <div className="bg-blue-50 dark:bg-blue-500/10 p-6 rounded-2xl border border-blue-100 dark:border-blue-500/20 mb-4 flex flex-col items-center">
                    <Loader2 size={32} className="animate-spin text-blue-500 mb-4" />
                    <p className="text-gray-900 dark:text-gray-100 font-bold text-center">
                      已在安全窗口打开支付宝收银台
                    </p>
                    <p className="text-gray-500 dark:text-zinc-400 text-sm mt-2 text-center">
                      请在新窗口完成付款，支付成功后系统将自动刷新
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      window.open(qrCodeResult.qrCode, '_blank', 'noopener,noreferrer');
                    }}
                    className="mt-2 text-sm font-bold text-blue-500 hover:text-blue-600 underline underline-offset-4 transition-colors"
                  >
                    没有看到弹出的窗口？点击这里重新打开
                  </button>
                  <button
                    onClick={() => setQrCodeResult(null)}
                    className="mt-6 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline underline-offset-4 transition-colors"
                  >
                    返回更换金额或方式
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex p-1 bg-gray-100 dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-white/5">
                <button
                  onClick={() => handleCurrencyChange('CNY')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-black transition-all ${currency === 'CNY' ? `${theme.primary} text-white shadow-lg` : 'text-gray-500 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300'}`}
                >
                  <span>人民币支付 (CNY)</span>
                </button>
                <button
                  onClick={() => handleCurrencyChange('USD')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-black transition-all ${currency === 'USD' ? `${theme.primary} text-white shadow-lg` : 'text-gray-500 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300'}`}
                >
                  <Globe size={12} />
                  <span>USD Payment (USD)</span>
                </button>
              </div>

              <div className="py-6 bg-gray-50 dark:bg-zinc-900/50 rounded-3xl border border-gray-200 dark:border-white/5 relative overflow-hidden">
                <div className={`absolute top-1/2 -right-4 -translate-y-1/2 opacity-[0.03] dark:opacity-[0.05] ${theme.text} pointer-events-none`}>
                  <Zap size={120} fill="currentColor" />
                </div>
                <div className="flex flex-col items-start gap-1 relative z-10 px-8">
                  <span className="text-[10px] font-black text-gray-500 dark:text-zinc-500 uppercase tracking-widest mb-1">
                    {isCny ? '本次可获得积分' : 'Credits You Get'}
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-5xl font-black ${theme.text} tracking-tighter`}>{credits}</span>
                    <span className="text-xs font-bold text-gray-500 dark:text-zinc-600">Credits</span>
                  </div>
                  <div className="mt-3 text-sm font-bold text-gray-500 dark:text-zinc-400 flex items-center gap-1.5">
                    <span className="opacity-50 font-medium">{isCny ? '支付金额:' : 'Amount:'}</span>
                    <span className="text-gray-900 dark:text-white text-base">{isCny ? '¥' : '$'}{amount}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4 px-2">
                <div className="flex justify-between items-center text-[10px] font-black text-gray-400 dark:text-zinc-500 uppercase tracking-widest">
                  <span>{isCny ? '充值汇率' : 'Exchange Rate'}</span>
                  <span className={theme.text}>{isCny ? '¥1 = 5 积分' : '$1 = 30 Credits'}</span>
                </div>
                <div className="relative h-12 flex items-center">
                  <input
                    type="range"
                    min={isCny ? '5' : '1'}
                    max={isCny ? '500' : '100'}
                    step={isCny ? '5' : '1'}
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="w-full h-2 rounded-full appearance-none cursor-pointer bg-gray-200 dark:bg-zinc-800"
                    style={{
                      accentColor: theme.accent,
                      backgroundImage: `linear-gradient(to right, ${theme.accent} 0%, ${theme.accent} ${(amount / (isCny ? 500 : 100)) * 100}%, var(--border-default, #e5e5e5) ${(amount / (isCny ? 500 : 100)) * 100}%, var(--border-default, #e5e5e5) 100%)`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-bold text-gray-500 dark:text-zinc-600 italic">
                  <span>{isCny ? '最低 ¥5' : 'MIN $1'}</span>
                  <span>{isCny ? '最高 ¥500' : 'MAX $100'}</span>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-bold text-gray-500 dark:text-zinc-500 uppercase tracking-wider ml-1">
                  {isCny ? '支付方式' : 'Payment Method'}
                </label>
                <div className="flex gap-3">
                  {isCny ? (
                    <>
                      <button
                        onClick={() => setSelectedChannel('alipay')}
                        className={`flex-1 flex items-center justify-center gap-3 p-3 rounded-xl border transition-all ${selectedChannel === 'alipay' ? `${theme.light} ${theme.border} ${theme.text} shadow-[0_4px_12px_rgba(59,130,246,0.1)]` : 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-white/5 text-gray-600 dark:text-zinc-400 hover:border-gray-300 dark:hover:border-white/10'}`}
                      >
                        <img src={alipayIcon} className="h-6 w-6 object-contain" alt="alipay" />
                        <span className="text-sm font-bold">支付宝</span>
                      </button>
                      <button
                        onClick={() => setSelectedChannel('wechat')}
                        className={`flex-1 flex items-center justify-center gap-3 p-3 rounded-xl border transition-all ${selectedChannel === 'wechat' ? `${theme.light} ${theme.border} ${theme.text} shadow-[0_4px_12px_rgba(34,197,94,0.1)]` : 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-white/5 text-gray-600 dark:text-zinc-400 hover:border-gray-300 dark:hover:border-white/10'}`}
                      >
                        <img src={wechatIcon} className="h-6 w-6 object-contain" alt="wechat" />
                        <span className="text-sm font-bold">微信支付</span>
                      </button>
                    </>
                  ) : (
                    <button
                      className={`flex-1 flex items-center justify-center gap-3 p-3 rounded-xl border transition-all ${selectedChannel === 'paypal' ? `${theme.light} ${theme.border} ${theme.text} shadow-[0_4px_12px_rgba(251,191,36,0.1)]` : 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-white/5 text-gray-600 dark:text-zinc-400 hover:border-gray-300 dark:hover:border-white/10'}`}
                      onClick={() => setSelectedChannel('paypal')}
                    >
                      <img src={cardIcon} className="h-6 w-6 object-contain" alt="card" />
                      <span className="text-sm font-bold">Card / PayPal</span>
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {!qrCodeResult && (
          <div className="p-6 pt-4">
            <button
              onClick={handleRecharge}
              disabled={isProcessing}
              className={`w-full h-14 rounded-2xl font-black text-white text-lg shadow-xl transition-all flex items-center justify-center gap-3 ${isProcessing ? 'bg-gray-300 dark:bg-zinc-800 cursor-not-allowed' : `bg-gradient-to-r ${theme.gradient} ${theme.shadow} hover:brightness-110 active:scale-[0.98]`}`}
            >
              {isProcessing ? <Loader2 size={24} className="animate-spin" /> : <ShieldCheck size={24} />}
              {isProcessing
                ? (isCny ? '处理中...' : 'Processing...')
                : (isCny ? `确认支付 ¥${amount}` : `Pay $${amount}`)}
            </button>
            <div className="mt-4 flex items-center justify-center gap-1.5 opacity-40">
              <div className="w-1 h-1 rounded-full bg-gray-400 dark:bg-zinc-500" />
              <span className="text-[9px] font-black text-gray-400 dark:text-zinc-500 uppercase tracking-[0.2em]">
                SECURE PAYMENT POWERED BY KK STUDIO
              </span>
              <div className="w-1 h-1 rounded-full bg-gray-400 dark:bg-zinc-500" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RechargeModal;
