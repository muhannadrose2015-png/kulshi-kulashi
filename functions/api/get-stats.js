/* ==========================================
   Cloudflare Function - جلب الإحصائيات
   المسار: /api/get-stats?secret=XXX
   ========================================== */

export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');

  // ✅ نسمح بالوصول من الأدمن (بسر) أو من الرئيسية (بدون سر، فقط إذا مفعّل)
  const isAdmin = env.SYNC_SECRET && secret === env.SYNC_SECRET;

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

    // ===== جلب الإعدادات =====
    const config = await getStatsConfig(env);

    // ===== التحقق من الصلاحيات =====
    if (!isAdmin && !config.showToPublic) {
      // الزائر لا يملك صلاحية الرؤية
      return new Response(JSON.stringify({
        success: false,
        error: 'الإحصائيات غير معروضة للزوار حالياً',
        showToPublic: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ===== جلب الأرقام =====
    const now = new Date();
    const baghdadDate = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const today = baghdadDate.toISOString().split('T')[0];

    // الزوار الكلي
    const totalVisitorsRaw = await env.VIEWS_KV.get('stats:total_visitors');
    const totalVisitors = parseInt(totalVisitorsRaw) || 0;

    // المستخدمون
    const totalUsersRaw = await env.VIEWS_KV.get('stats:total_users');
    const totalUsers = parseInt(totalUsersRaw) || 0;

    // زوار اليوم
    const todayVisitorsRaw = await env.VIEWS_KV.get(`stats:today_visitors:${today}`);
    const todayVisitors = parseInt(todayVisitorsRaw) || 0;

    // زيارات اليوم
    const todayVisitsRaw = await env.VIEWS_KV.get(`stats:today_visits:${today}`);
    const todayVisits = parseInt(todayVisitsRaw) || 0;

    // زيارات الكلي
    const totalVisitsRaw = await env.VIEWS_KV.get('stats:total_visits');
    const totalVisits = parseInt(totalVisitsRaw) || 0;

    // عدد الإعلانات (من ads.json)
    let totalAds = 0;
    try {
      const repoFile = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/data/ads.json`;
      const res = await fetch(repoFile, {
        headers: {
          'Authorization': `token ${env.GITHUB_TOKEN}`,
          'User-Agent': 'Kulshi-Kulashi',
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      if (res.ok) {
        const data = await res.json();
        const ads = JSON.parse(
          decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))))
        );
        totalAds = ads.length;
      }
    } catch (e) {
      console.error('Ads count error:', e);
    }

    return new Response(JSON.stringify({
      success: true,
      showToPublic: config.showToPublic,
      stats: {
        visitors: totalVisitors,
        users: totalUsers,
        todayVisitors: todayVisitors,
        todayVisits: todayVisits,
        totalVisits: totalVisits,
        ads: totalAds,
        today: today
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Get stats error:', e);
    return new Response(JSON.stringify({
      success: false,
      error: 'خطأ داخلي: ' + e.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/* ===== قراءة إعدادات الإحصائيات ===== */
async function getStatsConfig(env) {
  const defaults = {
    showToPublic: false
  };

  try {
    const repoFile = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/data/stats-config.json`;

    const response = await fetch(repoFile, {
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'User-Agent': 'Kulshi-Kulashi',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) return defaults;

    const fileData = await response.json();
    const content = JSON.parse(
      decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, ''))))
    );

    return {
      showToPublic: content.showToPublic === true
    };
  } catch (e) {
    return defaults;
  }
}
