/* ==========================================
   Cloudflare Function - قراءة الإعدادات
   المسار: /api/get-settings
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

  // ===== القيم الافتراضية =====
  const defaults = {
    adLifespan: 20,
    featuredLifespan: 30,
    soldLifespan: 7,
    reminderStartDay: 15,
    reminderIntervalHours: 4,
    reminderSameAdDays: 14,
    weeklyLimit: 7,
    promotePrice: 2000,
    promoteDays: 10,
    subscribePrice: 15000,
    subscribeDays: 30,
    maxImagesPerAd: 5,
    maxImageSizeKB: 400,
    autoPublishNormalMinutes: 20,
    autoPublishFeaturedMinutes: 5
  };

  try {
    const repoFile = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/data/settings.json`;

    const response = await fetch(repoFile, {
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'User-Agent': 'Kulshi-Kulashi',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      // الملف غير موجود → نُرجع الافتراضيات
      return new Response(JSON.stringify({
        success: true,
        settings: defaults,
        source: 'defaults'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const fileData = await response.json();
    const content = JSON.parse(
      decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, ''))))
    );

    // دمج مع الافتراضيات (لو نسى أحد الحقول)
    const settings = { ...defaults };
    for (const key of Object.keys(defaults)) {
      if (content[key] !== undefined && content[key] !== null) {
        settings[key] = content[key];
      }
    }

    return new Response(JSON.stringify({
      success: true,
      settings: settings,
      source: 'file'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Get settings error:', e);
    return new Response(JSON.stringify({
      success: true,
      settings: defaults,
      source: 'fallback',
      error: e.message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
