/* ==========================================
   Cloudflare Function - استقبال/تعديل التقييمات + ردود
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
    const { action, productId, rating, comment, reviewerName, reviewerPhone, isUpdate, reviewKey, replyText } = body;

    // ===== فحص الطلب: جديد أم رد؟ =====
    if (action === 'add_reply') {
      return await handleAddReply(env, body, corsHeaders);
    }

    // ===== إضافة/تعديل تقييم =====
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

    // المفتاح الفريد: phone + IP
    const ip = request.headers.get('CF-Connecting-IP') ||
               request.headers.get('X-Forwarded-For')?.split(',')[0] ||
               'unknown';

    const userHash = await hashString(`${reviewerPhone}_${ip}`);
    const reviewKey2 = `review:${productId}:${userHash}`;

    const existingRaw = await env.REVIEWS_KV.get(reviewKey2);
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

    const review = {
      productId: productId,
      rating: ratingNum,
      comment: cleanComment,
      reviewerName: (reviewerName || '').trim().substring(0, 30) || 'زائر',
      reviewerPhone: String(reviewerPhone).trim().substring(0, 15),
      replies: existing && existing.replies ? existing.replies : [],
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
      updatedAt: isUpdate ? new Date().toISOString() : null,
      isEdited: !!isUpdate
    };

    await env.REVIEWS_KV.put(reviewKey2, JSON.stringify(review), {
      expirationTtl: 60 * 60 * 24 * 365 * 5
    });

    if (!existing) {
      const indexKey = `product_reviews:${productId}`;
      const indexRaw = await env.REVIEWS_KV.get(indexKey);
      const index = indexRaw ? JSON.parse(indexRaw) : [];
      if (!index.includes(reviewKey2)) {
        index.push(reviewKey2);
        await env.VIEWS_KV.put(indexKey, JSON.stringify(index));
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

/* ==========================================
   إضافة رد (من صاحب الإعلان)
   ========================================== */
async function handleAddReply(env, body, corsHeaders) {
  const { reviewKey, replyText, replierPhone, replierName } = body;

  if (!reviewKey || !replyText || !replierPhone) {
    return new Response(JSON.stringify({
      success: false,
      error: 'البيانات ناقصة'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const cleanReply = String(replyText).trim().substring(0, 300);
  if (cleanReply.length < 2) {
    return new Response(JSON.stringify({
      success: false,
      error: 'الرد قصير جداً'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // جلب التقييم الأصلي
  const reviewRaw = await env.REVIEWS_KV.get(reviewKey);
  if (!reviewRaw) {
    return new Response(JSON.stringify({
      success: false,
      error: 'التقييم غير موجود'
    }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const review = JSON.parse(reviewRaw);

  // فحص: هل المُرد يملك الإعلان؟
  // نحتاج التحقق من ads.json
  try {
    const adsFile = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/data/ads.json`;
    const adsRes = await fetch(adsFile, {
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'User-Agent': 'Kulshi-Kulashi',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!adsRes.ok) {
      return new Response(JSON.stringify({
        success: false,
        error: 'فشل التحقق من الملكية'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const adsData = await adsRes.json();
    const ads = JSON.parse(
      decodeURIComponent(escape(atob(adsData.content.replace(/\n/g, ''))))
    );

    const product = ads.find(ad => String(ad.id) === String(review.productId));
    
    if (!product) {
      return new Response(JSON.stringify({
        success: false,
        error: 'الإعلان غير موجود'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // التحقق: هل المرد يملك الإعلان؟
    const ownerPhone = String(product.ownerPhone || '').replace(/[^0-9]/g, '');
    const replierPhoneClean = String(replierPhone).replace(/[^0-9]/g, '');

    if (ownerPhone !== replierPhoneClean) {
      return new Response(JSON.stringify({
        success: false,
        error: 'فقط صاحب الإعلان يمكنه الرد'
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // إضافة الرد
    if (!review.replies) review.replies = [];
    
    review.replies.push({
      text: cleanReply,
      replierName: (replierName || 'البائع').trim().substring(0, 30),
      createdAt: new Date().toISOString()
    });

    // حفظ التقييم المحدث
    await env.REVIEWS_KV.put(reviewKey, JSON.stringify(review), {
      expirationTtl: 60 * 60 * 24 * 365 * 5
    });

    return new Response(JSON.stringify({
      success: true,
      review: review
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Add reply error:', e);
    return new Response(JSON.stringify({
      success: false,
      error: 'خطأ داخلي: ' + e.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/* ===== Hash ===== */
async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str + 'kulshi_salt_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}
