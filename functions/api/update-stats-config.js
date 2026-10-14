/* ==========================================
   Cloudflare Function - تحديث إعدادات الإحصائيات
   المسار: /api/update-stats-config
   Body: { secret, showToPublic }
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
    const body = await request.json();
    const { secret, showToPublic } = body;

    if (!env.SYNC_SECRET || secret !== env.SYNC_SECRET) {
      return new Response(JSON.stringify({
        success: false,
        error: 'غير مصرح'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
      return new Response(JSON.stringify({
        success: false,
        error: 'GitHub غير معد'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // قراءة الملف الحالي
    const repoFile = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/data/stats-config.json`;

    const getResponse = await fetch(repoFile, {
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'User-Agent': 'Kulshi-Kulashi',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    let currentSha = null;

    if (getResponse.ok) {
      const fileData = await getResponse.json();
      currentSha = fileData.sha;
    }

    // الملف الجديد
    const newConfig = {
      "_دليل": "🔴 غيّر showToPublic إلى true لإظهار الإحصائيات للزوار",
      "showToPublic": showToPublic === true,
      "_showToPublic_شرح": "false = الإحصائيات تظهر فقط في لوحة الأدمن | true = تظهر للزوار في الصفحة الرئيسية"
    };

    const newContent = JSON.stringify(newConfig, null, 2);
    const encodedContent = btoa(unescape(encodeURIComponent(newContent)));

    // الحفظ
    const putBody = {
      message: `Update stats config (showToPublic: ${newConfig.showToPublic})`,
      content: encodedContent,
      branch: 'main'
    };

    if (currentSha) {
      putBody.sha = currentSha;
    }

    const putResponse = await fetch(repoFile, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'User-Agent': 'Kulshi-Kulashi',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(putBody)
    });

    if (!putResponse.ok) {
      const errData = await putResponse.json();
      throw new Error(errData.message || 'فشل الحفظ');
    }

    return new Response(JSON.stringify({
      success: true,
      showToPublic: newConfig.showToPublic
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Update stats config error:', e);
    return new Response(JSON.stringify({
      success: false,
      error: 'خطأ داخلي: ' + e.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
