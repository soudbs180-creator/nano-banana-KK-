const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const { AlipaySdk } = require('alipay-sdk');
const { createClient } = require('@supabase/supabase-js');
const webhookRouter = require('./webhook');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function formatKey(key, type) {
  const raw = String(key || '').trim();
  if (!raw) return '';
  if (raw.includes('-----BEGIN')) return raw;
  const chunks = raw.match(/.{1,64}/g) || [];
  return `-----BEGIN ${type}-----\n${chunks.join('\n')}\n-----END ${type}-----`;
}

function sanitizePaymentUrl(raw) {
  if (!raw) return '';
  let url = String(raw).trim();

  const markdownMatch = url.match(/\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/i);
  if (markdownMatch) {
    url = markdownMatch[1];
  }

  url = url.replace(/[)\],.;]+$/g, '');
  return url;
}

const alipaySdk = new AlipaySdk({
  appId: process.env.AP_APP_ID || process.env.ALIPAY_APP_ID,
  privateKey: formatKey(process.env.AP_APP_KEY || process.env.ALIPAY_PRIVATE_KEY, 'PRIVATE KEY'),
  keyType: 'PKCS8',
  alipayPublicKey: formatKey(process.env.AP_PUB_KEY || process.env.ALIPAY_PUBLIC_KEY, 'PUBLIC KEY'),
  gateway:
    String(process.env.AP_CURRENT_ENV || '').toLowerCase() === 'sandbox'
      ? 'https://openapi-sandbox.dl.alipaydev.com/gateway.do'
      : 'https://openapi.alipay.com/gateway.do',
  timeout: 5000,
  camelcase: true,
  signType: process.env.AP_ENCRYPTION_ALGO || 'RSA2',
  encryptKey: process.env.AP_ENCRYPT_KEY || process.env.ALIPAY_ENCRYPT_KEY,
});

if (!alipaySdk) {
  console.warn('[payment-server] Alipay SDK 未配置完整，支付将不可用。');
}

const supabaseUrl = process.env.SUPABASE_URL || 'https://ovdjhdofjysanamgkfng.supabase.co';
const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!supabaseServiceRoleKey) {
  throw new Error('[payment-server] 缺少 SUPABASE_SERVICE_ROLE_KEY，已拒绝以低权限密钥启动充值服务。');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const creditedOrders = new Set();

app.use('/api/pay/notify', webhookRouter);

const alipayPayMethodMode = String(process.env.ALIPAY_PAY_METHOD || 'page').toLowerCase();
const alipayTradeMethod = alipayPayMethodMode === 'wap' ? 'alipay.trade.wap.pay' : 'alipay.trade.page.pay';
const alipayProductCode = alipayPayMethodMode === 'wap' ? 'QUICK_WAP_WAY' : 'FAST_INSTANT_TRADE_PAY';
const appAuthToken = process.env.AP_APP_AUTH_TOKEN || process.env.ALIPAY_APP_AUTH_TOKEN;

async function createAlipayPageLink({ outTradeNo, amount, userId, returnUrl, notifyUrl }) {
  const bizParams = {
    bizContent: {
      outTradeNo,
      productCode: alipayProductCode,
      totalAmount: Number(amount).toFixed(2),
      subject: `KK Studio 积分充值 ¥${amount}`,
      body: `KK Studio 积分充值 ¥${amount}`,
      passbackParams: encodeURIComponent(String(userId)),
    },
    returnUrl,
    notifyUrl,
  };
  if (appAuthToken) {
    bizParams.appAuthToken = appAuthToken;
  }

  try {
    const link = await alipaySdk.pageExec(alipayTradeMethod, {
      method: 'GET',
      ...bizParams,
    });
    return sanitizePaymentUrl(link);
  } catch (error) {
    const msg = String(error?.message || '');
    if (
      msg.includes('formData 参数不包含文件') ||
      (msg.includes('formData') && msg.includes('pageExec'))
    ) {
      const link = await alipaySdk.pageExecute(alipayTradeMethod, 'GET', bizParams);
      return sanitizePaymentUrl(link);
    }
    throw error;
  }
}

async function creditUserIfNeeded({ outTradeNo, userId, totalAmount }) {
  if (!userId || creditedOrders.has(outTradeNo)) return;
  creditedOrders.add(outTradeNo);

  let amountToAdd = 5000;
  if (totalAmount) {
    amountToAdd = Math.round(parseFloat(totalAmount) * 100);
  }

  console.log(`[payment-server] Accredit user ${userId} for order ${outTradeNo} with ${amountToAdd} credits.`);
  const { error: rpcError } = await supabase.rpc('increment_credits', {
    user_id: userId,
    amount: amountToAdd,
  });

  if (rpcError) {
    const { data: profile } = await supabase.from('profiles').select('credits').eq('id', userId).single();
    if (profile) {
      await supabase.from('profiles').update({ credits: (profile.credits || 0) + amountToAdd }).eq('id', userId);
    }
  }
}

app.get('/api/v1/user/nickname', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.json({ nickname: '用户' });
  const nickname = String(email).split('@')[0] || '用户';
  return res.json({ nickname });
});

app.get('/api/pay/qrcode', async (req, res) => {
  try {
    const { method, userId, amount } = req.query;
    if (!userId || !amount) {
      return res.status(400).json({ error: '缺少必要参数: userId, amount' });
    }
    if (method !== 'alipay') {
      return res.status(400).json({ error: '当前仅支持支付宝' });
    }

    const outTradeNo = `ORDER_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const returnUrl = process.env.PAYMENT_RETURN_URL || process.env.AP_RETURN_URL || 'https://kkai.plus/pay/success';
    const notifyUrl =
      process.env.PAYMENT_NOTIFY_URL || process.env.AP_NOTIFY_URL || 'https://kkai.plus/api/pay/notify/alipay';

    const payLink = await createAlipayPageLink({
      outTradeNo,
      amount,
      userId,
      returnUrl,
      notifyUrl,
    });

    if (!/^https?:\/\//i.test(payLink)) {
      return res.status(500).json({ error: '支付链接生成失败' });
    }

    return res.json({ qrCode: payLink, outTradeNo, isWebLink: true });
  } catch (err) {
    console.error('[payment-server] create qrcode failed:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

app.get('/api/pay', async (req, res) => {
  try {
    const { method, userId, amount } = req.query;
    if (!userId || !amount) {
      return res.status(400).send('缺少必要参数: userId, amount');
    }
    if (method !== 'alipay') {
      return res.status(400).send('当前仅支持支付宝');
    }

    const outTradeNo = `ORDER_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const returnUrl = process.env.PAYMENT_RETURN_URL || process.env.AP_RETURN_URL || 'https://kkai.plus/pay/success';
    const notifyUrl =
      process.env.PAYMENT_NOTIFY_URL || process.env.AP_NOTIFY_URL || 'https://kkai.plus/api/pay/notify/alipay';

    const payLink = await createAlipayPageLink({
      outTradeNo,
      amount,
      userId,
      returnUrl,
      notifyUrl,
    });

    if (!/^https?:\/\//i.test(payLink)) {
      return res.status(500).send('支付链接生成失败');
    }
    return res.redirect(302, payLink);
  } catch (err) {
    console.error('[payment-server] create pay redirect failed:', err);
    return res.status(500).send(err.message || String(err));
  }
});

app.get('/api/pay/status', async (req, res) => {
  try {
    const { outTradeNo, userId } = req.query;
    if (!outTradeNo) {
      return res.status(400).json({ error: '缺少商户订单号' });
    }

    if (!alipaySdk) {
      return res.status(500).json({ error: '未配置可用的支付状态查询方式' });
    }

    const queryParams = {
      bizContent: { outTradeNo },
    };
    if (appAuthToken) {
      queryParams.appAuthToken = appAuthToken;
    }
    const result = await alipaySdk.exec('alipay.trade.query', queryParams);

    let tradeStatus = 'WAITING';
    if (result.tradeStatus === 'TRADE_SUCCESS' || result.tradeStatus === 'TRADE_FINISHED') {
      tradeStatus = 'TRADE_SUCCESS';
      await creditUserIfNeeded({ outTradeNo, userId, totalAmount: result.totalAmount });
    } else if (result.tradeStatus === 'TRADE_CLOSED') {
      tradeStatus = 'TRADE_CLOSED';
    }

    return res.json({ tradeStatus, details: result });
  } catch (err) {
    console.error('[payment-server] query status failed:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, () => {
  console.log(`[payment-server] running on :${PORT}`);
});
