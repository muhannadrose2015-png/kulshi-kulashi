/* ==========================================
   Cloudflare Function - Telegram Webhook
   المسار: /api/webhook
   يستقبل ضغطات الأزرار من تليجرام
   ========================================== */

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response('OK', { status: 200 });
  }

  try {
    const update = await request.json();

    if (!update.callback_query) {
      return new Response('OK', { status: 200 });
    }

    const callbackQuery = update.callback_query;
    const data = callbackQuery.data || '';
    const callbackId = callbackQuery.id;
    const messageId = callbackQuery.message.message_id;
    const chatId = callbackQuery.message.chat.id;

    // ===== موافقة =====
    if (data.startsWith('approve_')) {
      const orderCode = data.replace('approve_', '');
      await handleApprove(orderCode, callbackId, messageId, chatId, env);
    }
    // ===== رفض =====
    else if (data.startsWith('reject_')) {
      const orderCode = data.replace('reject_', '');
      await handleReject(orderCode, callbackId, messageId, chatId, env);
    }
    // ===== حذف الإعلان (من إبلاغ) =====
    else if (data.startsWith('delete_ad_')) {
      const productId = data.replace('delete_ad_', '');
      await handleDeleteAd(productId, callbackId, messageId, chatId, env);
    }
    // ===== تجاهل الإبلاغ =====
    else if (data.startsWith('dismiss_report_')) {
      const productId = data.replace('dismiss_report_', '');
      await handleDismissReport(productId, callbackId, messageId, chatId, env);
    }
    // ===== موافقة على حذف إعلان (من صاحب الإعلان) =====
    else if (data.startsWith('confirm_delete_')) {
      const productId = data.replace('confirm_delete_', '');
      await handleDeleteAd(productId, callbackId, messageId, chatId, env);
    }

    return new Response('OK', { status: 200 });

  } catch (e) {
    console.error('Webhook error:', e);
    return new Response('OK', { status: 200 });
  }
}

/* ==========================================
   الموافقة على نشر إعلان
   ========================================== */
async function handleApprove(orderCode, callbackId, messageId, chatId, env) {
  try {
    if (!env.VIEWS_KV) {
      await answerCallback(env, callbackId, '❌ خطأ: KV غير مربوط');
      return;
    }

    const key = `pending_ad:${orderCode}`;
    const adRaw = await env.VIEWS_KV.get(key);

    if (!adRaw) {
      await answerCallback(env, callbackId, '❌ الإعلان غير موجود');
      await editMessage(env, chatId, messageId, '❌ لم يتم العثور على الإعلان في المخزن', null);
      return;
    }

    const adData = JSON.parse(adRaw);

    // قراءة ads.json
    const repoFile = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/data/ads.json`;

    const getResponse = await fetch(repoFile, {
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'User-Agent': 'Kulshi-Kulashi',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!getResponse.ok) throw new Error('فشل قراءة ads.json');

    const fileData = await getResponse.json();
    const currentSha = fileData.sha;

    const currentContent = JSON.parse(
      decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, ''))))
    );

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

    await env.VIEWS_KV.delete(key);

    await editMessage(
      env,
      chatId,
      messageId,
      '✅ <b>تم النشر بنجاح!</b>\n\nالإعلان أصبح ظاهراً في الموقع.',
      null
    );

    await answerCallback(env, callbackId, '✅ تم النشر');

  } catch (e) {
    console.error('Approve error:', e);
    await answerCallback(env, callbackId, '❌ فشل: ' + e.message);
  }
}

/* ==========================================
   رفض إعلان
   ========================================== */
async function handleReject(orderCode, callbackId, messageId, chatId, env) {
  try {
    if (env.VIEWS_KV) {
      await env.VIEWS_KV.delete(`pending_ad:${orderCode}`);
    }

    await editMessage(
      env,
      chatId,
      messageId,
      '❌ <b>تم رفض الإعلان</b>\n\nتم حذفه من قائمة الانتظار.',
      null
    );

    await answerCallback(env, callbackId, '❌ تم الرفض');

  } catch (e) {
    console.error('Reject error:', e);
    await answerCallback(env, callbackId, '❌ فشل: ' + e.message);
  }
}

/* ==========================================
   حذف إعلان من ads.json
   ========================================== */
async function handleDeleteAd(productId, callbackId, messageId, chatId, env) {
  try {
    // قراءة ads.json
    const repoFile = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/data/ads.json`;

    const getResponse = await fetch(repoFile, {
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'User-Agent': 'Kulshi-Kulashi',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!getResponse.ok) throw new Error('فشل قراءة ads.json');

    const fileData = await getResponse.json();
    const currentSha = fileData.sha;

    const currentContent = JSON.parse(
      decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, ''))))
    );

    // فلترة الإعلان المحذوف
    const filtered = currentContent.filter(ad => String(ad.id) !== String(productId));
    const wasFound = filtered.length < currentContent.length;

    if (!wasFound) {
      await editMessage(
        env,
        chatId,
        messageId,
        '⚠️ <b>الإعلان غير موجود</b>\n\nربما تم حذفه مسبقاً.',
        null
      );
      await answerCallback(env, callbackId, '⚠️ غير موجود');
      return;
    }

    const newContent = JSON.stringify(filtered, null, 2);
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
        message: `Delete ad ${productId}`,
        content: encodedContent,
        sha: currentSha,
        branch: 'main'
      })
    });

    if (!putResponse.ok) {
      const errData = await putResponse.json();
      throw new Error(errData.message || 'فشل الحذف');
    }

    await editMessage(
      env,
      chatId,
      messageId,
      '🗑️ <b>تم حذف الإعلان بنجاح!</b>\n\nتمت إزالته من الموقع.',
      null
    );

    await answerCallback(env, callbackId, '✅ تم الحذف');

  } catch (e) {
    console.error('Delete error:', e);
    await answerCallback(env, callbackId, '❌ فشل: ' + e.message);
  }
}

/* ==========================================
   تجاهل الإبلاغ
   ========================================== */
async function handleDismissReport(productId, callbackId, messageId, chatId, env) {
  try {
    await editMessage(
      env,
      chatId,
      messageId,
      '✅ <b>تم تجاهل الإبلاغ</b>\n\nالإعلان يبقى كما هو.',
      null
    );
    await answerCallback(env, callbackId, '✅ تم التجاهل');
  } catch (e) {
    console.error('Dismiss error:', e);
    await answerCallback(env, callbackId, '❌ فشل');
  }
}

/* ==========================================
   أدوات مساعدة
   ========================================== */

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
