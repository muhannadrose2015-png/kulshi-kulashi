/* Cloudflare Function - /api/status */

export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // GET - فحص الحالة
  if (request.method === 'GET') {
    const result = {
      telegram: 'unknown',
      github: 'unknown',
      timestamp: new Date().toISOString()
    };

    try {
      if (env.TELEGRAM_BOT_TOKEN) {
        const tgResponse = await fetch(
          `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`
        );
        const tgData = await tgResponse.json();
        result.telegram = tgData.ok ? 'ok' : 'error';
        if (tgData.ok) result.botName = tgData.result.username;
      } else {
        result.telegram = 'no_token';
      }
    } catch (e) {
      result.telegram = 'error';
    }

    try {
      if (env.GITHUB_TOKEN && env.GITHUB_REPO) {
        const ghResponse = await fetch(
          `https://api.github.com/repos/${env.GITHUB_REPO}`,
          {
            headers: {
              'Authorization': `token ${env.GITHUB_TOKEN}`,
              'User-Agent': 'Kulshi-Kulashi',
              'Accept': 'application/vnd.github.v3+json'
            }
          }
        );
        result.github = ghResponse.ok ? 'ok' : 'error';
      } else {
        result.github = 'no_token';
      }
    } catch (e) {
      result.github = 'error';
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // POST - اختبار إرسال
  if (request.method === 'POST') {
    try {
      const body = await request.json();

      if (body.action === 'test') {
        if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
          return new Response(JSON.stringify({
            success: false,
            error: 'لم يتم إعداد متغيرات تليجرام في Cloudflare'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const message = body.message || 'رسالة تجريبية';

        const tgResponse = await fetch(
          `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: env.TELEGRAM_CHAT_ID,
              text: message,
              parse_mode: 'HTML'
            })
          }
        );

        const tgData = await tgResponse.json();

        return new Response(JSON.stringify({
          success: tgData.ok,
          error: tgData.ok ? null : tgData.description
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        success: false, error: 'إجراء غير معروف'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (e) {
      return new Response(JSON.stringify({
        success: false, error: e.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response('Method not allowed', { status: 405 });
}
