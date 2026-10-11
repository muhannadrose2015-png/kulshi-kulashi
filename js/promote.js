/* ==========================================
   promote.js - واجهة الترقية والاشتراك
   ========================================== */

const Promote = {

  /* رقم Qi Card للدفع */
  QI_CARD_NUMBER: '6274 1202 0000 0000', // ← استبدله برقم بطاقتك الحقيقي

  /* ==========================================
     ترقية إعلان
     ========================================== */
  async promoteAd(orderCode) {
    const user = KK.getUser();
    if (!user) {
      App.toast('يجب تسجيل الدخول', 'error');
      return;
    }

    const orders = KK.getMyOrders();
    const order = orders.find(o => o.code === orderCode);
    if (!order) {
      App.toast('لم يتم العثور على الإعلان', 'error');
      return;
    }

    if (order.status !== 'approved') {
      App.toast('يجب أن يكون الإعلان منشوراً أولاً', 'error');
      return;
    }

    if (order.isFeatured) {
      App.toast('الإعلان مميز مسبقاً', 'info');
      return;
    }

    this.showPromoteDialog(order);
  },

  showPromoteDialog(order) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    modal.innerHTML = `
      <div class="modal-box">
        <div class="modal-title">⭐ ترقية الإعلان</div>
        <div class="modal-subtitle">اجعل إعلانك مميزاً وأكثر ظهوراً</div>

        <div class="promote-info-box">
          <div class="promote-info-title">📦 ${App.escapeHTML(order.title)}</div>
          <div class="promote-info-price">
            <div class="promote-price-tag">2,000 د.ع</div>
            <div class="promote-price-duration">لمدة 10 أيام</div>
          </div>
        </div>

        <div class="promote-benefits">
          <div class="promote-benefit-item">✅ يظهر في الأعلى</div>
          <div class="promote-benefit-item">✅ إطار ذهبي مميز</div>
          <div class="promote-benefit-item">✅ شارة "⭐ مميز"</div>
          <div class="promote-benefit-item">✅ نشر أسرع (5 دقائق)</div>
        </div>

        <div class="payment-info">
          <div class="payment-info-title">💳 طريقة الدفع</div>
          <div class="payment-info-row">
            <span>Qi Card:</span>
            <span class="payment-number" id="promoteQiNumber">${this.QI_CARD_NUMBER}</span>
          </div>
          <div class="payment-info-row" style="font-size:12px;color:#999;">
            <span>أو عبر واتساب مع الإدارة</span>
          </div>
        </div>

        <label style="display:block;margin:12px 0 6px;font-weight:bold;font-size:13px;">
          رقم عملية التحويل (اختياري):
        </label>
        <input type="text" id="promoteReceipt" placeholder="مثال: 123456789" maxlength="50" style="width:100%;padding:10px;border:2px solid #e0e0e0;border-radius:8px;font-family:inherit;font-size:14px;outline:none;">

        <div style="display:flex;gap:8px;margin-top:15px;">
          <button class="btn btn-secondary" style="flex:1;" onclick="this.closest('.modal-overlay').remove()">
            إلغاء
          </button>
          <button class="btn btn-primary" style="flex:2;" onclick="Promote.submitPromote('${order.code}')">
            📤 إرسال طلب الترقية
          </button>
        </div>

        <p style="text-align:center;font-size:11px;color:#999;margin-top:12px;">
          ⚠️ سيتم التفعيل بعد التحقق من الدفع
        </p>
      </div>
    `;

    document.body.appendChild(modal);
  },

  async submitPromote(orderCode) {
    const user = KK.getUser();
    const orders = KK.getMyOrders();
    const order = orders.find(o => o.code === orderCode);
    if (!order || !user) return;

    const receiptInfo = document.getElementById('promoteReceipt')?.value.trim() || '';

    const btn = event.target;
    btn.disabled = true;
    btn.textContent = '⏳ جارٍ الإرسال...';

    try {
      const response = await fetch('/api/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'promote_ad',
          userPhone: user.phone,
          userName: user.name,
          orderCode: orderCode,
          orderTitle: order.title,
          receiptInfo: receiptInfo
        })
      });

      const data = await response.json();

      if (data.success) {
        document.querySelector('.modal-overlay')?.remove();
        this.showSuccess('promote');
      } else {
        App.toast('❌ ' + (data.error || 'فشل الإرسال'), 'error');
        btn.disabled = false;
        btn.textContent = '📤 إرسال طلب الترقية';
      }
    } catch (e) {
      App.toast('❌ فشل الاتصال', 'error');
      btn.disabled = false;
      btn.textContent = '📤 إرسال طلب الترقية';
    }
  },

  /* ==========================================
     الاشتراك الشهري
     ========================================== */
  async subscribe() {
    const user = KK.getUser();
    if (!user) {
      App.toast('يجب تسجيل الدخول', 'error');
      return;
    }

    this.showSubscribeDialog(user);
  },

  showSubscribeDialog(user) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    modal.innerHTML = `
      <div class="modal-box">
        <div class="modal-title">💎 الاشتراك المميز</div>
        <div class="modal-subtitle">استمتع بمزايا حصرية</div>

        <div class="promote-info-box" style="background:linear-gradient(135deg,#fff9f0,#fff3e0);">
          <div class="promote-info-title">الباقة الشهرية</div>
          <div class="promote-info-price">
            <div class="promote-price-tag">15,000 د.ع</div>
            <div class="promote-price-duration">لمدة 30 يوماً</div>
          </div>
        </div>

        <div class="promote-benefits">
          <div class="promote-benefit-item">♾️ إعلانات غير محدودة</div>
          <div class="promote-benefit-item">💎 شارة "متجر موثّق"</div>
          <div class="promote-benefit-item">⭐ خصم على الإعلانات المميزة</div>
          <div class="promote-benefit-item">📞 دعم مباشر</div>
        </div>

        <div class="payment-info">
          <div class="payment-info-title">💳 طريقة الدفع</div>
          <div class="payment-info-row">
            <span>Qi Card:</span>
            <span class="payment-number">${this.QI_CARD_NUMBER}</span>
          </div>
          <div class="payment-info-row" style="font-size:12px;color:#999;">
            <span>أو عبر واتساب مع الإدارة</span>
          </div>
        </div>

        <label style="display:block;margin:12px 0 6px;font-weight:bold;font-size:13px;">
          رقم عملية التحويل (اختياري):
        </label>
        <input type="text" id="subscribeReceipt" placeholder="مثال: 123456789" maxlength="50" style="width:100%;padding:10px;border:2px solid #e0e0e0;border-radius:8px;font-family:inherit;font-size:14px;outline:none;">

        <div style="display:flex;gap:8px;margin-top:15px;">
          <button class="btn btn-secondary" style="flex:1;" onclick="this.closest('.modal-overlay').remove()">
            إلغاء
          </button>
          <button class="btn btn-primary" style="flex:2;" onclick="Promote.submitSubscribe()">
            📤 إرسال طلب الاشتراك
          </button>
        </div>

        <p style="text-align:center;font-size:11px;color:#999;margin-top:12px;">
          ⚠️ سيتم التفعيل بعد التحقق من الدفع
        </p>
      </div>
    `;

    document.body.appendChild(modal);
  },

  async submitSubscribe() {
    const user = KK.getUser();
    if (!user) return;

    const receiptInfo = document.getElementById('subscribeReceipt')?.value.trim() || '';

    const btn = event.target;
    btn.disabled = true;
    btn.textContent = '⏳ جارٍ الإرسال...';

    try {
      const response = await fetch('/api/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'subscribe',
          userPhone: user.phone,
          userName: user.name,
          receiptInfo: receiptInfo
        })
      });

      const data = await response.json();

      if (data.success) {
        document.querySelector('.modal-overlay')?.remove();
        this.showSuccess('subscribe');
      } else {
        App.toast('❌ ' + (data.error || 'فشل الإرسال'), 'error');
        btn.disabled = false;
        btn.textContent = '📤 إرسال طلب الاشتراك';
      }
    } catch (e) {
      App.toast('❌ فشل الاتصال', 'error');
      btn.disabled = false;
      btn.textContent = '📤 إرسال طلب الاشتراك';
    }
  },

  /* ==========================================
     شاشة النجاح
     ========================================== */
  showSuccess(type) {
    const isSubscribe = type === 'subscribe';
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    modal.innerHTML = `
      <div class="modal-box" style="text-align:center;">
        <div style="font-size:70px;margin-bottom:15px;animation:bounceIn 0.5s;">✅</div>
        <h2 style="color:#232f3e;font-size:20px;margin-bottom:10px;">
          ${isSubscribe ? 'تم استلام طلب الاشتراك!' : 'تم استلام طلب الترقية!'}
        </h2>
        <p style="color:#666;font-size:14px;line-height:1.7;margin-bottom:20px;">
          سيتواصل معك فريقنا خلال دقائق للتأكد من الدفع<br>
          وتفعيل ${isSubscribe ? 'الاشتراك' : 'الترقية'} فوراً
        </p>
        <div style="background:#fff9f0;border:2px dashed #ff9900;border-radius:10px;padding:15px;margin-bottom:15px;text-align:right;">
          <div style="font-size:12px;color:#856404;line-height:1.7;">
            💡 <strong>إذا تأخر التفعيل:</strong><br>
            تواصل معنا عبر واتساب مع رقم الإيصال
          </div>
        </div>
        <button class="btn btn-primary btn-full" onclick="this.closest('.modal-overlay').remove()">
          حسناً
        </button>
      </div>
    `;

    document.body.appendChild(modal);
  }
};

window.Promote = Promote;
