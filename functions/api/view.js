/* ==========================================
   Cloudflare Function - تسجيل مشاهدة إعلان
   المسار: /api/view
   يستخدم KV: VIEWS_KV
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
        error: 'KV غير مربوط'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const productId = body.productId;

    if (!productId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'معرّف الإعلان مفقود'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // قراءة القيمة الحالية
    const key = `view:${productId}`;
    const currentRaw = await env.VIEWS_KV.get(key);
    const current = currentRaw ? parseInt(currentRaw, 10) : 0;
    const newCount = current + 1;

    // حفظ القيمة الجديدة (بدون expiry - نحتفظ بها دائماً)
    await env.VIEWS_KV.put(key, String(newCount));

    return new Response(JSON.stringify({
      success: true,
      count: newCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('View error:', e);
    return new Response(JSON.stringify({
      success: false,
      error: 'خطأ داخلي: ' + e.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
