#!/usr/bin/env node
/** Simple connectivity health check for Gemini CN proxy */
(async () => {
  const base = (process.env.GEMINI_BASE_URL || 'https://gemini-api.cn').trim();
  const key = (process.env.GEMINI_API_KEY || '').trim();
  const modelsUrl = `${base}/v1beta/models?key=${encodeURIComponent(key)}`;
  const chatUrl = `${base}/v1/chat/completions`;

  try {
    const modelsResp = await fetch(modelsUrl, { method: 'GET', headers: { 'Accept': 'application/json' } });
    const modelsText = await modelsResp.text();
    console.log('[Health] Models URL', modelsResp.status, modelsText.substring(0, 400));
  } catch (e) {
    console.error('[Health] Models test failed:', e && e.message ? e.message : e);
  }

  try {
    const payload = {
      model: 'gemini-2.5-flash-image',
      stream: false,
      messages: [{ role: 'user', content: 'Ping' }]
    };
    const chatResp = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Use Bearer token if provided
        ...(key ? { 'Authorization': 'Bearer ' + key } : {})
      },
      body: JSON.stringify(payload)
    });
    const chatText = await chatResp.text();
    console.log('[Health] Chat Status', chatResp.status, chatText.substring(0, 400));
  } catch (e) {
    console.error('[Health] Chat test failed:', e && e.message ? e.message : e);
  }
})();
