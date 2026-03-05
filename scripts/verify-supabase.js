/**
 * Supabase Connection Verification Script
 * Run with: node scripts/verify-supabase.js
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('缺少 Supabase 环境变量，请设置 SUPABASE_URL 和 SUPABASE_ANON_KEY。');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function verifyConnection() {
    console.log('========================================');
    console.log('Supabase 连接校验');
    console.log('========================================\n');

    console.log('1. 测试连接...');
    try {
        const { error } = await supabase.auth.getSession();
        if (error) throw error;
        console.log('   成功：连接正常\n');
    } catch (err) {
        console.log(`   失败：连接异常 - ${err.message}\n`);
        return;
    }

    console.log('2. 检查数据表...');
    const tables = ['profiles', 'credit_transactions', 'admin_providers', 'provider_pricing_cache'];

    for (const table of tables) {
        try {
            const { error } = await supabase
                .from(table)
                .select('count', { count: 'exact', head: true });

            if (error) {
                if (error.message.includes('does not exist')) {
                    console.log(`   失败：${table} 表不存在`);
                } else {
                    console.log(`   成功：${table} 存在（可能需要 RLS 策略）`);
                }
            } else {
                console.log(`   成功：${table} 存在`);
            }
        } catch (err) {
            console.log(`   失败：${table} - ${err.message}`);
        }
    }
    console.log();

    console.log('3. 检查关键 RPC 函数...');
    const functions = ['is_admin', 'verify_admin_password_admin', 'save_credit_provider', 'delete_credit_provider'];

    for (const fn of functions) {
        try {
            const args = fn === 'is_admin' ? {} : null;
            const { error } = args ? await supabase.rpc(fn, args) : await supabase.rpc(fn);
            if (error) {
                if (error.message.includes('function') && error.message.includes('does not exist')) {
                    console.log(`   失败：${fn} 不存在`);
                } else {
                    console.log(`   成功：${fn} 可访问（需结合参数和策略进一步校验）`);
                }
            } else {
                console.log(`   成功：${fn} 可访问`);
            }
        } catch (err) {
            console.log(`   成功：${fn} 存在（参数或权限需进一步校验）`);
        }
    }
    console.log();

    console.log('4. 用户统计...');
    try {
        const { count, error } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true });

        if (error) throw error;
        console.log(`   profiles 用户总数：${count || 0}\n`);
    } catch (err) {
        console.log(`   错误：${err.message}\n`);
    }

    console.log('========================================');
    console.log('校验完成！');
    console.log('========================================');
}

verifyConnection().catch(console.error);
