/* ==========================================
   Cloudflare Function - إدارة الحد الأسبوعي والنقاط
   المسار: /api/user-quota?phone=xxx
   ========================================== */

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

    const url = new URL(request.url);
    const phone = url.searchParams.get('phone');

    if (!phone) {
      return new Response(JSON.stringify({
        success: false,
        error: 'رقم الهاتف مفقود'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Hash للهاتف
    const phoneHash = await hashString(phone);
    const quotaKey = `quota:${phoneHash}`;
    const premiumKey = `premium:${phoneHash}`;

    // حساب بداية الأسبوع (الأحد 00:00 بتوقيت بغداد)
    const { weekStart, weekEnd } = getWeekRange();

    // جلب بيانات الحصة
    const quotaRaw = await env.VIEWS_KV.get(quotaKey);
    let quota = quotaRaw ? JSON.parse(quotaRaw) : null;

    // إذا لم تكن هناك حصة أو مضى الأسبوع → إعادة تعيين
    if (!quota || quota.weekStart !== weekStart) {
      quota = {
        weekStart: weekStart,
        count: 0,
        updatedAt: new Date().toISOString()
      };
      await env.VIEWS_KV.put(quotaKey, JSON.stringify(quota), {
        expirationTtl: 60 * 60 * 24 * 30 // 30 يوماً
      });
    }

    // جلب حالة الاشتراك المدفوع
    const premiumRaw = await env.VIEWS_KV.get(premiumKey);
    let premium = null;
    if (premiumRaw) {
      try {
        const p = JSON.parse(premiumRaw);
        if (p.until && new Date(p.until) > new Date()) {
          premium = p;
        } else {
          // انتهى الاشتراك → نحذفه
          await env.VIEWS_KV.delete(premiumKey);
        }
      } catch (e) {}
    }

    const isPremium = !!premium;
    const limit = isPremium ? null : 7; // null = بلا حدود

    return new Response(JSON.stringify({
      success: true,
      weekStart: weekStart,
      weekEnd: weekEnd,
      used: quota.count,
      limit: limit,
      remaining: isPremium ? 'unlimited' : Math.max(0, 7 - quota.count),
      isPremium: isPremium,
      premiumUntil: premium ? premium.until : null
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Quota error:', e);
    return new Response(JSON.stringify({
      success: false,
      error: 'خطأ داخلي: ' + e.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/* ===== حساب بداية ونهاية الأسبوع ===== */
function getWeekRange() {
  // الوقت بتوقيت بغداد (UTC+3)
  const now = new Date();
  const baghdadOffset = 3 * 60; // دقائق
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const baghdadMinutes = utcMinutes + baghdadOffset;
  const dayOffset = Math.floor(baghdadMinutes / (24 * 60));

  // تاريخ بغداد
  const baghdadDate = new Date(now);
  baghdadDate.setUTCMinutes(baghdadDate.getUTCMinutes() + baghdadOffset);

  const dayOfWeek = baghdadDate.getUTCDay(); // 0=أحد، 6=سبت

  // بداية الأسبوع = الأحد الماضي
  const start = new Date(baghdadDate);
  start.setUTCDate(start.getUTCDate() - dayOfWeek);
  start.setUTCHours(0, 0, 0, 0);

  // نهاية الأسبوع = السبت القادم
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);

  // تحويل للـ UTC للحفظ
  start.setUTCMinutes(start.getUTCMinutes() - baghdadOffset);
  end.setUTCMinutes(end.getUTCMinutes() - baghdadOffset);

  // صيغة التاريخ: YYYY-MM-DD
  const weekStart = start.toISOString().split('T')[0];
  const weekEnd = end.toISOString().split('T')[0];

  return { weekStart, weekEnd };
}

/* ===== Hash ===== */
async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str + 'kulshi_quota_salt_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}
