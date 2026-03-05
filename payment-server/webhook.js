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

// 请注意：一定要保持配置一致
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
// [核心] 往 Supabase 充值分的内部通用调用函数
// ============================================
async function addCreditsToSupabase(userId, transactionId, amount, currency) {
    // 假设换算率 1 元 = 5 积分，可根据业务自己调
    const creditsAdded = Math.floor(amount * 5);

    console.log(`准备向账户 ${userId} 加充 ${creditsAdded} 积分 (来自 ${currency} ${amount})`);

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseSecretKey) {
        console.error('[错误] 缺少 Supabase 配置。请设置 SUPABASE_URL 和 SUPABASE_SECRET_KEY 环境变量');
        return false;
    }

    try {
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/process_payment_recharge`, {
            method: 'POST',
            headers: {
                // 这个是你为了防重放特意准备的一次性或专属密钥
                'Authorization': `Bearer ${supabaseSecretKey}`,
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
            console.error('Supabase 充值防并发过程报错:', result);
            return false;
        }

        console.log(`[成功] 充值已进入数据库! 事务返回:`, result);
        return true;

    } catch (e) {
        console.error('请求 Supabase 发生致命错误:', e);
        return false;
    }
}


// ============================================
// 1. 支付宝异步通知 Webhook
// ============================================
router.post('/alipay', async (req, res) => {
    // 支付宝 POST 这里的数据 Content-Type 是 application/x-www-form-urlencoded
    const postData = req.body;

    console.log('收到支付宝回调通知:', postData);

    try {
        // 第一步：务必验证签名，确保这真的是支付宝发来的，不是黑客伪造的！
        const isValid = alipaySdk.checkNotifySign(postData);

        if (!isValid) {
            console.error('支付宝回调验签失败，可能存在非法请求');
            return res.status(400).send('failure');
        }

        // 第二步：判断交易状态
        const tradeStatus = postData.trade_status;
        const outTradeNo = postData.out_trade_no;
        const totalAmount = postData.total_amount;
        const alipayTradeNo = postData.trade_no;

        // 这里是通过 passback_params 原样传回来的 userId，记得 decode
        const userId = decodeURIComponent(postData.passback_params || '');

        if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
            if (!userId) {
                console.error('严重错误：支付宝回调中缺失 User ID', outTradeNo);
                return res.send('success'); // 依然必须返回 success 否则支付宝会无限重试
            }

            // 核心金额加成
            const rechargeSuccess = await addCreditsToSupabase(userId, alipayTradeNo, Number(totalAmount), 'CNY');

            if (rechargeSuccess) {
                // 必须严格回写 success 这7个字符！千万不要带回车空格
                return res.send('success');
            } else {
                // 连写库失败了，故意不响 success，让支付宝等会接着重推
                return res.status(500).send('database error');
            }
        } else {
            // 其他状态，也回复 success (防止一直重复发无用信息)
            return res.send('success');
        }

    } catch (error) {
        console.error('处理支付宝回调抛出异常:', error);
        res.status(500).send('failure');
    }
});


// ============================================
// 2. 微信异步通知 Webhook (待填空)
// ============================================
router.post('/wechat', async (req, res) => {
    console.log('收到来自微信支付的回调通知');

    // 如果没有配置微信证书，说明没有正式上线微信支付，为了防止报错，直接放行
    if (!process.env.WECHATPAY_API_V3_KEY) {
        return res.status(200).json({ code: 'SUCCESS', message: '开发模式忽略验签' });
    }

    try {
        const { WxPay } = require('wechatpay-node-v3');
        const wxpay = new WxPay({
            appid: process.env.WECHATPAY_APPID,
            mchid: process.env.WECHATPAY_MCHID,
            publicKey: Buffer.from(process.env.WECHATPAY_PUBLIC_CERT || '公钥', 'utf-8'),
            privateKey: Buffer.from(process.env.WECHATPAY_PRIVATE_KEY || '私钥', 'utf-8'),
        });

        // 验证签名
        const signature = req.headers['wechatpay-signature'];
        const timestamp = req.headers['wechatpay-timestamp'];
        const nonce = req.headers['wechatpay-nonce'];
        // 我们需要把 express json 取到的 body 转成 buffer 来验签，如果没配置 express raw 中间件可能会出错
        // 考虑到兼容性这里如果 body 是对象，就先转回 string
        const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

        const isValid = wxpay.verifySign({
            body: bodyStr,
            signature,
            timestamp,
            nonce,
            serial: req.headers['wechatpay-serial']
        });

        if (!isValid) {
            console.error('微信回调验签失败');
            return res.status(401).json({ code: 'FAIL', message: '验签失败' });
        }

        // 解密 resource
        const resource = req.body.resource;
        const decryptData = wxpay.decipher_gcm(
            resource.ciphertext,
            resource.associated_data,
            resource.nonce,
            process.env.WECHATPAY_API_V3_KEY
        );

        if (decryptData.trade_state === 'SUCCESS') {
            const outTradeNo = decryptData.out_trade_no;
            const amount = decryptData.amount.total / 100; // 微信分转元
            const userId = decodeURIComponent(decryptData.attach || ''); // 商户数据包里存的 UserId
            const transactionId = decryptData.transaction_id;

            if (userId) {
                const rechargeSuccess = await addCreditsToSupabase(userId, transactionId, amount, 'CNY');
                if (rechargeSuccess) {
                    return res.status(200).json({ code: 'SUCCESS', message: '成功' });
                } else {
                    return res.status(500).json({ code: 'FAIL', message: '数据库加钱失败' });
                }
            } else {
                console.error('微信回调中没有获取到 attach 用户归属信息:', outTradeNo);
            }
        }

        res.status(200).json({ code: 'SUCCESS', message: '成功' });

    } catch (err) {
        console.error('处理微信通知报错:', err);
        res.status(500).json({ code: 'FAIL', message: '内部错误' });
    }
});


module.exports = router;
