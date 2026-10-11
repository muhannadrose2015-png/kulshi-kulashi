/* ==========================================
   sold-reminder.js - تذكير "هل تم البيع؟"
   ========================================== */

const SoldReminder = {

  STORAGE_KEY: 'kk_asked_about_sold',
  MIN_DAYS_OLD: 5, // الحد الأدنى: 5 أيام من النشر
  MIN_INTERVAL_HOURS: 4, // لا نُذكّر أكثر من مرة كل 4 ساعات

  /* ===== فحص عند فتح الموقع ===== */
  async check() {
    // 1. تجاهل الزوار
    const user = KK.getUser();
    if (!user || !user.name) return;

    // 2. تجاهل الصفحات غير المناسبة
    const path = window.location.pathname;
    const excludedPages = ['/add.html', '/track.html', '/about.html', '/contact.html'];
    if (excludedPages.some(p => path.includes(p))) return;

    // 3. لا نُذكّر إذا ذكّرنا قريباً
    const lastTime = parseInt(localStorage.getItem('kk_reminder_time') || '0');
    const hoursSince = (Date.now() - lastTime) / (1000 * 60 * 60);
    if (hoursSince < this.MIN_INTERVAL_HOURS) return;

    // 4. جلب الإعلانات المنشورة
    const orders = KK.getMyOrders();
    const published = orders.filter(o =>
      o.status === 'approved' &&
      !o.sold &&
      o.publishedAt // يوجد تاريخ نشر
    );

    if (published.length === 0) return;

    // 5. فلترة الإعلانات التي مضى عليها 7 أيام
    const now = Date.now();
    const oldAds = published.filter(o => {
      const pubDate = new Date(o.publishedAt || o.submittedAt);
      const daysOld = (now - pubDate) / (1000 * 60 * 60 * 24);
      return daysOld >= this.MIN_DAYS_OLD;
    });

    if (oldAds.length === 0) return;

    // 6. استبعاد الإعلانات التي سُئل عنها مؤخراً
    const askedList = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}');
    
    // البحث عن إعلان لم نسأل عنه في آخر 14 يوم
    const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;
    const candidates = oldAds.filter(ad => {
      const askedAt = askedList[ad.code];
      if (!askedAt) return true;
      return (now - askedAt) > TWO_WEEKS;
    });

    // إذا لم يوجد، نأخذ الأقدم من الكل
    const pool = candidates.length > 0 ? candidates : oldAds;

    // 7. الاختيار: الأقدم
    pool.sort((a, b) => {
      const dateA = new Date(a.publishedAt || a.submittedAt);
      const dateB = new Date(b.publishedAt || b.submittedAt);
      return dateA - dateB;
    });

    const chosen = pool[0];

    // 8. عرض النافذة بعد 3 ثوانٍ
    setTimeout(() => {
      this.showReminder(chosen);
    }, 3000);
  },

  /* ===== عرض النافذة ===== */
  showReminder(order) {
    // لا نُعرض إذا كانت نافذة موجودة
    if (document.getElementById('soldReminderBanner')) return;

    const daysSince = Math.floor(
      (Date.now() - new Date(order.publishedAt || order.submittedAt)) / (1000 * 60 * 60 * 24)
    );

    const img = (order.images && order.images[0])
      ? order.images[0]
      : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23f0f0f0" width="100" height="100"/><text x="50" y="55" font-size="30" text-anchor="middle" fill="%23999">📷</text></svg>';

    const banner = document.createElement('div');
    banner.id = 'soldReminderBanner';
    banner.className = 'sold-reminder-banner';
    banner.innerHTML = `
      <div class="sold-reminder-close" onclick="SoldReminder.dismiss('${order.code}')">✕</div>

      <div class="sold-reminder-header">
        <div class="sold-reminder-title">🛒 هل تم بيع هذا المنتج؟</div>
        <div class="sold-reminder-subtitle">إعلان منشور منذ ${daysSince} يوم</div>
      </div>

      <div class="sold-reminder-product">
        <img src="${img}" class="sold-reminder-img" alt="${App.escapeHTML(order.title)}">
        <div class="sold-reminder-info">
          <div class="sold-reminder-product-title">${App.escapeHTML(order.title)}</div>
          <div class="sold-reminder-product-price">${App.formatPrice(order.price, order.currency)}</div>
          <div class="sold-reminder-product-city">📍 ${App.escapeHTML(order.city || '')}</div>
        </div>
      </div>

      <div class="sold-reminder-actions">
        <button class="sold-reminder-btn-sold" onclick="SoldReminder.markSold('${order.code}')">
          ✅ نعم، تم البيع
        </button>
        <button class="sold-reminder-btn-available" onclick="SoldReminder.stillAvailable('${order.code}')">
          ❌ لا، لا يزال متوفراً
        </button>
      </div>

      <div class="sold-reminder-hint">
        💡 "تم البيع" يُخفي الإعلان بعد 7 أيام
      </div>
    `;

    document.body.appendChild(banner);

    // تأثير الظهور
    setTimeout(() => banner.classList.add('show'), 50);

    // حفظ الوقت
    localStorage.setItem('kk_reminder_time', Date.now().toString());
  },

  /* ===== تسجيل أن المستخدم أُجاب ===== */
  recordAsked(orderCode) {
    const asked = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}');
    asked[orderCode] = Date.now();
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(asked));
  },

  /* ===== المستخدم قال "تم البيع" ===== */
  async markSold(orderCode) {
    const user = KK.getUser();
    if (!user) return;

    // إخفاء النافذة مؤقتاً
    this.hideBanner();

    const confirmed = await this.showConfirmDialog({
      title: '✅ تأكيد البيع',
      message: 'هل أنت متأكد أن هذا المنتج تم بيعه؟\n\nسيظهر "تم البيع" على الإعلان',
      confirmText: '✅ نعم، تم البيع',
      cancelText: 'تراجع',
      type: 'success'
    });

    if (!confirmed) {
      // أعِد عرض النافذة
      this.showReminderAfterConfirm(orderCode);
      return;
    }

    App.toast('⏳ جارٍ التعليم...', 'info');

    try {
      const response = await fetch('/api/mark-sold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: orderCode,
          userPhone: user.phone,
          action: 'mark'
        })
      });

      const data = await response.json();

      if (data.success) {
        // تحديث LocalStorage
        const orders = KK.getMyOrders();
        const order = orders.find(o => o.code === orderCode);
        if (order) {
          order.sold = true;
          order.soldAt = new Date().toISOString();
          localStorage.setItem(KK.KEYS.MY_ORDERS, JSON.stringify(orders));
        }

        this.recordAsked(orderCode);
        App.toast('✅ تم تعليم الإعلان كمباع', 'success');
      } else {
        App.toast('❌ ' + (data.error || 'فشل التعليم'), 'error');
      }
    } catch (e) {
      console.error('Mark sold error:', e);
      App.toast('❌ فشل الاتصال', 'error');
    }
  },

  /* ===== المستخدم قال "لا يزال متوفراً" ===== */
  stillAvailable(orderCode) {
    this.recordAsked(orderCode);
    this.hideBanner();
    App.toast('👍 شكراً لك', 'success');
  },

  /* ===== رفض (X) ===== */
  dismiss(orderCode) {
    this.recordAsked(orderCode);
    this.hideBanner();
  },

  /* ===== إخفاء النافذة ===== */
  hideBanner() {
    const banner = document.getElementById('soldReminderBanner');
    if (banner) {
      banner.classList.remove('show');
      setTimeout(() => banner.remove(), 400);
    }
  },

  /* ===== إعادة عرض النافذة (بعد تراجع) ===== */
  async showReminderAfterConfirm(orderCode) {
    const orders = KK.getMyOrders();
    const order = orders.find(o => o.code === orderCode);
    if (!order) return;
    this.showReminder(order);
  },

  /* ===== نافذة تأكيد ===== */
  showConfirmDialog({ title, message, confirmText, cancelText, type }) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.onclick = (e) => { if (e.target === modal) { modal.remove(); resolve(false); } };

      modal.innerHTML = `
        <div class="modal-box" style="text-align:center;">
          <div style="background:#e8f5e9;color:#2e7d32;padding:20px;border-radius:12px;margin-bottom:15px;">
            <div style="font-size:40px;margin-bottom:10px;">✅</div>
            <div style="font-weight:bold;font-size:16px;margin-bottom:8px;">${title}</div>
            <div style="font-size:13px;line-height:1.7;white-space:pre-line;">${message}</div>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-secondary" style="flex:1;background:#e7e9ec;color:#232f3e;padding:12px;border:none;border-radius:8px;font-family:inherit;font-weight:bold;cursor:pointer;" onclick="this.closest('.modal-overlay').remove(); window.__reminderResolver(false);">
              ${cancelText || 'إلغاء'}
            </button>
            <button class="btn" style="flex:2;background:#4caf50;color:white;padding:12px;border:none;border-radius:8px;font-family:inherit;font-weight:bold;cursor:pointer;" onclick="this.closest('.modal-overlay').remove(); window.__reminderResolver(true);">
              ${confirmText || 'موافق'}
            </button>
          </div>
        </div>
      `;

      window.__reminderResolver = (result) => {
        resolve(result);
        delete window.__reminderResolver;
      };

      document.body.appendChild(modal);
    });
  }
};

window.SoldReminder = SoldReminder;

/* ===== تشغيل تلقائي عند تحميل الصفحة ===== */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => SoldReminder.check(), 2000);
  });
} else {
  setTimeout(() => SoldReminder.check(), 2000);
}
