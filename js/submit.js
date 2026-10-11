/* ==========================================
   submit.js - منطق إرسال الإعلان
   ========================================== */

const Submit = {

  /* إرسال إعلان جديد */
  async submitAd(event) {
    event.preventDefault();

    const btn = document.getElementById('submitBtn');
    const errorEl = document.getElementById('formError');

    errorEl.textContent = '';
    errorEl.style.display = 'none';

    // ===== جمع البيانات =====
    const title = document.getElementById('adTitle').value.trim();
    const category = document.getElementById('adCategory').value;
    const price = document.getElementById('adPrice').value.trim();
    const currency = document.getElementById('adCurrency').value;
    const whatsapp = document.getElementById('adWhatsapp').value.trim();
    const city = document.getElementById('adCity').value.trim();
    const description = document.getElementById('adDescription').value.trim();

    // ===== التحقق =====
    if (title.length < 5) return this.showError('العنوان قصير جداً (5 أحرف على الأقل)');
    if (title.length > 100) return this.showError('العنوان طويل جداً (100 حرف كحد أقصى)');
    if (!category) return this.showError('اختر الصنف');
    if (!price || Number(price) <= 0) return this.showError('أدخل سعراً صحيحاً');
    if (!whatsapp) return this.showError('أدخل رقم الواتساب');

    const cleanWhatsapp = whatsapp.replace(/[^0-9]/g, '');
    if (cleanWhatsapp.length < 10) return this.showError('رقم الواتساب غير صحيح');
    if (!city) return this.showError('أدخل المدينة');
    if (description.length < 10) return this.showError('الوصف قصير جداً (10 أحرف على الأقل)');
    if (description.length > 2000) return this.showError('الوصف طويل جداً (2000 حرف كحد أقصى)');

    // ===== فحص الكلمات المحظورة =====
    const contentCheck = Ban.validateContent(title + ' ' + description);
    if (!contentCheck.ok) return this.showError(contentCheck.message);

    // ===== فحص المستخدم =====
    const user = KK.getUser();
    if (!user) return this.showError('يجب تسجيل الدخول أولاً');

    // ===== فحص عدد الصور =====
    if (Uploader.count() === 0) return this.showError('أضف صورة واحدة على الأقل');

    // ===== تعطيل الزر =====
    btn.disabled = true;
    btn.textContent = '⏳ جارٍ الفحص...';

    try {
      /* ===== المرحلة 1: فحص الحد الأسبوعي ===== */
      const quotaCheck = await this.checkQuota(user.phone);

      if (!quotaCheck.success) {
        throw new Error(quotaCheck.error || 'فشل فحص الحد');
      }

      if (quotaCheck.remaining === 0) {
        this.showQuotaExceeded(quotaCheck);
        btn.disabled = false;
        btn.textContent = '📤 إرسال الإعلان للمراجعة';
        return;
      }

      /* ===== المرحلة 2: رفع الصور ===== */
      btn.textContent = '⏳ جارٍ رفع الصور...';
      const imageUrls = await Uploader.uploadAll();

      if (imageUrls.length === 0) {
        throw new Error('فشل رفع الصور، حاول مرة أخرى');
      }

      /* ===== المرحلة 3: توليد كود الطلب ===== */
      const orderCode = App.generateOrderCode();

      /* ===== المرحلة 4: تحضير البيانات ===== */
      const categoryName = await Products.getCategoryName(category);

      const adData = {
        orderCode: orderCode,
        ownerName: user.name,
        ownerPhone: user.phone,
        whatsapp: cleanWhatsapp,
        city: city,
        category: category,
        categoryName: categoryName,
        title: title,
        price: Number(price),
        currency: currency,
        description: description,
        images: imageUrls,
        isFeatured: false
      };

      /* ===== المرحلة 5: الإرسال إلى تليجرام ===== */
      btn.textContent = '⏳ جارٍ الإرسال...';
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'new_ad',
          data: adData
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'فشل الإرسال إلى الإدارة');
      }

      /* ===== المرحلة 6: استهلاك نقطة من الحد ===== */
      await this.consumeQuota(user.phone, orderCode);

      /* ===== المرحلة 7: حفظ الطلب محلياً ===== */
      KK.addMyOrder({
        code: orderCode,
        title: title,
        category: category,
        categoryName: categoryName,
        price: Number(price),
        currency: currency,
        description: description,
        city: city,
        images: imageUrls,
        status: 'pending',
        submittedAt: new Date().toISOString()
      });

      /* ===== المرحلة 8: عرض النجاح ===== */
      this.showSuccess(orderCode, quotaCheck);

    } catch (e) {
      console.error('Submit error:', e);
      this.showError(e.message || 'حدث خطأ غير متوقع');
      btn.disabled = false;
      btn.textContent = '📤 إرسال الإعلان للمراجعة';
      Uploader.hideProgress();
    }
  },

  /* فحص الحد الأسبوعي */
  async checkQuota(phone) {
    try {
      const response = await fetch('/api/user-quota?phone=' + encodeURIComponent(phone));
      const data = await response.json();
      return data;
    } catch (e) {
      console.error('Quota check error:', e);
      // إذا فشل الفحص → نسمح بالمرور (تجربة أفضل)
      return { success: true, remaining: 999, used: 0, limit: 7, isPremium: false };
    }
  },

  /* استهلاك نقطة */
  async consumeQuota(phone, orderCode) {
    try {
      const response = await fetch('/api/consume-quota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, orderCode })
      });
      const data = await response.json();
      return data;
    } catch (e) {
      console.error('Consume quota error:', e);
      return { success: false };
    }
  },

  /* عرض رسالة "تجاوزت الحد" */
  showQuotaExceeded(quotaInfo) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    modal.innerHTML = `
      <div class="modal-box" style="text-align:center;">
        <div style="font-size:60px; margin-bottom:15px;">⏰</div>
        <h2 style="color:#232f3e; margin-bottom:10px; font-size:20px;">وصلت للحد الأسبوعي</h2>
        <p style="color:#666; font-size:14px; line-height:1.7; margin-bottom:20px;">
          يمكنك نشر <strong>7 إعلانات مجاناً</strong> كل أسبوع<br>
          <span style="color:#999; font-size:12px;">(الأحد → السبت)</span>
        </p>

        <div style="background:#fff9f0; border:2px dashed #ff9900; border-radius:12px; padding:18px; margin-bottom:20px; text-align:right;">
          <div style="font-weight:bold; color:#856404; margin-bottom:10px;">💎 الباقة المميزة</div>
          <div style="font-size:13px; color:#666; line-height:1.8;">
            ✅ إعلانات غير محدودة<br>
            ✅ إعلانات مميزة بخصم<br>
            ✅ شارة "متجر موثّق"<br>
            ✅ دعم مباشر
          </div>
          <div style="text-align:center; margin-top:12px;">
            <div style="font-size:24px; font-weight:bold; color:#ff9900;">15,000 د.ع</div>
            <div style="font-size:12px; color:#999;">شهرياً</div>
          </div>
        </div>

        <button class="btn btn-primary btn-full" onclick="Submit.contactForPremium(); this.closest('.modal-overlay').remove();" style="margin-bottom:8px;">
          📞 اشترك الآن
        </button>
        <button class="btn btn-secondary btn-full" onclick="this.closest('.modal-overlay').remove()">
          إغلاق
        </button>
      </div>
    `;

    document.body.appendChild(modal);
  },

  /* التواصل للاشتراك */
  contactForPremium() {
    const user = KK.getUser();
    const message = `مرحباً، أرغب بالاشتراك في الباقة المميزة لموقع كلشي كلاشي.%0A%0A` +
      `👤 الاسم: ${encodeURIComponent(user?.name || 'غير محدد')}%0A` +
      `📱 الهاتف: ${encodeURIComponent(user?.phone || '')}%0A%0A` +
      `أرجو إعلامي بطريقة الدفع.`;

    window.open(`https://wa.me/9647856761412?text=${message}`, '_blank');
  },

  /* عرض خطأ */
  showError(message) {
    const errorEl = document.getElementById('formError');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },

  /* عرض نجاح */
  showSuccess(orderCode, quotaInfo) {
    const formEl = document.getElementById('adForm');
    const successEl = document.getElementById('successScreen');

    formEl.style.display = 'none';
    successEl.style.display = 'block';

    const remaining = quotaInfo?.remaining;
    const remainingText = (remaining === 'unlimited')
      ? '♾️ غير محدود'
      : (typeof remaining === 'number' ? Math.max(0, remaining - 1) : '?');

    successEl.innerHTML = `
      <div class="success-box">
        <div class="success-icon">✅</div>
        <h2>تم استلام إعلانك بنجاح!</h2>
        <p>سيتم مراجعته ونشره تلقائياً خلال <strong>20 دقيقة</strong><br>
        <span style="font-size:12px;color:#999;">إذا لم يُرفض من الإدارة</span></p>

        <div class="order-code-box">
          <div class="order-code-label">رقم طلبك:</div>
          <div class="order-code">${orderCode}</div>
          <div class="order-code-hint">احفظ هذا الرقم لمتابعة حالة إعلانك</div>
        </div>

        ${remainingText !== '?' ? `
          <div style="background:#f0f2f5; border-radius:10px; padding:12px; margin-bottom:15px; text-align:center;">
            <div style="font-size:12px; color:#666;">المتبقي من حدك الأسبوعي</div>
            <div style="font-size:20px; font-weight:bold; color:#ff9900; margin-top:5px;">${remainingText}</div>
          </div>
        ` : ''}

        <div class="success-actions">
          <a href="/my-ads.html" class="btn btn-primary">📋 عرض إعلاناتي</a>
          <a href="/add.html" class="btn btn-secondary" onclick="location.reload(); return false;">➕ إضافة إعلان آخر</a>
          <a href="/" class="btn btn-secondary">🏠 الرئيسية</a>
        </div>
      </div>
    `;

    Uploader.hideProgress();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  /* حذف إعلان */
  async deleteOrder(orderCode) {
    const orders = KK.getMyOrders();
    const order = orders.find(o => o.code === orderCode);
    if (!order) {
      App.toast('لم يتم العثور على الطلب', 'error');
      return;
    }

    const statusText = order.status === 'approved'
      ? 'هذا الإعلان منشور في الموقع. هل تريد إرسال طلب حذفه؟\n\n(سيُحذف من جهازك فوراً، لكن سيحتاج وقتاً ليُحذف من الموقع)'
      : 'هل تريد حذف هذا الإعلان؟\n\n⚠️ لن يعود لك النقطة المستهلكة من الحد الأسبوعي';

    if (!confirm(statusText)) return;

    this.removeOrderLocally(orderCode);

    try {
      const user = KK.getUser();
      await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_request',
          data: {
            productId: order.code,
            productTitle: order.title,
            ownerName: user ? user.name : '',
            ownerPhone: user ? user.phone : '',
            status: order.status,
            reason: order.status === 'approved' ? 'إعلان منشور - يحتاج حذف من ads.json' : 'إعلان قيد المراجعة'
          }
        })
      });
    } catch (e) {
      console.error('فشل إرسال الإشعار:', e);
    }

    App.toast('✅ تم حذف الإعلان', 'success');

    if (typeof renderMyAds === 'function') {
      setTimeout(() => renderMyAds(), 300);
    }
  },

  removeOrderLocally(orderCode) {
    const orders = KK.getMyOrders();
    const filtered = orders.filter(o => o.code !== orderCode);
    localStorage.setItem(KK.KEYS.MY_ORDERS, JSON.stringify(filtered));
  },

  /* طلب حذف من صفحة المنتج */
  async requestDelete(productId, productTitle) {
    const user = KK.getUser();
    if (!user) {
      App.toast('يجب تسجيل الدخول', 'error');
      return;
    }

    const reason = prompt('ما سبب طلب حذف الإعلان؟ (اختياري)');
    if (reason === null) return;

    try {
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_request',
          data: {
            productId: productId,
            productTitle: productTitle,
            ownerName: user.name,
            ownerPhone: user.phone,
            reason: reason || ''
          }
        })
      });

      const result = await response.json();

      if (result.success) {
        App.toast('✅ تم إرسال طلب الحذف', 'success');
      } else {
        App.toast('❌ ' + (result.error || 'فشل الإرسال'), 'error');
      }
    } catch (e) {
      App.toast('❌ فشل الإرسال', 'error');
    }
  }
};

window.Submit = Submit;
