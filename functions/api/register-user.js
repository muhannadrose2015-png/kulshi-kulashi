/* ==========================================
   Cloudflare Function - تسجيل مستخدم جديد
   المسار: /api/register-user
   Body: { phone, name, city }
   يعيد: { userId, user }
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
    const { phone, name, city } = body;

    if (!phone || !name) {
      return new Response(JSON.stringify({
        success: false,
        error: 'البيانات ناقصة'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

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

    // ===== فحص: هل الرقم مسجّل مسبقاً؟ =====
    const phoneLookupKey = `user_phone:${cleanPhone}`;
    const existingUserId = await env.VIEWS_KV.get(phoneLookupKey);

    if (existingUserId) {
      // مسجّل مسبقاً → أعد userId
      const userKey = `user:${existingUserId}`;
      const userRaw = await env.VIEWS_KV.get(userKey);
      
      if (userRaw) {
        const existingUser = JSON.parse(userRaw);
        return new Response(JSON.stringify({
          success: true,
          isNew: false,
          userId: existingUserId,
          user: existingUser
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ===== مستخدم جديد =====
    // توليد userId فريد
    const userId = 'usr_' + await generateRandomString(24);

    const userData = {
      userId: userId,
      phone: cleanPhone,
      name: String(name).trim().substring(0, 50),
      city: String(city || '').trim().substring(0, 30),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // حفظ المستخدم في KV
    const userKey = `user:${userId}`;
    await env.VIEWS_KV.put(userKey, JSON.stringify(userData), {
      expirationTtl: 60 * 60 * 24 * 365 * 5 // 5 سنوات
    });

    // ربط الرقم بالـ userId (للدخول)
    await env.VIEWS_KV.put(phoneLookupKey, userId, {
      expirationTtl: 60 * 60 * 24 * 365 * 5
    });

    // تحديث عدّاد المستخدمين
    const totalUsersKey = 'stats:total_users';
    const totalUsersRaw = await env.VIEWS_KV.get(totalUsersKey);
    const totalUsers = (parseInt(totalUsersRaw) || 0) + 1;
    await env.VIEWS_KV.put(totalUsersKey, String(totalUsers));

    return new Response(JSON.stringify({
      success: true,
      isNew: true,
      userId: userId,
      user: userData
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Register user error:', e);
    return new Response(JSON.stringify({
      success: false,
      error: 'خطأ داخلي: ' + e.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/* ===== توليد سلسلة عشوائية ===== */
async function generateRandomString(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  
  return result;
}
