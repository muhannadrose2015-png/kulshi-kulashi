/* ==========================================
   Cloudflare Function - استهلاك نقطة من الحد الأسبوعي
   المسار: /api/consume-quota
   Body: { phone, orderCode }
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
    const { phone, orderCode } = body;

    if (!phone) {
      return new Response(JSON.stringify({
        success: false,
        error: 'رقم الهاتف مفقود'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const phoneHash = await hashString(phone);
    const quotaKey = `quota:${phoneHash}`;
    const premiumKey = `premium:${phoneHash}`;
    const usedKey = `used_orders:${phoneHash}`;

    // حساب بداية الأسبوع
    const { weekStart } = getWeekRange();

    // فحص حالة الاشتراك
    const premiumRaw = await env.VIEWS_KV.get(premiumKey);
    let isPremium = false;
    if (premiumRaw) {
      try {
        const p = JSON.parse(premiumRaw);
        if (p.until && new Date(p.until) > new Date()) {
          isPremium = true;
        }
      } catch (e) {}
    }

    // جلب الحصة الحالية
    const quotaRaw = await env.VIEWS_KV.get(quotaKey);
    let quota = quotaRaw ? JSON.parse(quotaRaw) : null;

    // إذا لم تكن هناك حصة أو مضى الأسبوع → إعادة تعيين
    if (!quota || quota.weekStart !== weekStart) {
      quota = {
        weekStart: weekStart,
        count: 0,
        updatedAt: new Date().toISOString()
      };
    }

    // ===== الفحص =====
    if (!isPremium && quota.count >= 7) {
      return new Response(JSON.stringify({
        success: false,
        error: 'وصلت للحد الأسبوعي (7 إعلانات)',
        quota: quota,
        isPremium: false
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ===== الاستهلاك =====
    quota.count += 1;
    quota.updatedAt = new Date().toISOString();

    // حفظ الحصة الجديدة
    await env.VIEWS_KV.put(quotaKey, JSON.stringify(quota), {
      expirationTtl: 60 * 60 * 24 * 30
    });

    // ===== تسجيل الإعلان في قائمة "المستخدمة" =====
    // (حتى لو حذفه لاحقاً، يبقى محسوباً)
    if (orderCode) {
      const usedRaw = await env.VIEWS_KV.get(usedKey);
      let usedList = usedRaw ? JSON.parse(usedRaw) : { weekStart: weekStart, codes: [] };

      // إذا مضى الأسبوع → إعادة تعيين
      if (usedList.weekStart !== weekStart) {
        usedList = { weekStart: weekStart, codes: [] };
      }

      if (!usedList.codes.includes(orderCode)) {
        usedList.codes.push(orderCode);
      }

      await env.VIEWS_KV.put(usedKey, JSON.stringify(usedList), {
        expirationTtl: 60 * 60 * 24 * 60 // 60 يوماً
      });
    }

    return new Response(JSON.stringify({
      success: true,
      used: quota.count,
      limit: isPremium ? null : 7,
      remaining: isPremium ? 'unlimited' : Math.max(0, 7 - quota.count),
      isPremium: isPremium,
      weekStart: weekStart
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Consume quota error:', e);
    return new Response(JSON.stringify({
      success: false,
      error: 'خطأ داخلي: ' + e.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/* ===== حساب بداية الأسبوع ===== */
function getWeekRange() {
  const now = new Date();
  const baghdadOffset = 3 * 60;
  const baghdadDate = new Date(now);
  baghdadDate.setUTCMinutes(baghdadDate.getUTCMinutes() + baghdadOffset);

  const dayOfWeek = baghdadDate.getUTCDay();

  const start = new Date(baghdadDate);
  start.setUTCDate(start.getUTCDate() - dayOfWeek);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCMinutes(start.getUTCMinutes() - baghdadOffset);

  const weekStart = start.toISOString().split('T')[0];
  return { weekStart };
}

/* ===== Hash ===== */
async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str + 'kulshi_quota_salt_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}
