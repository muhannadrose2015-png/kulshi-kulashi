/* ==========================================
   Cloudflare Function - استهلاك نقطة من الحد الأسبوعي
   المسار: /api/consume-quota
   Body: { userId, orderCode }
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
    const { userId, orderCode } = body;

    if (!userId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'userId مفقود'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const quotaKey = `quota:${userId}`;
    const premiumKey = `premium:${userId}`;
    const usedKey = `used_orders:${userId}`;

    const { weekStart } = getWeekRange();

    // فحص الاشتراك
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

    // جلب حد النشر
    let weeklyLimit = 7;
    try {
      const settingsFile = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/data/settings.json`;
      const settingsRes = await fetch(settingsFile, {
        headers: {
          'Authorization': `token ${env.GITHUB_TOKEN}`,
          'User-Agent': 'Kulshi-Kulashi',
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        const settings = JSON.parse(
          decodeURIComponent(escape(atob(settingsData.content.replace(/\n/g, ''))))
        );
        if (settings.weeklyLimit) weeklyLimit = Number(settings.weeklyLimit);
      }
    } catch (e) {}

    // جلب الحصة
    const quotaRaw = await env.VIEWS_KV.get(quotaKey);
    let quota = quotaRaw ? JSON.parse(quotaRaw) : null;

    if (!quota || quota.weekStart !== weekStart) {
      quota = {
        weekStart: weekStart,
        count: 0,
        updatedAt: new Date().toISOString()
      };
    }

    // الفحص
    if (!isPremium && quota.count >= weeklyLimit) {
      return new Response(JSON.stringify({
        success: false,
        error: `وصلت للحد الأسبوعي (${weeklyLimit} إعلانات)`,
        quota: quota,
        isPremium: false
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // الاستهلاك
    quota.count += 1;
    quota.updatedAt = new Date().toISOString();

    await env.VIEWS_KV.put(quotaKey, JSON.stringify(quota), {
      expirationTtl: 60 * 60 * 24 * 30
    });

    // تسجيل الإعلان
    if (orderCode) {
      const usedRaw = await env.VIEWS_KV.get(usedKey);
      let usedList = usedRaw ? JSON.parse(usedRaw) : { weekStart: weekStart, codes: [] };

      if (usedList.weekStart !== weekStart) {
        usedList = { weekStart: weekStart, codes: [] };
      }

      if (!usedList.codes.includes(orderCode)) {
        usedList.codes.push(orderCode);
      }

      await env.VIEWS_KV.put(usedKey, JSON.stringify(usedList), {
        expirationTtl: 60 * 60 * 24 * 60
      });
    }

    return new Response(JSON.stringify({
      success: true,
      used: quota.count,
      limit: isPremium ? null : weeklyLimit,
      remaining: isPremium ? 'unlimited' : Math.max(0, weeklyLimit - quota.count),
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
