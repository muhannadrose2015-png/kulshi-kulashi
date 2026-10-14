/* ==========================================
   Cloudflare Function - تسجيل مستخدم جديد
   المسار: /api/register-user
   Body: { phone, name, city }
   يُسجّل كل مستخدم مرة واحدة فقط
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

    // Hash للرقم
    const phoneHash = await hashString(phone);
    const userKey = `user:${phoneHash}`;

    // فحص: هل هذا المستخدم مسجّل مسبقاً؟
    const existing = await env.VIEWS_KV.get(userKey);

    if (existing) {
      // مسجّل مسبقاً → لا نُعيد العدّ
      const existingData = JSON.parse(existing);
      return new Response(JSON.stringify({
        success: true,
        isNew: false,
        registeredAt: existingData.registeredAt
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ===== مستخدم جديد =====
    const userData = {
      phone: phone,
      name: name,
      city: city || '',
      registeredAt: new Date().toISOString()
    };

    // حفظ المستخدم
    await env.VIEWS_KV.put(userKey, JSON.stringify(userData), {
      expirationTtl: 60 * 60 * 24 * 365 * 5 // 5 سنوات
    });

    // ===== تحديث عدّاد المستخدمين =====
    const totalUsersKey = 'stats:total_users';
    const totalUsersRaw = await env.VIEWS_KV.get(totalUsersKey);
    const totalUsers = (parseInt(totalUsersRaw) || 0) + 1;
    await env.VIEWS_KV.put(totalUsersKey, String(totalUsers));

    // ===== إشعار في تليجرام (اختياري) =====
    if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
      try {
        // نحصل على العدد الحالي
        const currentUsersRaw = await env.VIEWS_KV.get(totalUsersKey);
        const currentUsers = parseInt(currentUsersRaw) || 0;

        const msg = `<b>👤 مستخدم جديد</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n\n` +
          `<b>الاسم:</b> ${escapeHTML(name)}\n` +
          `<b>الهاتف:</b> ${escapeHTML(phone)}\n` +
          (city ? `<b>المدينة:</b> ${escapeHTML(city)}\n` : '') +
          `\n<b>📊 إجمالي المستخدمين:</b> ${currentUsers}\n\n` +
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
      isNew: true,
      registeredAt: userData.registeredAt
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

/* ===== Hash ===== */
async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str + 'kulshi_users_salt_2026');
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
