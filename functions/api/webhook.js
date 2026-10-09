/* ==========================================
   Cloudflare Function - Telegram Webhook
   المسار: /api/webhook
   يستقبل ضغطات الأزرار من تليجرام (موافقة/رفض)
   ========================================== */

export async function onRequest(context) {
  const { request, env } = context;

  // تليجرام يرسل POST فقط
  if (request.method !== 'POST') {
    return new Response('OK', { status: 200 });
  }

  try {
    const update = await request.json();

    // فحص إذا كانت ضغطة زر
    if (!update.callback_query) {
      return new Response('OK', { status: 200 });
    }

    const callbackQuery = update.callback_query;
    const data = callbackQuery.data || '';
    const messageId = callbackQuery.message.message_id;
    const chatId = callbackQuery.message.chat.id;

    // ===== موافقة =====
    if (data.startsWith('approve_')) {
      const orderCode = data.replace('approve_', '');
      await handleApprove(orderCode, messageId, chatId, env);
    }
    // ===== رفض =====
    else if (data.startsWith('reject_')) {
      const orderCode = data.replace('reject_', '');
      await handleReject(orderCode, messageId, chatId, env);
    }

    // إجابة تليجرام (يجب أن نُجيب حتى لا تظهر رسالة "loading")
    return new Response('OK', { status: 200 });

  } catch (e) {
    console.error('Webhook error:', e);
    return new Response('OK', { status: 200 });
  }
}

/* ==========================================
   معالجة الموافقة
   ========================================== */
async function handleApprove(orderCode, messageId, chatId, env) {
  try {
    // 1. قراءة الإعلان من KV
    if (!env.VIEWS_KV) {
      await answerCallback(env, messageId, '❌ خطأ: KV غير مربوط');
      return;
    }

    const key = `pending_ad:${orderCode}`;
    const adRaw = await env.VIEWS_KV.get(key);

    if (!adRaw) {
      await answerCallback(env, messageId, '❌ لم يتم العثور على الإعلان (ربما انتهت صلاحيته)');
      await editMessage(env, chatId, messageId, '❌ لم يتم العثور على الإعلان في المخزن', null);
      return;
    }

    const adData = JSON.parse(adRaw);

    // 2. قراءة ads.json الحالي
    const repoFile = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/data/ads.json`;

    const getResponse = await fetch(repoFile, {
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'User-Agent': 'Kulshi-Kulashi',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!getResponse.ok) {
      throw new Error('فشل قراءة ads.json من GitHub');
    }

    const fileData = await getResponse.json();
    const currentSha = fileData.sha;

    // فك تشفير المحتوى
    const currentContent = JSON.parse(
      decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, ''))))
    );

    // 3. إضافة الإعلان الجديد
    const newAd = {
      id: `ad_${Date.now()}`,
      orderCode: orderCode,
      title: adData.title,
      category: adData.category,
      price: Number(adData.price),
      currency: adData.currency || 'IQD',
      description: adData.description,
      images: adData.images || [],
      city: adData.city,
      whatsapp: adData.whatsapp || adData.ownerPhone,
      ownerName: adData.ownerName,
      ownerPhone: adData.ownerPhone,
      status: 'active',
      views: 0,
      createdAt: new Date().toISOString(),
      publishedAt: new Date().toISOString()
    };

    currentContent.push(newAd);

    // 4. كتابة الملف الجديد
    const newContent = JSON.stringify(currentContent, null, 2);
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
        message: `Publish ad ${orderCode}`,
        content: encodedContent,
        sha: currentSha,
        branch: 'main'
      })
    });

    if (!putResponse.ok) {
      const errData = await putResponse.json();
      throw new Error(errData.message || 'فشل النشر');
    }

    // 5. حذف الإعلان من KV
    await env.VIEWS_KV.delete(key);

    // 6. تعديل الرسالة (إزالة الأزرار + إضافة علامة نجاح)
    await editMessage(
      env,
      chatId,
      messageId,
      '✅ <b>تم النشر بنجاح!</b>\n\nالإعلان أصبح ظاهراً في الموقع.',
      null
    );

    // 7. إشعار الإجابة
    await answerCallback(env, messageId, '✅ تم النشر');

  } catch (e) {
    console.error('Approve error:', e);
    await answerCallback(env, messageId, '❌ فشل: ' + e.message);
  }
}

/* ==========================================
   معالجة الرفض
   ========================================== */
async function handleReject(orderCode, messageId, chatId, env) {
  try {
    // حذف الإعلان من KV
    if (env.VIEWS_KV) {
      await env.VIEWS_KV.delete(`pending_ad:${orderCode}`);
    }

    // تعديل الرسالة
    await editMessage(
      env,
      chatId,
      messageId,
      '❌ <b>تم رفض الإعلان</b>\n\nتم حذفه من قائمة الانتظار.',
      null
    );

    await answerCallback(env, messageId, '❌ تم الرفض');

  } catch (e) {
    console.error('Reject error:', e);
    await answerCallback(env, messageId, '❌ فشل: ' + e.message);
  }
}

/* ==========================================
   أدوات مساعدة
   ========================================== */

/* الرد على callback (يجب أن يُنفذ خلال 10 ثوان) */
async function answerCallback(env, callbackQueryId, text) {
  try {
    await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text: text
        })
      }
    );
  } catch (e) {
    console.error('answerCallback error:', e);
  }
}

/* تعديل الرسالة (لإزالة الأزرار أو إضافة علامة) */
async function editMessage(env, chatId, messageId, newText, replyMarkup) {
  try {
    const body = {
      chat_id: chatId,
      message_id: messageId,
      text: newText,
      parse_mode: 'HTML'
    };

    if (replyMarkup) {
      body.reply_markup = replyMarkup;
    } else {
      body.reply_markup = { inline_keyboard: [] };
    }

    await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );
  } catch (e) {
    console.error('editMessage error:', e);
  }
}
