/* ==========================================
   Cloudflare Function - استقبال التقييمات
   المسار: /api/review
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
    if (!env.REVIEWS_KV) {
      return new Response(JSON.stringify({
        success: false,
        error: 'خدمة التقييمات غير مفعلة'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { productId, rating, comment, reviewerName, reviewerPhone } = body;

    // ===== التحقق =====
    if (!productId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'معرّف الإعلان مفقود'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const ratingNum = Number(rating);
    if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
      return new Response(JSON.stringify({
        success: false,
        error: 'التقييم يجب أن يكون من 1 إلى 5'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // التعليق (اختياري - لكن إذا وُجد، لا يزيد عن 300 حرف)
    let cleanComment = '';
    if (comment) {
      cleanComment = String(comment).trim().substring(0, 300);
    }

    // ===== الحماية من التكرار (IP واحد لكل إعلان) =====
    const ip = request.headers.get('CF-Connecting-IP') ||
               request.headers.get('X-Forwarded-For')?.split(',')[0] ||
               'unknown';

    // إنشاء hash بسيط من IP + productId
    const key = `review:${productId}:${await hashIP(ip)}`;

    // فحص إذا كان التقييم موجوداً بالفعل
    const existing = await env.REVIEWS_KV.get(key);
    if (existing) {
      return new Response(JSON.stringify({
        success: false,
        error: 'لقد قمت بتقييم هذا الإعلان مسبقاً'
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ===== البيانات النهائية =====
    const review = {
      productId: productId,
      rating: ratingNum,
      comment: cleanComment,
      reviewerName: (reviewerName || '').trim().substring(0, 30) || 'زائر',
      reviewerPhone: (reviewerPhone || '').trim().substring(0, 15),
      createdAt: new Date().toISOString()
    };

    // حفظ في KV
    await env.REVIEWS_KV.put(key, JSON.stringify(review), {
      // نحتفظ بالتقييمات لمدة 5 سنوات
      expirationTtl: 60 * 60 * 24 * 365 * 5
    });

    // إضافة لفهرس التقييمات (للبحث السريع)
    const indexKey = `product_reviews:${productId}`;
    const indexRaw = await env.REVIEWS_KV.get(indexKey);
    const index = indexRaw ? JSON.parse(indexRaw) : [];
    index.push(key);
    await env.REVIEWS_KV.put(indexKey, JSON.stringify(index));

    // ===== إرسال إشعار في تليجرام إذا كان التقييم سلبي =====
    if (ratingNum <= 2 && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
      try {
        const msg = `<b>⚠️ تقييم سلبي</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n\n` +
          `<b>📦 الإعلان:</b> ${escapeHTML(productId)}\n` +
          `<b>⭐ التقييم:</b> ${ratingNum}/5\n` +
          `<b>👤 المُقيِّم:</b> ${escapeHTML(review.reviewerName)}\n` +
          (cleanComment ? `\n<b>💬 التعليق:</b>\n${escapeHTML(cleanComment)}\n` : '') +
          `\n⏰ ${new Date().toLocaleString('ar-IQ')}`;

        await fetch(
          `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: env.TELEGRAM_CHAT_ID,
              text: msg,
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [[
                  { text: '🗑️ حذف التقييم', callback_data: `del_review_${key}` }
                ]]
              }
            })
          }
        );
      } catch (e) {
        console.error('Telegram notify error:', e);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      review: review
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Review error:', e);
    return new Response(JSON.stringify({
      success: false,
      error: 'خطأ داخلي: ' + e.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/* ===== دالة Hash بسيطة للـ IP ===== */
async function hashIP(ip) {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + 'kulshi_salt_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ===== حماية HTML ===== */
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
