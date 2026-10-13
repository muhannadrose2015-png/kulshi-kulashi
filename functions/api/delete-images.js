/* ==========================================
   Cloudflare Function - حذف الصور من GitHub
   المسار: /api/delete-images
   Body: { images: ["url1", "url2", ...] }
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
    const { images } = body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        deleted: 0,
        message: 'لا توجد صور'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const results = [];

    // حذف كل صورة
    for (const imageUrl of images) {
      try {
        // استخراج اسم الملف من الرابط
        // مثال: https://raw.githubusercontent.com/user/repo/main/images/img_xxx.jpg
        // النتيجة: images/img_xxx.jpg
        const match = imageUrl.match(/raw\.githubusercontent\.com\/[^\/]+\/[^\/]+\/[^\/]+\/(.+)$/);

        if (!match || !match[1]) {
          results.push({
            url: imageUrl,
            success: false,
            error: 'رابط غير صالح'
          });
          continue;
        }

        const filePath = match[1];

        // الحصول على SHA للملف (مطلوب للحذف)
        const getFile = await fetch(
          `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${filePath}`,
          {
            headers: {
              'Authorization': `token ${env.GITHUB_TOKEN}`,
              'User-Agent': 'Kulshi-Kulashi',
              'Accept': 'application/vnd.github.v3+json'
            }
          }
        );

        if (!getFile.ok) {
          results.push({
            url: imageUrl,
            success: false,
            error: 'الملف غير موجود',
            status: getFile.status
          });
          continue;
        }

        const fileData = await getFile.json();

        // حذف الملف
        const deleteRes = await fetch(
          `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${filePath}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `token ${env.GITHUB_TOKEN}`,
              'User-Agent': 'Kulshi-Kulashi',
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              message: `Delete image ${filePath}`,
              sha: fileData.sha,
              branch: 'main'
            })
          }
        );

        if (deleteRes.ok) {
          results.push({
            url: imageUrl,
            success: true
          });
        } else {
          const errData = await deleteRes.json();
          results.push({
            url: imageUrl,
            success: false,
            error: errData.message || 'فشل الحذف'
          });
        }
      } catch (e) {
        results.push({
          url: imageUrl,
          success: false,
          error: e.message
        });
      }
    }

    const deletedCount = results.filter(r => r.success).length;

    return new Response(JSON.stringify({
      success: true,
      deleted: deletedCount,
      total: images.length,
      details: results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Delete images error:', e);
    return new Response(JSON.stringify({
      success: false,
      error: 'خطأ داخلي: ' + e.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
