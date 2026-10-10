/* ==========================================
   Cloudflare Function - جلب تقييمات إعلان
   المسار: /api/get-reviews?id=xxx&phone=xxx
   ========================================== */

export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!env.REVIEWS_KV) {
      return new Response(JSON.stringify({
        success: false,
        reviews: [],
        error: 'خدمة التقييمات غير مفعلة'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(request.url);
    const productId = url.searchParams.get('id');
    const userPhone = url.searchParams.get('phone') || '';

    if (!productId) {
      return new Response(JSON.stringify({
        success: false,
        reviews: [],
        error: 'معرّف الإعلان مفقود'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // جلب فهرس التقييمات
    const indexKey = `product_reviews:${productId}`;
    const indexRaw = await env.REVIEWS_KV.get(indexKey);

    if (!indexRaw) {
      return new Response(JSON.stringify({
        success: true,
        reviews: [],
        average: 0,
        total: 0,
        userReview: null
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const index = JSON.parse(indexRaw);
    const reviews = [];
    let userReview = null;

    // جلب كل تقييم
    for (const key of index) {
      const raw = await env.REVIEWS_KV.get(key);
      if (raw) {
        try {
          const review = JSON.parse(raw);
          review._key = key;

          // هل هذا تقييم المستخدم الحالي؟
          const isOwner = userPhone && review.reviewerPhone === userPhone;
          review.isOwner = isOwner;

          if (isOwner) {
            userReview = review;
          } else {
            reviews.push(review);
          }
        } catch (e) {}
      }
    }

    // ترتيب باقي التقييمات: الأحدث أولاً
    reviews.sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt || 0);
      const dateB = new Date(b.updatedAt || b.createdAt || 0);
      return dateB - dateA;
    });

    // حساب المتوسط (بما في ذلك تقييم المستخدم)
    const allReviews = userReview ? [userReview, ...reviews] : reviews;
    let average = 0;
    if (allReviews.length > 0) {
      const sum = allReviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
      average = Math.round((sum / allReviews.length) * 10) / 10;
    }

    return new Response(JSON.stringify({
      success: true,
      userReview: userReview,
      reviews: reviews,
      average: average,
      total: allReviews.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Get reviews error:', e);
    return new Response(JSON.stringify({
      success: false,
      reviews: [],
      error: 'خطأ داخلي: ' + e.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
