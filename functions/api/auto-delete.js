/* ==========================================
   Cloudflare Function - الحذف التلقائي
   المسار: /api/auto-delete?secret=XXX
   يعمل عبر Cron Job مرة يومياً
   يحذف الإعلانات المنتهية + صورها
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
    // ===== قراءة الإعدادات =====
    const settings = await getSettings(env);

    // ===== قراءة ads.json =====
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

    if (ads.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        deleted: 0,
        kept: 0,
        imagesDeleted: 0,
        message: 'لا توجد إعلانات'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const now = new Date();
    const kept = [];
    const deleted = [];
    const imagesToDelete = [];

    // ===== فحص كل إعلان =====
    for (const ad of ads) {
      const publishDate = new Date(ad.publishedAt || ad.createdAt);

      if (isNaN(publishDate.getTime())) {
        kept.push(ad);
        continue;
      }

      const daysSincePublish = (now - publishDate) / (1000 * 60 * 60 * 24);

      let lifespanDays = settings.adLifespan;
      let shouldDelete = false;
      let reason = '';

      if (ad.sold === true) {
        // الإعلان المباع
        const soldDate = new Date(ad.soldAt || ad.publishedAt);
        if (!isNaN(soldDate.getTime())) {
          const daysSinceSold = (now - soldDate) / (1000 * 60 * 60 * 24);
          if (daysSinceSold >= settings.soldLifespan) {
            shouldDelete = true;
            reason = 'sold-expired';
          }
        }
      } else {
        if (ad.isFeatured === true) {
          lifespanDays = settings.featuredLifespan;
        }
        if (daysSincePublish >= lifespanDays) {
          shouldDelete = true;
          reason = 'lifespan-expired';
        }
      }

      if (shouldDelete) {
        deleted.push({
          code: ad.orderCode || ad.id,
          title: ad.title,
          reason: reason,
          lifespan: lifespanDays,
          days: Math.round(daysSincePublish)
        });

        // جمع صور الإعلان للحذف
        if (ad.images && Array.isArray(ad.images)) {
          imagesToDelete.push(...ad.images);
        }
      } else {
        kept.push(ad);
      }
    }

    // ===== إذا لا يوجد ما حُذف =====
    if (deleted.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        deleted: 0,
        kept: kept.length,
        imagesDeleted: 0,
        message: 'لا توجد إعلانات منتهية'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ===== 1. حذف الصور أولاً (قبل تعديل ads.json) =====
    let imagesDeletedCount = 0;

    if (imagesToDelete.length > 0) {
      try {
        // حذف كل صورة (مع حد أقصى لحماية Rate Limit)
        const MAX_IMAGES_PER_RUN = 50;
        const imagesToProcess = imagesToDelete.slice(0, MAX_IMAGES_PER_RUN);

        for (const imageUrl of imagesToProcess) {
          try {
            // استخراج مسار الملف
            const match = imageUrl.match(/raw\.githubusercontent\.com\/[^\/]+\/[^\/]+\/[^\/]+\/(.+)$/);
            if (!match || !match[1]) continue;

            const filePath = match[1];

            // الحصول على SHA
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

            if (!getFile.ok) continue;

            const fileInfo = await getFile.json();

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
                  message: `Auto-delete image ${filePath}`,
                  sha: fileInfo.sha,
                  branch: 'main'
                })
              }
            );

            if (deleteRes.ok) {
              imagesDeletedCount++;
            }
          } catch (imgErr) {
            console.error('Image delete error:', imageUrl, imgErr);
          }
        }
      } catch (e) {
        console.error('Delete images batch error:', e);
      }
    }

    // ===== 2. كتابة ads.json الجديد =====
    const newContent = JSON.stringify(kept, null, 2);
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
        message: `Auto-delete ${deleted.length} expired ad(s) + ${imagesDeletedCount} images`,
        content: encodedContent,
        sha: currentSha,
        branch: 'main'
      })
    });

    if (!putResponse.ok) {
      const errData = await putResponse.json();
      throw new Error(errData.message || 'فشل الحذف');
    }

    // ===== 3. إشعار في تليجرام =====
    if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
      try {
        const msg = `<b>🗑️ حذف تلقائي</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n\n` +
          `تم حذف <b>${deleted.length}</b> إعلان منتهي:\n\n` +
          deleted.slice(0, 10).map(d => {
            const reason = d.reason === 'sold-expired' ? `(مباع - ${settings.soldLifespan} أيام)` :
                           d.reason === 'lifespan-expired' ? `(${d.lifespan} يوم)` : '';
            return `• ${escapeHTML(d.title)} ${reason}`;
          }).join('\n') +
          (deleted.length > 10 ? `\n\n...و ${deleted.length - 10} آخرين` : '') +
          `\n\n🖼️ تم حذف <b>${imagesDeletedCount}</b> صورة\n` +
          `⏰ ${new Date().toLocaleString('ar-IQ')}`;

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

    return new Response(JSON.stringify({
      success: true,
      deleted: deleted.length,
      kept: kept.length,
      imagesDeleted: imagesDeletedCount,
      imagesRequested: imagesToDelete.length,
      details: deleted,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Auto-delete error:', e);
    return new Response(JSON.stringify({
      success: false,
      error: 'خطأ داخلي: ' + e.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/* ===== قراءة الإعدادات ===== */
async function getSettings(env) {
  const defaults = {
    adLifespan: 20,
    featuredLifespan: 30,
    soldLifespan: 7
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

    if (!response.ok) return defaults;

    const fileData = await response.json();
    const content = JSON.parse(
      decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, ''))))
    );

    const settings = { ...defaults };
    for (const key of Object.keys(defaults)) {
      if (content[key] !== undefined && content[key] !== null) {
        settings[key] = Number(content[key]) || defaults[key];
      }
    }

    return settings;
  } catch (e) {
    return defaults;
  }
}

/* ===== حماية HTML ===== */
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
