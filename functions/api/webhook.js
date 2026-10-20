/* ==========================================
   Cloudflare Function - Telegram Webhook
   المسار: /api/webhook
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

    const cq = update.callback_query;
    const data = cq.data || '';
    const callbackId = cq.id;
    const messageId = cq.message.message_id;
    const chatId = cq.message.chat.id;

    // ===== قبول/رفض إعلان جديد =====
    if (data.startsWith('approve_') && !data.includes('promote_') && !data.includes('subscribe_')) {
      const orderCode = data.replace('approve_', '');
      await handleApprove(orderCode, callbackId, messageId, chatId, env);
    }
    else if (data.startsWith('reject_') && !data.includes('promote_') && !data.includes('subscribe_')) {
      const orderCode = data.replace('reject_', '');
      await handleReject(orderCode, callbackId, messageId, chatId, env);
    }
    // ===== حذف إعلان من إبلاغ =====
    else if (data.startsWith('delete_ad_')) {
      const productId = data.replace('delete_ad_', '');
      await handleDeleteAd(productId, callbackId, messageId, chatId, env);
    }
    // ===== تجاهل إبلاغ =====
    else if (data.startsWith('dismiss_report_')) {
      const productId = data.replace('dismiss_report_', '');
      await handleDismissReport(productId, callbackId, messageId, chatId, env);
    }
    // ===== ترقية إعلان =====
    else if (data.startsWith('approve_promote_')) {
      const orderCode = data.replace('approve_promote_', '');
      await handleApprovePromote(orderCode, callbackId, messageId, chatId, env);
    }
    else if (data.startsWith('reject_promote_')) {
      const orderCode = data.replace('reject_promote_', '');
      await handleRejectAction('رفض الترقية', orderCode, callbackId, messageId, chatId, env);
    }
    // ===== اشتراك شهري =====
    else if (data.startsWith('approve_subscribe_')) {
      const phone = data.replace('approve_subscribe_', '');
      await handleApproveSubscribe(phone, callbackId, messageId, chatId, env);
    }
    else if (data.startsWith('reject_subscribe_')) {
      const phone = data.replace('reject_subscribe_', '');
      await handleRejectAction('رفض الاشتراك', phone, callbackId, messageId, chatId, env);
    }

    return new Response('OK', { status: 200 });

  } catch (e) {
    console.error('Webhook error:', e);
    return new Response('OK', { status: 200 });
  }
}

/* ===== الموافقة على نشر إعلان ===== */
async function handleApprove(orderCode, callbackId, messageId, chatId, env) {
  try {
    if (!env.VIEWS_KV) {
      await answerCallback(env, callbackId, '❌ KV غير مربوط');
      return;
    }

    const key = `pending_ad:${orderCode}`;
    const adRaw = await env.VIEWS_KV.get(key);

    if (!adRaw) {
      await answerCallback(env, callbackId, '❌ الإعلان غير موجود');
      await editMessage(env, chatId, messageId, '❌ لم يتم العثور على الإعلان', null);
      return;
    }

    const adData = JSON.parse(adRaw);
    await publishAdToGitHub(adData, env);
    await env.VIEWS_KV.delete(key);

    await editMessage(env, chatId, messageId,
      '✅ <b>تم النشر بنجاح!</b>\n\nالإعلان أصبح ظاهراً في الموقع.', null);
    await answerCallback(env, callbackId, '✅ تم النشر');

  } catch (e) {
    console.error('Approve error:', e);
    await answerCallback(env, callbackId, '❌ فشل: ' + e.message);
  }
}

/* ===== رفض إعلان ===== */
/* ===== رفض إعلان + حذف صوره ===== */
async function handleReject(orderCode, callbackId, messageId, chatId, env) {
  try {
    if (!env.VIEWS_KV) {
      await answerCallback(env, callbackId, '❌ KV غير مربوط');
      return;
    }

    // ===== 1. قراءة الإعلان من KV =====
    const key = `pending_ad:${orderCode}`;
    const adRaw = await env.VIEWS_KV.get(key);

    if (!adRaw) {
      await editMessage(env, chatId, messageId, '⚠️ الإعلان غير موجود (ربما حُذف)', null);
      await answerCallback(env, callbackId, '⚠️ غير موجود');
      return;
    }

    const adData = JSON.parse(adRaw);

    // ===== 2. حذف صور الإعلان =====
    const images = adData.images || [];
    let imagesDeleted = 0;

    for (const imageUrl of images) {
      try {
        const match = imageUrl.match(/raw\.githubusercontent\.com\/[^\/]+\/[^\/]+\/[^\/]+\/(.+)$/);
        if (!match || !match[1]) continue;

        const filePath = match[1];

        // الحصول على SHA
        const getFile = await fetch(
          `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${filePath}`,
          {
            headers: {
              'Authorization': `token ${env.GITHUB_TOKEN}`,
              'User-Agent': 'Kulshi-Kulashi',
              'Accept': 'application/vnd.github.v3+json'
            }
          }
        );

        if (!getFile.ok) continue;

        const fileInfo = await getFile.json();

        // حذف الملف
        const deleteRes = await fetch(
          `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${filePath}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `token ${env.GITHUB_TOKEN}`,
              'User-Agent': 'Kulshi-Kulashi',
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              message: `Delete rejected ad images ${orderCode}`,
              sha: fileInfo.sha,
              branch: 'main'
            })
          }
        );

        if (deleteRes.ok) imagesDeleted++;
      } catch (imgErr) {
        console.error('Image delete error:', imageUrl, imgErr);
      }
    }

    // ===== 3. حذف الإعلان من KV =====
    await env.VIEWS_KV.delete(key);

    // ===== 4. حفظ علامة الرفض في KV (للمستخدم) =====
    const rejectedKey = `rejected_ad:${orderCode}`;
    await env.VIEWS_KV.put(rejectedKey, JSON.stringify({
      orderCode: orderCode,
      title: adData.title,
      rejectedAt: new Date().toISOString(),
      reason: 'رفض من الإدارة'
    }), {
      expirationTtl: 60 * 60 * 24 * 30 // 30 يوم
    });

    // ===== 5. تعديل الرسالة =====
    const msg = `❌ <b>تم رفض الإعلان</b>\n\n` +
      `📦 ${escapeHTML(adData.title)}\n` +
      `🖼️ تم حذف ${imagesDeleted}/${images.length} صورة\n` +
      `📝 تم إعلام المستخدم بالرفض`;

    await editMessage(env, chatId, messageId, msg, null);
    await answerCallback(env, callbackId, `❌ تم الرفض (${imagesDeleted} صورة)`);

  } catch (e) {
    console.error('Reject error:', e);
    await answerCallback(env, callbackId, '❌ فشل: ' + e.message);
  }
}

/* ===== ترقية إعلان ===== */
async function handleApprovePromote(orderCode, callbackId, messageId, chatId, env) {
  try {
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
    const ads = JSON.parse(
      decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, ''))))
    );

    const adIndex = ads.findIndex(ad =>
      ad.orderCode === orderCode || String(ad.id) === String(orderCode)
    );

    if (adIndex === -1) {
      await answerCallback(env, callbackId, '❌ الإعلان غير موجود');
      await editMessage(env, chatId, messageId, '❌ الإعلان غير موجود في ads.json', null);
      return;
    }

    // تفعيل الترقية
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000); // 10 أيام

    ads[adIndex].isFeatured = true;
    ads[adIndex].featuredAt = now.toISOString();
    ads[adIndex].featuredUntil = expiresAt.toISOString();

    const newContent = JSON.stringify(ads, null, 2);
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
        message: `Feature ad ${orderCode} (10 days)`,
        content: encodedContent,
        sha: fileData.sha,
        branch: 'main'
      })
    });

    if (!putResponse.ok) {
      const errData = await putResponse.json();
      throw new Error(errData.message || 'فشل التحديث');
    }

    const until = expiresAt.toLocaleDateString('ar-IQ');
    await editMessage(env, chatId, messageId,
      `⭐ <b>تم تفعيل الترقية!</b>\n\nالإعلان الآن مميز لمدة 10 أيام\nحتى: ${until}`, null);
    await answerCallback(env, callbackId, '⭐ تم التفعيل');

  } catch (e) {
    console.error('Promote error:', e);
    await answerCallback(env, callbackId, '❌ فشل: ' + e.message);
  }
}

/* ===== تفعيل اشتراك ===== */
async function handleApproveSubscribe(phone, callbackId, messageId, chatId, env) {
  try {
    if (!env.VIEWS_KV) {
      await answerCallback(env, callbackId, '❌ KV غير مربوط');
      return;
    }

    const phoneHash = await hashString(phone);
    const premiumKey = `premium:${phoneHash}`;

    const now = new Date();
    const until = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 يوم

    await env.VIEWS_KV.put(premiumKey, JSON.stringify({
      phone: phone,
      activatedAt: now.toISOString(),
      until: until.toISOString()
    }), {
      expirationTtl: 60 * 60 * 24 * 60 // 60 يوم
    });

    const untilStr = until.toLocaleDateString('ar-IQ');
    await editMessage(env, chatId, messageId,
      `💎 <b>تم تفعيل الاشتراك!</b>\n\nالمستخدم الآن مشترك حتى: ${untilStr}\n\n` +
      `📱 الهاتف: ${escapeHTML(phone)}`, null);
    await answerCallback(env, callbackId, '💎 تم التفعيل');

  } catch (e) {
    console.error('Subscribe error:', e);
    await answerCallback(env, callbackId, '❌ فشل: ' + e.message);
  }
}

/* ===== رفض عام ===== */
async function handleRejectAction(actionText, id, callbackId, messageId, chatId, env) {
  await editMessage(env, chatId, messageId, `❌ <b>${actionText}</b>\n\n${escapeHTML(id)}`, null);
  await answerCallback(env, callbackId, '❌ تم الرفض');
}

/* ===== حذف إعلان ===== */
/* ===== حذف إعلان + صوره ===== */
async function handleDeleteAd(productId, callbackId, messageId, chatId, env) {
  try {
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
    const ads = JSON.parse(
      decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, ''))))
    );

    // ===== 1. البحث عن الإعلان المُراد حذفه =====
    const targetAd = ads.find(ad =>
      String(ad.id) === String(productId) || ad.orderCode === productId
    );

    if (!targetAd) {
      await editMessage(env, chatId, messageId, '⚠️ الإعلان غير موجود (ربما حُذف)', null);
      await answerCallback(env, callbackId, '⚠️ غير موجود');
      return;
    }

    // ===== 2. جمع صور الإعلان =====
    const imagesToDelete = (targetAd.images && Array.isArray(targetAd.images))
      ? targetAd.images
      : [];

    // ===== 3. حذف الصور من GitHub =====
    let imagesDeletedCount = 0;

    for (const imageUrl of imagesToDelete) {
      try {
        const match = imageUrl.match(/raw\.githubusercontent\.com\/[^\/]+\/[^\/]+\/[^\/]+\/(.+)$/);
        if (!match || !match[1]) continue;

        const filePath = match[1];

        // الحصول على SHA
        const getFile = await fetch(
          `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${filePath}`,
          {
            headers: {
              'Authorization': `token ${env.GITHUB_TOKEN}`,
              'User-Agent': 'Kulshi-Kulashi',
              'Accept': 'application/vnd.github.v3+json'
            }
          }
        );

        if (!getFile.ok) continue;

        const fileInfo = await getFile.json();

        // حذف الملف
        const deleteRes = await fetch(
          `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${filePath}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `token ${env.GITHUB_TOKEN}`,
              'User-Agent': 'Kulshi-Kulashi',
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              message: `Delete image ${filePath}`,
              sha: fileInfo.sha,
              branch: 'main'
            })
          }
        );

        if (deleteRes.ok) {
          imagesDeletedCount++;
        }
      } catch (imgErr) {
        console.error('Image delete error:', imageUrl, imgErr);
      }
    }

    // ===== 4. حذف الإعلان من ads.json =====
    const filtered = ads.filter(ad =>
      String(ad.id) !== String(productId) && ad.orderCode !== productId
    );

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
        message: `Delete ad ${productId} + ${imagesDeletedCount} images`,
        content: encodedContent,
        sha: fileData.sha,
        branch: 'main'
      })
    });

    if (!putResponse.ok) throw new Error('فشل الحذف');

    // ===== 5. تعديل رسالة تليجرام =====
    const successMsg = `🗑️ <b>تم حذف الإعلان بنجاح!</b>\n\n` +
      `📦 <b>العنوان:</b> ${escapeHTML(targetAd.title)}\n` +
      `🖼️ <b>الصور المحذوفة:</b> ${imagesDeletedCount}/${imagesToDelete.length}`;

    await editMessage(env, chatId, messageId, successMsg, null);
    await answerCallback(env, callbackId, `✅ تم الحذف (${imagesDeletedCount} صورة)`);

  } catch (e) {
    console.error('Delete ad error:', e);
    await answerCallback(env, callbackId, '❌ فشل: ' + e.message);
  }
}

/* ===== تجاهل إبلاغ ===== */
async function handleDismissReport(productId, callbackId, messageId, chatId, env) {
  await editMessage(env, chatId, messageId, '✅ <b>تم تجاهل الإبلاغ</b>', null);
  await answerCallback(env, callbackId, '✅ تم التجاهل');
}

/* ==========================================
   أدوات مساعدة
   ========================================== */

async function publishAdToGitHub(adData, env) {
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
  const ads = JSON.parse(
    decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, ''))))
  );

  const newAd = {
    id: `ad_${Date.now()}`,
    orderCode: adData.orderCode,
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
    sold: false,
    views: 0,
    isFeatured: adData.isFeatured || false,
    createdAt: new Date().toISOString(),
    publishedAt: new Date().toISOString()
  };

  ads.push(newAd);

  const newContent = JSON.stringify(ads, null, 2);
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
      message: `Publish ad ${adData.orderCode}`,
      content: encodedContent,
      sha: fileData.sha,
      branch: 'main'
    })
  });

  if (!putResponse.ok) {
    const errData = await putResponse.json();
    throw new Error(errData.message || 'فشل النشر');
  }

  return newAd;
}

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
  } catch (e) {}
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
  } catch (e) {}
}

async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str + 'kulshi_quota_salt_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
