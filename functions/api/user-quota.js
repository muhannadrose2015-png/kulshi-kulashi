/* ==========================================
   Cloudflare Function - إدارة الحد الأسبوعي
   المسار: /api/user-quota?userId=xxx
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
    const userId = url.searchParams.get('userId');

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

    // حساب بداية الأسبوع
    const { weekStart, weekEnd } = getWeekRange();

    // جلب الحصة
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
        expirationTtl: 60 * 60 * 24 * 30
      });
    }

    // جلب حالة الاشتراك
    const premiumRaw = await env.VIEWS_KV.get(premiumKey);
    let premium = null;
    if (premiumRaw) {
      try {
        const p = JSON.parse(premiumRaw);
        if (p.until && new Date(p.until) > new Date()) {
          premium = p;
        } else {
          await env.VIEWS_KV.delete(premiumKey);
        }
      } catch (e) {}
    }

    const isPremium = !!premium;

    // جلب حد النشر من الإعدادات
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
    } catch (e) {
      console.error('Settings read error:', e);
    }

    return new Response(JSON.stringify({
      success: true,
      weekStart: weekStart,
      weekEnd: weekEnd,
      used: quota.count,
      limit: isPremium ? null : weeklyLimit,
      remaining: isPremium ? 'unlimited' : Math.max(0, weeklyLimit - quota.count),
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
  const now = new Date();
  const baghdadOffset = 3 * 60;
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const baghdadMinutes = utcMinutes + baghdadOffset;
  const dayOffset = Math.floor(baghdadMinutes / (24 * 60));

  const baghdadDate = new Date(now);
  baghdadDate.setUTCMinutes(baghdadDate.getUTCMinutes() + baghdadOffset);

  const dayOfWeek = baghdadDate.getUTCDay();

  const start = new Date(baghdadDate);
  start.setUTCDate(start.getUTCDate() - dayOfWeek);
  start.setUTCHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);

  start.setUTCMinutes(start.getUTCMinutes() - baghdadOffset);
  end.setUTCMinutes(end.getUTCMinutes() - baghdadOffset);

  const weekStart = start.toISOString().split('T')[0];
  const weekEnd = end.toISOString().split('T')[0];

  return { weekStart, weekEnd };
}
