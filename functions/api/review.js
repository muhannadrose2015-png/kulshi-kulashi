/* ==========================================
   Cloudflare Function - استقبال/تعديل التقييمات
   المسار: /api/review
   المفتاح: hash(phone + IP)
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
    const { productId, rating, comment, reviewerName, reviewerPhone, isUpdate } = body;

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

    if (!reviewerPhone) {
      return new Response(JSON.stringify({
        success: false,
        error: 'يجب تسجيل الدخول للتقييم'
      }), {
        status: 401,
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

    let cleanComment = '';
    if (comment) {
      cleanComment = String(comment).trim().substring(0, 300);
    }

    // ===== المفتاح الفريد: phone + IP =====
    const ip = request.headers.get('CF-Connecting-IP') ||
               request.headers.get('X-Forwarded-For')?.split(',')[0] ||
               'unknown';

    const userHash = await hashString(`${reviewerPhone}_${ip}`);
    const reviewKey = `review:${productId}:${userHash}`;

    // فحص هل هناك تقييم سابق
    const existingRaw = await env.REVIEWS_KV.get(reviewKey);
    const existing = existingRaw ? JSON.parse(existingRaw) : null;

    if (existing && !isUpdate) {
      return new Response(JSON.stringify({
        success: false,
        error: 'لقد قمت بتقييم هذا الإعلان مسبقاً',
        existing: existing
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
      reviewerPhone: String(reviewerPhone).trim().substring(0, 15),
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
      updatedAt: isUpdate ? new Date().toISOString() : null,
      isEdited: !!isUpdate
    };

    // حفظ في KV
    await env.REVIEWS_KV.put(reviewKey, JSON.stringify(review), {
      expirationTtl: 60 * 60 * 24 * 365 * 5
    });

    // إضافة لفهرس التقييمات (إن لم يكن موجوداً)
    if (!existing) {
      const indexKey = `product_reviews:${productId}`;
      const indexRaw = await env.REVIEWS_KV.get(indexKey);
      const index = indexRaw ? JSON.parse(indexRaw) : [];
      if (!index.includes(reviewKey)) {
        index.push(reviewKey);
        await env.REVIEWS_KV.put(indexKey, JSON.stringify(index));
      }
    }

    // ===== إشعار تليجرام =====
    if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
      if (ratingNum <= 2 || isUpdate) {
        try {
          const action = isUpdate ? 'تعديل تقييم' : 'تقييم سلبي';
          const emoji = isUpdate ? '✏️' : '⚠️';

          const msg = `<b>${emoji} ${action}</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `<b>📦 الإعلان:</b> ${escapeHTML(productId)}\n` +
            `<b>⭐ التقييم:</b> ${ratingNum}/5\n` +
            `<b>👤 المُقيِّم:</b> ${escapeHTML(review.reviewerName)}\n` +
            `<b>📱 الهاتف:</b> ${escapeHTML(review.reviewerPhone)}\n` +
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
                    { text: '🗑️ حذف التقييم', callback_data: `del_review_${reviewKey}` }
                  ]]
                }
              })
            }
          );
        } catch (e) {
          console.error('Telegram notify error:', e);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      review: review,
      isUpdate: !!existing
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

/* ===== دالة Hash ===== */
async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str + 'kulshi_salt_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ===== حماية HTML ===== */
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
