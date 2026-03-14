require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const { AlipaySdk } = require('alipay-sdk');

const router = express.Router();

function formatKey(key, type) {
    const raw = String(key || '').trim();
    if (!raw) return '';
    if (raw.includes('-----BEGIN')) return raw;
    const chunks = raw.match(/.{1,64}/g) || [];
    return `-----BEGIN ${type}-----\n${chunks.join('\n')}\n-----END ${type}-----`;
}

// Keep this Alipay configuration aligned with payment-server/index.js.
const alipaySdk = new AlipaySdk({
    appId: process.env.AP_APP_ID || process.env.ALIPAY_APP_ID,
    privateKey: formatKey(process.env.AP_APP_KEY || process.env.ALIPAY_PRIVATE_KEY, 'PRIVATE KEY'),
    keyType: 'PKCS8',
    alipayPublicKey: formatKey(process.env.AP_PUB_KEY || process.env.ALIPAY_PUBLIC_KEY, 'PUBLIC KEY'),
    encryptKey: process.env.AP_ENCRYPT_KEY || process.env.ALIPAY_ENCRYPT_KEY,
    gateway:
        String(process.env.AP_CURRENT_ENV || '').toLowerCase() === 'sandbox'
            ? 'https://openapi-sandbox.dl.alipaydev.com/gateway.do'
            : 'https://openapi.alipay.com/gateway.do'
});

// ============================================
// Core recharge helper
// ============================================
async function addCreditsToSupabase(userId, transactionId, amount, currency) {
    const creditsAdded = Math.floor(amount * 5);

    console.log(
        `[payment-webhook] Crediting user ${userId} with ${creditsAdded} credits from ${currency} ${amount}`
    );

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseSecretKey) {
        console.error(
            '[payment-webhook] Missing Supabase config. Please set SUPABASE_URL and SUPABASE_SECRET_KEY.'
        );
        return false;
    }

    try {
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/process_payment_recharge`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${supabaseSecretKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                p_user_id: userId,
                p_transaction_id: transactionId,
                p_amount: amount,
                p_currency: currency,
                p_credits_added: creditsAdded
            })
        });

        const result = await response.json();

        if (!response.ok) {
            console.error('[payment-webhook] Supabase recharge RPC failed:', result);
            return false;
        }

        console.log('[payment-webhook] Recharge RPC succeeded:', result);
        return true;
    } catch (error) {
        console.error('[payment-webhook] Supabase request failed:', error);
        return false;
    }
}

// ============================================
// 1. Alipay webhook
// ============================================
router.post('/alipay', async (req, res) => {
    const postData = req.body;

    console.log('[payment-webhook] Received Alipay notify:', postData);

    try {
        const isValid = alipaySdk.checkNotifySign(postData);

        if (!isValid) {
            console.error('[payment-webhook] Invalid Alipay signature.');
            return res.status(400).send('failure');
        }

        const tradeStatus = postData.trade_status;
        const outTradeNo = postData.out_trade_no;
        const totalAmount = postData.total_amount;
        const alipayTradeNo = postData.trade_no;
        const userId = decodeURIComponent(postData.passback_params || '');

        if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
            if (!userId) {
                console.error('[payment-webhook] Missing userId in Alipay webhook:', outTradeNo);
                return res.send('success');
            }

            const rechargeSuccess = await addCreditsToSupabase(
                userId,
                alipayTradeNo,
                Number(totalAmount),
                'CNY'
            );

            if (rechargeSuccess) {
                return res.send('success');
            }

            return res.status(500).send('database error');
        }

        return res.send('success');
    } catch (error) {
        console.error('[payment-webhook] Failed to process Alipay webhook:', error);
        res.status(500).send('failure');
    }
});

// ============================================
// 2. WeChat Pay webhook
// ============================================
router.post('/wechat', async (req, res) => {
    console.log('[payment-webhook] Received WeChat Pay notify');

    // Skip verification in development if WeChat V3 key is not configured.
    if (!process.env.WECHATPAY_API_V3_KEY) {
        return res.status(200).json({ code: 'SUCCESS', message: '开发模式忽略验签' });
    }

    try {
        const { WxPay } = require('wechatpay-node-v3');
        const wxpay = new WxPay({
            appid: process.env.WECHATPAY_APPID,
            mchid: process.env.WECHATPAY_MCHID,
            publicKey: Buffer.from(process.env.WECHATPAY_PUBLIC_CERT || 'public-key', 'utf-8'),
            privateKey: Buffer.from(process.env.WECHATPAY_PRIVATE_KEY || 'private-key', 'utf-8'),
        });

        const signature = req.headers['wechatpay-signature'];
        const timestamp = req.headers['wechatpay-timestamp'];
        const nonce = req.headers['wechatpay-nonce'];

        // Express usually gives us parsed JSON, so convert it back to a string before verifySign.
        const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

        const isValid = wxpay.verifySign({
            body: bodyStr,
            signature,
            timestamp,
            nonce,
            serial: req.headers['wechatpay-serial']
        });

        if (!isValid) {
            console.error('[payment-webhook] WeChat signature verification failed.');
            return res.status(401).json({ code: 'FAIL', message: '验签失败' });
        }

        const resource = req.body.resource;
        const decryptData = wxpay.decipher_gcm(
            resource.ciphertext,
            resource.associated_data,
            resource.nonce,
            process.env.WECHATPAY_API_V3_KEY
        );

        if (decryptData.trade_state === 'SUCCESS') {
            const outTradeNo = decryptData.out_trade_no;
            const amount = decryptData.amount.total / 100;
            const userId = decodeURIComponent(decryptData.attach || '');
            const transactionId = decryptData.transaction_id;

            if (userId) {
                const rechargeSuccess = await addCreditsToSupabase(userId, transactionId, amount, 'CNY');
                if (rechargeSuccess) {
                    return res.status(200).json({ code: 'SUCCESS', message: '成功' });
                }

                return res.status(500).json({ code: 'FAIL', message: '数据库加币失败' });
            }

            console.error('[payment-webhook] Missing attach userId in WeChat webhook:', outTradeNo);
        }

        res.status(200).json({ code: 'SUCCESS', message: '成功' });
    } catch (error) {
        console.error('[payment-webhook] Failed to process WeChat webhook:', error);
        res.status(500).json({ code: 'FAIL', message: '内部错误' });
    }
});

module.exports = router;
