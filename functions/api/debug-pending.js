/* ==========================================
   Cloudflare Function - فحص الإعلانات المعلقة (مؤقت)
   المسار: /api/debug-pending?secret=XXX
   ⚠️ هذا الملف مؤقت - يجب حذفه بعد التشخيص
   ========================================== */

export async function onRequest(context) {
  const { request, env } = context;

  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');

  if (!env.SYNC_SECRET || secret !== env.SYNC_SECRET) {
    return new Response(JSON.stringify({
      success: false,
      error: 'غير مصرح'
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    if (!env.VIEWS_KV) {
      return new Response(JSON.stringify({
        success: false,
        error: 'KV غير مربوط'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const listResult = await env.VIEWS_KV.list({ prefix: 'pending_ad:' });
    const now = new Date();

    const details = [];

    for (const key of listResult.keys) {
      const raw = await env.VIEWS_KV.get(key.name);
      if (!raw) continue;

      try {
        const data = JSON.parse(raw);
        const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;

        let status = 'unknown';
        let remainingMinutes = null;

        if (!expiresAt || isNaN(expiresAt.getTime())) {
          status = 'invalid-expires';
        } else if (expiresAt <= now) {
          status = 'ready';
        } else {
          status = 'waiting';
          remainingMinutes = Math.round((expiresAt - now) / 60000);
        }

        details.push({
          key: key.name,
          orderCode: data.orderCode,
          title: data.title,
          createdAt: data.createdAt,
          expiresAt: data.expiresAt,
          waitMinutes: data.waitMinutes,
          isFeatured: data.isFeatured,
          status: status,
          remainingMinutes: remainingMinutes
        });
      } catch (e) {
        details.push({
          key: key.name,
          error: 'فشل التحليل: ' + e.message
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      currentTime: now.toISOString(),
      pendingCount: listResult.keys.length,
      details: details
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      error: e.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
