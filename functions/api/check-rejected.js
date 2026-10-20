/* ==========================================
   Cloudflare Function - فحص الإعلانات المرفوضة
   المسار: /api/check-rejected
   Body: { orderCodes: ["KK-2026-0001", ...] }
   ========================================== */

export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({
      success: false,
      error: 'POST فقط مدعوم'
    }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    if (!env.VIEWS_KV) {
      return new Response(JSON.stringify({
        success: false,
        rejected: [],
        error: 'KV غير مربوط'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { orderCodes } = body;

    if (!orderCodes || !Array.isArray(orderCodes)) {
      return new Response(JSON.stringify({
        success: false,
        rejected: [],
        error: 'orderCodes مطلوب (مصفوفة)'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const rejected = [];

    for (const orderCode of orderCodes) {
      try {
        const rejectedKey = `rejected_ad:${orderCode}`;
        const data = await env.VIEWS_KV.get(rejectedKey);

        if (data) {
          const parsed = JSON.parse(data);
          rejected.push({
            orderCode: orderCode,
            title: parsed.title,
            rejectedAt: parsed.rejectedAt,
            reason: parsed.reason
          });
        }
      } catch (e) {
        console.error('Check rejected error:', orderCode, e);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      rejected: rejected
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Check rejected error:', e);
    return new Response(JSON.stringify({
      success: false,
      rejected: [],
      error: 'خطأ داخلي: ' + e.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
