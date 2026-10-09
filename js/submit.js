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
    btn.textContent = '⏳ جارٍ الإرسال...';

    try {
      /* ===== المرحلة 1: رفع الصور ===== */
      const imageUrls = await Uploader.uploadAll();

      if (imageUrls.length === 0) {
        throw new Error('فشل رفع الصور، حاول مرة أخرى');
      }

      /* ===== المرحلة 2: توليد كود الطلب ===== */
      const orderCode = App.generateOrderCode();

      /* ===== المرحلة 3: تحضير البيانات ===== */
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
        images: imageUrls
      };

      /* ===== المرحلة 4: الإرسال إلى تليجرام ===== */
// نُرسل البيانات الكاملة، وسيتولى الـ Function تخزينها في KV
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

      /* ===== المرحلة 5: حفظ الطلب محلياً ===== */
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

      /* ===== المرحلة 6: عرض النجاح ===== */
      this.showSuccess(orderCode);

    } catch (e) {
      console.error('Submit error:', e);
      this.showError(e.message || 'حدث خطأ غير متوقع');
      btn.disabled = false;
      btn.textContent = '📤 إرسال الإعلان للمراجعة';
      Uploader.hideProgress();
    }
  },

  /* عرض خطأ */
  showError(message) {
    const errorEl = document.getElementById('formError');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },

  /* عرض نجاح */
  showSuccess(orderCode) {
    const formEl = document.getElementById('adForm');
    const successEl = document.getElementById('successScreen');

    formEl.style.display = 'none';
    successEl.style.display = 'block';
    successEl.innerHTML = `
      <div class="success-box">
        <div class="success-icon">✅</div>
        <h2>تم استلام إعلانك بنجاح!</h2>
        <p>سيتم مراجعته من قبل الإدارة ونشره قريباً.</p>

        <div class="order-code-box">
          <div class="order-code-label">رقم طلبك:</div>
          <div class="order-code">${orderCode}</div>
          <div class="order-code-hint">احفظ هذا الرقم لمتابعة حالة إعلانك</div>
        </div>

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

  /* ==========================================
     حذف إعلان (من إعلاناتي)
     - يحذف الطلب من LocalStorage فوراً
     - يُرسل إشعار إلى تليجرام
     ========================================== */
  async deleteOrder(orderCode) {
    const orders = KK.getMyOrders();
    const order = orders.find(o => o.code === orderCode);
    if (!order) {
      App.toast('لم يتم العثور على الطلب', 'error');
      return;
    }

    // طلب تأكيد
    const statusText = order.status === 'approved'
      ? 'هذا الإعلان منشور في الموقع. هل تريد إرسال طلب حذفه؟\n\n(سيُحذف من جهازك فوراً، لكن سيحتاج وقتاً ليُحذف من الموقع)'
      : 'هل تريد حذف هذا الإعلان؟';

    if (!confirm(statusText)) return;

    // ===== 1. حذف محلي فوري =====
    this.removeOrderLocally(orderCode);

    // ===== 2. إرسال إشعار إلى تليجرام =====
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
      // لا نوقف الحذف المحلي في حال فشل الإشعار
      console.error('فشل إرسال الإشعار:', e);
    }

    // ===== 3. تحديث الواجهة =====
    App.toast('✅ تم حذف الإعلان', 'success');

    // إعادة تحميل قائمة الإعلانات إذا كنا في my-ads.html
    if (typeof renderMyAds === 'function') {
      setTimeout(() => renderMyAds(), 300);
    }
  },

  /* حذف الطلب من LocalStorage */
  removeOrderLocally(orderCode) {
    const orders = KK.getMyOrders();
    const filtered = orders.filter(o => o.code !== orderCode);
    localStorage.setItem(KK.KEYS.MY_ORDERS, JSON.stringify(filtered));
  },

  /* ==========================================
     طلب حذف من صفحة المنتج (للمشتري/الزائر)
     ========================================== */
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
