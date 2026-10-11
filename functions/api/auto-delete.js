/* ==========================================
   Cloudflare Function - الحذف التلقائي
   المسار: /api/auto-delete?secret=XXX
   يعمل عبر Cron Job مرة يومياً
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
        message: 'لا توجد إعلانات'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const now = new Date();
    const kept = [];
    const deleted = [];

    // ===== فحص كل إعلان =====
    for (const ad of ads) {
      const publishDate = new Date(ad.publishedAt || ad.createdAt);

      if (isNaN(publishDate.getTime())) {
        // تاريخ غير صحيح → نُبقيه
        kept.push(ad);
        continue;
      }

      const daysSincePublish = (now - publishDate) / (1000 * 60 * 60 * 24);

      // تحديد مدة العمر حسب النوع
      let lifespanDays = 7; // الافتراضي: 7 أيام

      if (ad.sold === true) {
        // الإعلان المباع: 7 أيام بعد تاريخ البيع
        const soldDate = new Date(ad.soldAt || ad.publishedAt);
        if (!isNaN(soldDate.getTime())) {
          const daysSinceSold = (now - soldDate) / (1000 * 60 * 60 * 24);
          if (daysSinceSold >= 7) {
            deleted.push({
              code: ad.orderCode || ad.id,
              title: ad.title,
              reason: 'sold-expired'
            });
            continue;
          }
          kept.push(ad);
          continue;
        }
      } else if (ad.isFeatured === true) {
        // الإعلان المميز: 10 أيام
        lifespanDays = 10;
      }

      // فحص المدة العادية
      if (daysSincePublish >= lifespanDays) {
        deleted.push({
          code: ad.orderCode || ad.id,
          title: ad.title,
          reason: 'lifespan-expired',
          days: Math.round(daysSincePublish)
        });
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
        message: 'لا توجد إعلانات منتهية'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ===== كتابة ads.json الجديد =====
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
        message: `Auto-delete ${deleted.length} expired ad(s)`,
        content: encodedContent,
        sha: currentSha,
        branch: 'main'
      })
    });

    if (!putResponse.ok) {
      const errData = await putResponse.json();
      throw new Error(errData.message || 'فشل الحذف');
    }

    // ===== إشعار في تليجرام =====
    if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
      try {
        const msg = `<b>🗑️ حذف تلقائي</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n\n` +
          `تم حذف <b>${deleted.length}</b> إعلان منتهي:\n\n` +
          deleted.slice(0, 10).map(d => {
            const reason = d.reason === 'sold-expired' ? '(مباع - 7 أيام)' :
                           d.reason === 'lifespan-expired' ? `(${d.days || 7} أيام)` : '';
            return `• ${escapeHTML(d.title)} ${reason}`;
          }).join('\n') +
          (deleted.length > 10 ? `\n\n...و ${deleted.length - 10} آخرين` : '') +
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

    return new Response(JSON.stringify({
      success: true,
      deleted: deleted.length,
      kept: kept.length,
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

/* ===== حماية HTML ===== */
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
