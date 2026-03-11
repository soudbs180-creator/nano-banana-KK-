/**
 * OAuth 回调处理页面
 * 处理 Google/GitHub 等第三方登录后的回调
 */

import { useEffect, useState } from 'react';
// 使用原生导航，不使用 react-router-dom
import { supabase } from '@/lib/supabase';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

export default function AuthCallback() {
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('正在处理登录...');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // 从 URL 获取 code 参数
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const error = params.get('error');
        const errorDescription = params.get('error_description');

        // 处理错误
        if (error) {
          setStatus('error');
          setMessage(errorDescription || '登录失败，请重试');
          setTimeout(() => window.location.href = '/', 3000);
          return;
        }

        if (!code) {
          setStatus('error');
          setMessage('无效的登录链接');
          setTimeout(() => window.location.href = '/', 3000);
          return;
        }

        // 等待 Supabase 自动处理会话
        // Supabase 客户端会自动处理 code 交换
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (session) {
          setStatus('success');
          setMessage('登录成功！');
          // 跳转到首页或之前的页面
          setTimeout(() => window.location.href = '/', 1000);
        } else {
          // 如果没有 session，可能是需要等待一下
          setTimeout(async () => {
            const { data: { session: retrySession } } = await supabase.auth.getSession();
            if (retrySession) {
              setStatus('success');
              setMessage('登录成功！');
              setTimeout(() => window.location.href = '/', 1000);
            } else {
              setStatus('error');
              setMessage('登录会话创建失败');
              setTimeout(() => window.location.href = '/', 3000);
            }
          }, 1500);
        }
      } catch (err) {
        console.error('OAuth callback error:', err);
        setStatus('error');
        setMessage('登录处理出错，请重试');
        setTimeout(() => window.location.href = '/', 3000);
      }
    };

    handleCallback();
  }, []);

  return (
    <div className="min-h-screen bg-[#07111f] flex items-center justify-center">
      <div className="text-center">
        {status === 'processing' && (
          <>
            <Loader2 size={48} className="animate-spin text-blue-400 mx-auto mb-4" />
            <p className="text-white text-lg">{message}</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle2 size={48} className="text-green-400 mx-auto mb-4" />
            <p className="text-white text-lg">{message}</p>
            <p className="text-gray-400 text-sm mt-2">正在跳转...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle size={48} className="text-red-400 mx-auto mb-4" />
            <p className="text-white text-lg">{message}</p>
            <p className="text-gray-400 text-sm mt-2">即将返回登录页...</p>
          </>
        )}
      </div>
    </div>
  );
}
