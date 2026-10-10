/* ==========================================
   Cloudflare Function - تعليم إعلان كـ "تم البيع"
   المسار: /api/mark-sold
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
    const { productId, userPhone, action } = body;

    // action = 'mark' أو 'unmark'
    const isUnmark = action === 'unmark';

    if (!productId || !userPhone) {
      return new Response(JSON.stringify({
        success: false,
        error: 'البيانات ناقصة'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // قراءة ads.json
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

    // البحث عن الإعلان
    const adIndex = ads.findIndex(ad =>
      String(ad.id) === String(productId) ||
      ad.orderCode === productId
    );

    if (adIndex === -1) {
      return new Response(JSON.stringify({
        success: false,
        error: 'لم يتم العثور على الإعلان'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const ad = ads[adIndex];

    // التحقق: هل الإعلان يخص هذا المستخدم؟
    const adPhone = (ad.ownerPhone || '').replace(/[^0-9]/g, '');
    const reqPhone = String(userPhone).replace(/[^0-9]/g, '');

    if (adPhone !== reqPhone) {
      return new Response(JSON.stringify({
        success: false,
        error: 'هذا الإعلان لا يخصك'
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ===== التحديث =====
    if (isUnmark) {
      // إلغاء "تم البيع"
      ad.sold = false;
      delete ad.soldAt;
      ad.updatedAt = new Date().toISOString();
    } else {
      // تعليم "تم البيع"
      if (ad.sold === true) {
        return new Response(JSON.stringify({
          success: false,
          error: 'الإعلان مُعلَّم كـ "تم البيع" مسبقاً'
        }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      ad.sold = true;
      ad.soldAt = new Date().toISOString();
      ad.updatedAt = new Date().toISOString();
    }

    ads[adIndex] = ad;

    // ===== الكتابة إلى GitHub =====
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
        message: isUnmark ? `Unmark sold: ${ad.title}` : `Mark sold: ${ad.title}`,
        content: encodedContent,
        sha: currentSha,
        branch: 'main'
      })
    });

    if (!putResponse.ok) {
      const errData = await putResponse.json();
      throw new Error(errData.message || 'فشل الحفظ');
    }

    // ===== إشعار في تليجرام (للمعلومية) =====
    if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
      try {
        const emoji = isUnmark ? '↩️' : '💰';
        const actionText = isUnmark ? 'إلغاء "تم البيع"' : 'تم البيع';

        const msg = `<b>${emoji} ${actionText}</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n\n` +
          `<b>📦 الإعلان:</b> ${escapeHTML(ad.title)}\n` +
          `<b>👤 البائع:</b> ${escapeHTML(ad.ownerName || '')}\n` +
          `<b>📱 الهاتف:</b> ${escapeHTML(ad.ownerPhone || '')}\n` +
          `<b>💰 السعر:</b> ${ad.price?.toLocaleString('en-US')} ${ad.currency || 'IQD'}\n\n` +
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
      } catch (e) {
        console.error('Telegram notify error:', e);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: isUnmark ? 'تم إلغاء البيع' : 'تم تعليم الإعلان كمباع',
      ad: ad
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Mark sold error:', e);
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
