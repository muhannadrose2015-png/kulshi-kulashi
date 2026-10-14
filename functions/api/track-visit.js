/* ==========================================
   Cloudflare Function - تسجيل زيارة
   المسار: /api/track-visit
   يسجّل زيارة جديدة (مع منع تكرار IP لمدة 24 ساعة)
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

    // الحصول على IP
    const ip = request.headers.get('CF-Connecting-IP') ||
               request.headers.get('X-Forwarded-For')?.split(',')[0] ||
               'unknown';

    // التاريخ الحالي (YYYY-MM-DD) بتوقيت بغداد
    const now = new Date();
    const baghdadDate = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const today = baghdadDate.toISOString().split('T')[0];

    // Hash للـ IP
    const ipHash = await hashString(ip);

    // مفاتيح KV
    const visitKey = `visit:${today}:${ipHash}`;
    const totalVisitorsKey = 'stats:total_visitors';
    const totalVisitsKey = 'stats:total_visits';
    const todayVisitorsKey = `stats:today_visitors:${today}`;
    const todayVisitsKey = `stats:today_visits:${today}`;

    // فحص هل زار اليوم؟
    const alreadyVisitedToday = await env.VIEWS_KV.get(visitKey);

    // ===== تحديث الزيارات الكلية =====
    const totalVisitsRaw = await env.VIEWS_KV.get(totalVisitsKey);
    const totalVisits = (parseInt(totalVisitsRaw) || 0) + 1;
    await env.VIEWS_KV.put(totalVisitsKey, String(totalVisits));

    // ===== تحديث زيارات اليوم =====
    const todayVisitsRaw = await env.VIEWS_KV.get(todayVisitsKey);
    const todayVisits = (parseInt(todayVisitsRaw) || 0) + 1;
    await env.VIEWS_KV.put(todayVisitsKey, String(todayVisits), {
      expirationTtl: 60 * 60 * 24 * 90 // 90 يوم
    });

    // ===== إذا زائر جديد اليوم =====
    let isNewVisitorToday = false;

    if (!alreadyVisitedToday) {
      isNewVisitorToday = true;

      // ضع علامة أنه زار اليوم (تنتهي بعد 24 ساعة)
      await env.VIEWS_KV.put(visitKey, '1', {
        expirationTtl: 60 * 60 * 24 // 24 ساعة
      });

      // تحديث الزوار الكلي
      const totalVisitorsRaw = await env.VIEWS_KV.get(totalVisitorsKey);
      const totalVisitors = (parseInt(totalVisitorsRaw) || 0) + 1;
      await env.VIEWS_KV.put(totalVisitorsKey, String(totalVisitors));

      // تحديث زوار اليوم
      const todayVisitorsRaw = await env.VIEWS_KV.get(todayVisitorsKey);
      const todayVisitors = (parseInt(todayVisitorsRaw) || 0) + 1;
      await env.VIEWS_KV.put(todayVisitorsKey, String(todayVisitors), {
        expirationTtl: 60 * 60 * 24 * 90
      });
    }

    return new Response(JSON.stringify({
      success: true,
      isNewVisitor: isNewVisitorToday,
      today: today
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Track visit error:', e);
    return new Response(JSON.stringify({
      success: false,
      error: 'خطأ داخلي: ' + e.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/* ===== Hash ===== */
async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str + 'kulshi_visits_salt_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}
