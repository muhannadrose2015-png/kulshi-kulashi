/* ==========================================
   Cloudflare Function - تحديث بيانات المستخدم
   المسار: /api/update-user
   Body: { userId, name, phone, city }
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
    if (!env.VIEWS_KV) {
      return new Response(JSON.stringify({
        success: false,
        error: 'KV غير مربوط'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { userId, name, phone, city } = body;

    if (!userId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'userId مفقود'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // جلب المستخدم الحالي
    const userKey = `user:${userId}`;
    const userRaw = await env.VIEWS_KV.get(userKey);

    if (!userRaw) {
      return new Response(JSON.stringify({
        success: false,
        error: 'المستخدم غير موجود'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const oldUser = JSON.parse(userRaw);

    // تجهيز البيانات الجديدة
    const updatedUser = { ...oldUser };

    if (name !== undefined) {
      const cleanName = String(name).trim().substring(0, 50);
      if (cleanName.length < 2) {
        return new Response(JSON.stringify({
          success: false,
          error: 'الاسم قصير جداً'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      updatedUser.name = cleanName;
    }

    if (phone !== undefined) {
      const cleanPhone = String(phone).replace(/[^0-9]/g, '');
      if (cleanPhone.length < 10 || cleanPhone.length > 13) {
        return new Response(JSON.stringify({
          success: false,
          error: 'رقم الهاتف غير صحيح'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // إذا تغيّر الرقم → نُحدّث فهرس user_phone
      if (cleanPhone !== oldUser.phone) {
        // احذف الفهرس القديم
        await env.VIEWS_KV.delete(`user_phone:${oldUser.phone}`);

        // أضف الفهرس الجديد
        await env.VIEWS_KV.put(`user_phone:${cleanPhone}`, userId, {
          expirationTtl: 60 * 60 * 24 * 365 * 5
        });
      }

      updatedUser.phone = cleanPhone;
    }

    if (city !== undefined) {
      updatedUser.city = String(city).trim().substring(0, 30);
    }

    updatedUser.updatedAt = new Date().toISOString();

    // حفظ
    await env.VIEWS_KV.put(userKey, JSON.stringify(updatedUser), {
      expirationTtl: 60 * 60 * 24 * 365 * 5
    });

    return new Response(JSON.stringify({
      success: true,
      user: updatedUser
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Update user error:', e);
    return new Response(JSON.stringify({
      success: false,
      error: 'خطأ داخلي: ' + e.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
