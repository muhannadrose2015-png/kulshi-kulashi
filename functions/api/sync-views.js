/* ==========================================
   Cloudflare Function - مزامنة المشاهدات
   المسار: /api/sync-views?secret=SYNC_SECRET
   يجمع المشاهدات من KV ويكتبها إلى views.json على GitHub
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

  // فحص السر
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');

  if (!env.SYNC_SECRET || secret !== env.SYNC_SECRET) {
    return new Response(JSON.stringify({
      success: false,
      error: 'غير مصرح - Secret خاطئ'
    }), {
      status: 401,
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

    if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
      return new Response(JSON.stringify({
        success: false,
        error: 'GitHub غير معد'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ===== 1. جلب كل المشاهدات من KV =====
    const listResult = await env.VIEWS_KV.list({ prefix: 'view:' });
    const views = {};

    for (const key of listResult.keys) {
      const productId = key.name.replace('view:', '');
      const count = await env.VIEWS_KV.get(key.name);
      views[productId] = parseInt(count, 10) || 0;
    }

    const totalProducts = Object.keys(views).length;
    const totalViews = Object.values(views).reduce((a, b) => a + b, 0);

    // ===== 2. قراءة views.json الحالي من GitHub =====
    const fileUrl = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/data/views.json`;

    const getResponse = await fetch(fileUrl, {
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

    // ===== 3. كتابة الملف الجديد =====
    const content = JSON.stringify(views, null, 2);
    const encodedContent = btoa(unescape(encodeURIComponent(content)));

    const putBody = {
      message: `Sync views (${totalViews} total views) - ${new Date().toISOString()}`,
      content: encodedContent,
      branch: 'main'
    };

    if (currentSha) {
      putBody.sha = currentSha;
    }

    const putResponse = await fetch(fileUrl, {
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
      const errorData = await putResponse.json();
      throw new Error(errorData.message || 'فشل تحديث GitHub');
    }

    return new Response(JSON.stringify({
      success: true,
      synced: totalProducts,
      totalViews: totalViews,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Sync error:', e);
    return new Response(JSON.stringify({
      success: false,
      error: 'خطأ: ' + e.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
