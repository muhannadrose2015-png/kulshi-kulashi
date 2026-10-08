/* ==========================================
   Cloudflare Function - رفع الصور إلى GitHub
   المسار: /api/upload
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
    if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
      return new Response(JSON.stringify({
        success: false,
        error: 'لم يتم إعداد GitHub في Cloudflare'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { base64, filename } = body;

    if (!base64 || !filename) {
      return new Response(JSON.stringify({
        success: false,
        error: 'الصورة أو اسم الملف مفقود'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');

    const sizeKB = (base64Data.length * 3 / 4) / 1024;
    if (sizeKB > 500) {
      return new Response(JSON.stringify({
        success: false,
        error: `الصورة كبيرة جداً (${Math.round(sizeKB)}KB) - الحد الأقصى 500KB`
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    const cleanFilename = `img_${timestamp}_${random}.jpg`;
    const path = `images/${cleanFilename}`;

    const githubUrl = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`;

    const uploadResponse = await fetch(githubUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'User-Agent': 'Kulshi-Kulashi',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Upload image ${cleanFilename}`,
        content: base64Data,
        branch: 'main'
      })
    });

    const uploadData = await uploadResponse.json();

    if (!uploadResponse.ok) {
      console.error('GitHub upload error:', uploadData);
      return new Response(JSON.stringify({
        success: false,
        error: uploadData.message || 'فشل الرفع إلى GitHub'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const rawUrl = `https://raw.githubusercontent.com/${env.GITHUB_REPO}/main/${path}`;

    return new Response(JSON.stringify({
      success: true,
      url: rawUrl,
      filename: cleanFilename
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Upload error:', e);
    return new Response(JSON.stringify({
      success: false,
      error: 'خطأ داخلي: ' + e.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
