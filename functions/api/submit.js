/* ==========================================
   Cloudflare Function - إرسال الإعلان إلى تليجرام
   المسار: /api/submit
   يخزّن الإعلانات المعلّقة في KV لأجل الموافقة
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
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
      return new Response(JSON.stringify({
        success: false,
        error: 'لم يتم إعداد تليجرام في Cloudflare'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { action, data } = body;

    let message = '';
    let replyMarkup = null;

    /* ===== إعلان جديد ===== */
    if (action === 'new_ad') {
      // تخزين الإعلان في KV أولاً (لأجل الموافقة)
      if (env.VIEWS_KV) {
        try {
          const key = `pending_ad:${data.orderCode}`;
          const value = JSON.stringify({
            ...data,
            createdAt: new Date().toISOString(),
            status: 'pending'
          });
          // نحفظ في KV مع expiry بعد 30 يوماً
          await env.VIEWS_KV.put(key, value, {
            expirationTtl: 60 * 60 * 24 * 30
          });
          console.log('Ad stored in KV:', key);
        } catch (kvError) {
          console.error('KV store error:', kvError);
          // لا نوقف العملية إذا فشل التخزين
        }
      }

      message = formatNewAd(data);

      replyMarkup = {
        inline_keyboard: [
          [
            { text: '✅ موافقة ونشر', callback_data: `approve_${data.orderCode}` },
            { text: '❌ رفض', callback_data: `reject_${data.orderCode}` }
          ]
        ]
      };
    }
    /* ===== إبلاغ عن إعلان ===== */
    else if (action === 'report') {
      message = formatReport(data);
    }
    /* ===== طلب حذف ===== */
    else if (action === 'delete_request') {
      // حذف الإعلان المعلّق من KV (إن وُجد)
      if (env.VIEWS_KV && data.productId) {
        try {
          await env.VIEWS_KV.delete(`pending_ad:${data.productId}`);
        } catch (e) {}
      }
      message = formatDeleteRequest(data);
    }
    /* ===== اختبار ===== */
    else if (action === 'test') {
      message = '🧪 رسالة تجريبية من موقع كلشي كلاشي\n⏰ ' + new Date().toLocaleString('ar-IQ');
    }
    else {
      return new Response(JSON.stringify({
        success: false,
        error: 'إجراء غير معروف: ' + action
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // إرسال إلى تليجرام
    const tgBody = {
      chat_id: env.TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: false
    };

    if (replyMarkup) {
      tgBody.reply_markup = replyMarkup;
    }

    const tgResponse = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tgBody)
      }
    );

    const tgData = await tgResponse.json();

    if (!tgData.ok) {
      console.error('Telegram error:', tgData);
      return new Response(JSON.stringify({
        success: false,
        error: tgData.description || 'فشل الإرسال إلى تليجرام'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      messageId: tgData.result.message_id
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Submit error:', e);
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
   تنسيق الرسائل
   ========================================== */

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatPrice(price, currency) {
  if (!price && price !== 0) return 'غير محدد';
  const num = Number(price);
  if (isNaN(num)) return price;
  const formatted = num.toLocaleString('en-US');
  const currencies = {
    'IQD': 'د.ع',
    'USD': '$',
    'SAR': 'ر.س',
    'AED': 'د.إ'
  };
  return `${formatted} ${currencies[currency] || currency || 'د.ع'}`;
}

/* ===== إعلان جديد ===== */
function formatNewAd(data) {
  const orderCode = escapeHTML(data.orderCode || '');
  const images = data.images || [];

  let msg = `<b>🆕 إعلان جديد</b>\n`;
  msg += `<b>الكود:</b> <code>${orderCode}</code>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  msg += `<b>👤 البائع:</b> ${escapeHTML(data.ownerName || 'غير محدد')}\n`;
  msg += `<b>📱 الهاتف:</b> ${escapeHTML(data.ownerPhone || '')}\n`;
  msg += `<b>💬 واتساب:</b> ${escapeHTML(data.whatsapp || data.ownerPhone || '')}\n`;
  msg += `<b>📍 المدينة:</b> ${escapeHTML(data.city || 'غير محدد')}\n\n`;

  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `<b>📦 العنوان:</b>\n${escapeHTML(data.title)}\n\n`;
  msg += `<b>🏷️ الصنف:</b> ${escapeHTML(data.categoryName || data.category)}\n`;
  msg += `<b>💰 السعر:</b> ${formatPrice(data.price, data.currency)}\n\n`;

  if (data.description) {
    const desc = escapeHTML(data.description);
    const trimmed = desc.length > 500 ? desc.substring(0, 500) + '...' : desc;
    msg += `<b>📝 الوصف:</b>\n${trimmed}\n\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `<b>🖼️ الصور (${images.length}):</b>\n`;

  if (images.length === 0) {
    msg += `<i>لا توجد صور</i>\n`;
  } else {
    images.forEach((url, i) => {
      msg += `<a href="${escapeHTML(url)}">صورة ${i + 1}</a>\n`;
    });
  }

  msg += `\n⏰ ${new Date().toLocaleString('ar-IQ')}`;
  msg += `\n\n<b>اضغط موافقة للنشر أو رفض للإلغاء</b>`;

  return msg;
}

/* ===== إبلاغ عن إعلان ===== */
function formatReport(data) {
  let msg = `<b>⚠️ إبلاغ عن إعلان</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  msg += `<b>🆔 الإعلان:</b> ${escapeHTML(data.productId)}\n`;
  msg += `<b>📦 العنوان:</b> ${escapeHTML(data.productTitle)}\n\n`;

  msg += `<b>👤 المُبلِّغ:</b> ${escapeHTML(data.reporterName)}\n`;
  if (data.reporterPhone) {
    msg += `<b>📱 الهاتف:</b> ${escapeHTML(data.reporterPhone)}\n`;
  }

  msg += `\n⏰ ${new Date().toLocaleString('ar-IQ')}`;
  return msg;
}

/* ===== طلب حذف ===== */
function formatDeleteRequest(data) {
  let msg = `<b>🗑️ طلب حذف إعلان</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  msg += `<b>🆔 الإعلان:</b> ${escapeHTML(data.productId)}\n`;
  msg += `<b>📦 العنوان:</b> ${escapeHTML(data.productTitle)}\n\n`;

  msg += `<b>👤 صاحب الإعلان:</b> ${escapeHTML(data.ownerName)}\n`;
  msg += `<b>📱 الهاتف:</b> ${escapeHTML(data.ownerPhone)}\n\n`;

  if (data.reason) {
    msg += `<b>📝 السبب:</b>\n${escapeHTML(data.reason)}\n\n`;
  }

  msg += `⏰ ${new Date().toLocaleString('ar-IQ')}`;
  return msg;
}
