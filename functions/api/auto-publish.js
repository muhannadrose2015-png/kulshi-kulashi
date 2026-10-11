/* ==========================================
   Cloudflare Function - النشر التلقائي
   المسار: /api/auto-publish?secret=XXX
   يعمل عبر Cron Job كل 5 دقائق
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

  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');

  if (!env.SYNC_SECRET || secret !== env.SYNC_SECRET) {
    return new Response(JSON.stringify({
      success: false,
      error: 'غير مصرح'
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

    // ===== 1. جلب كل الإعلانات المعلقة =====
    const listResult = await env.VIEWS_KV.list({ prefix: 'pending_ad:' });

    if (listResult.keys.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        published: 0,
        checked: 0,
        message: 'لا توجد إعلانات معلقة',
        timestamp: new Date().toISOString()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const now = new Date();
    const readyToPublish = [];

    // ===== 2. فحص كل إعلان =====
    for (const key of listResult.keys) {
      const raw = await env.VIEWS_KV.get(key.name);
      if (!raw) continue;

      try {
        const adData = JSON.parse(raw);
        if (!adData.expiresAt) continue;

        const expiresAt = new Date(adData.expiresAt);
        if (expiresAt <= now) {
          readyToPublish.push({
            key: key.name,
            data: adData
          });
        }
      } catch (e) {
        console.error('Parse error:', key.name, e);
      }
    }

    if (readyToPublish.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        published: 0,
        checked: listResult.keys.length,
        message: 'لا توجد إعلانات جاهزة',
        timestamp: new Date().toISOString()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ===== 3. قراءة ads.json =====
    const repoFile = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/data/ads.json`;

    const getResponse = await fetch(repoFile, {
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'User-Agent': 'Kulshi-Kulashi',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!getResponse.ok) throw new Error('فشل قراءة ads.json');

    const fileData = await getResponse.json();
    const currentSha = fileData.sha;

    const ads = JSON.parse(
      decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, ''))))
    );

    // ===== 4. إضافة الإعلانات الجاهزة =====
    const publishedCodes = [];

    for (const item of readyToPublish) {
      const adData = item.data;

      // فحص عدم التكرار
      const exists = ads.find(ad => ad.orderCode === adData.orderCode);
      if (exists) {
        // موجود مسبقاً → احذفه من KV
        await env.VIEWS_KV.delete(item.key);
        continue;
      }

      // إضافة الإعلان
      ads.push({
        id: `ad_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        orderCode: adData.orderCode,
        title: adData.title,
        category: adData.category,
        price: Number(adData.price),
        currency: adData.currency || 'IQD',
        description: adData.description,
        images: adData.images || [],
        city: adData.city,
        whatsapp: adData.whatsapp || adData.ownerPhone,
        ownerName: adData.ownerName,
        ownerPhone: adData.ownerPhone,
        status: 'active',
        sold: false,
        views: 0,
        createdAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
        autoPublished: true
      });

      publishedCodes.push(adData.orderCode);

      // حذف من KV
      await env.VIEWS_KV.delete(item.key);
    }

    // ===== 5. كتابة ads.json =====
    if (publishedCodes.length > 0) {
      const newContent = JSON.stringify(ads, null, 2);
      const encodedContent = btoa(unescape(encodeURIComponent(newContent)));

      const putResponse = await fetch(repoFile, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${env.GITHUB_TOKEN}`,
          'User-Agent': 'Kulshi-Kulashi',
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Auto-publish ${publishedCodes.length} ad(s)`,
          content: encodedContent,
          sha: currentSha,
          branch: 'main'
        })
      });

      if (!putResponse.ok) {
        const errData = await putResponse.json();
        throw new Error(errData.message || 'فشل النشر');
      }

      // إشعار في تليجرام
      if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
        try {
          const msg = `<b>⚡ نشر تلقائي</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `تم نشر <b>${publishedCodes.length}</b> إعلان تلقائياً:\n\n` +
            publishedCodes.map(c => `• <code>${c}</code>`).join('\n') +
            `\n\n⏰ ${new Date().toLocaleString('ar-IQ')}`;

          await fetch(
            `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: env.TELEGRAM_CHAT_ID,
                text: msg,
                parse_mode: 'HTML'
              })
            }
          );
        } catch (e) {}
      }
    }

    return new Response(JSON.stringify({
      success: true,
      published: publishedCodes.length,
      checked: listResult.keys.length,
      codes: publishedCodes,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Auto-publish error:', e);
    return new Response(JSON.stringify({
      success: false,
      error: 'خطأ داخلي: ' + e.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
