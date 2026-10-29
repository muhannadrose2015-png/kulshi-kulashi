/* ==========================================
   Cloudflare Function - طلب ترقية إعلان / اشتراك
   المسار: /api/promote
   Body: { type, userId, userName, userPhone, orderCode, orderTitle, receiptInfo }
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
        error: 'تليجرام غير معد'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { type, userId, userName, userPhone, orderCode, orderTitle, receiptInfo } = body;

    if (!type || !userId || !userName) {
      return new Response(JSON.stringify({
        success: false,
        error: 'البيانات ناقصة'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const isSubscribe = type === 'subscribe';
    const isPromote = type === 'promote_ad';

    if (!isSubscribe && !isPromote) {
      return new Response(JSON.stringify({
        success: false,
        error: 'نوع الطلب غير مدعوم'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ===== تنسيق الرسالة =====
    let msg = '';
    let callbackData = '';

    if (isPromote) {
      if (!orderCode) {
        return new Response(JSON.stringify({
          success: false,
          error: 'كود الطلب مفقود'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      msg = `<b>⭐ طلب ترقية إعلان</b>\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
      msg += `<b>📦 الإعلان:</b> ${escapeHTML(orderTitle || 'غير محدد')}\n`;
      msg += `<b>🆔 الكود:</b> <code>${escapeHTML(orderCode)}</code>\n\n`;
      msg += `<b>👤 المستخدم:</b> ${escapeHTML(userName)}\n`;
      msg += `<b>📱 الهاتف:</b> ${escapeHTML(userPhone || '')}\n`;
      msg += `<b>🆔 userId:</b> <code>${escapeHTML(userId)}</code>\n\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `<b>💰 المبلغ:</b> 2,000 د.ع\n`;
      msg += `<b>⏱️ المدة:</b> 10 أيام\n\n`;

      if (receiptInfo) {
        msg += `<b>📋 معلومات الإيصال:</b>\n${escapeHTML(receiptInfo)}\n\n`;
      }

      msg += `⏰ ${new Date().toLocaleString('ar-IQ')}\n\n`;
      msg += `<b>تحقق من استلام الدفع ثم اختر:</b>`;

      callbackData = `promote_${orderCode}`;
    } else {
      msg = `<b>💎 طلب اشتراك شهري</b>\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
      msg += `<b>👤 المستخدم:</b> ${escapeHTML(userName)}\n`;
      msg += `<b>📱 الهاتف:</b> ${escapeHTML(userPhone || '')}\n`;
      msg += `<b>🆔 userId:</b> <code>${escapeHTML(userId)}</code>\n\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `<b>💰 المبلغ:</b> 15,000 د.ع\n`;
      msg += `<b>⏱️ المدة:</b> 30 يوم\n\n`;

      if (receiptInfo) {
        msg += `<b>📋 معلومات الإيصال:</b>\n${escapeHTML(receiptInfo)}\n\n`;
      }

      msg += `⏰ ${new Date().toLocaleString('ar-IQ')}\n\n`;
      msg += `<b>تحقق من استلام الدفع ثم اختر:</b>`;

      // نستخدم userId بدل phone
      callbackData = `subscribe_${userId}`;
    }

    // ===== أزرار =====
    const replyMarkup = {
      inline_keyboard: [
        [
          { text: '✅ تأكيد الدفع', callback_data: `approve_${callbackData}` },
          { text: '❌ رفض', callback_data: `reject_${callbackData}` }
        ]
      ]
    };

    // ===== إرسال إلى تليجرام =====
    const tgResponse = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text: msg,
          parse_mode: 'HTML',
          reply_markup: replyMarkup
        })
      }
    );

    const tgData = await tgResponse.json();

    if (!tgData.ok) {
      throw new Error(tgData.description || 'فشل الإرسال لتليجرام');
    }

    return new Response(JSON.stringify({
      success: true,
      messageId: tgData.result.message_id
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error('Promote error:', e);
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
