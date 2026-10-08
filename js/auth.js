/* ==========================================
   auth.js - نظام المستخدم المبسط
   ========================================== */

const Auth = {

  /* الحصول على المستخدم الحالي */
  getCurrentUser() {
    return KK.getUser();
  },

  /* هل المستخدم مسجل؟ */
  isRegistered() {
    const user = this.getCurrentUser();
    return !!(user && user.name && user.phone);
  },

  /* طلب التسجيل (يظهر نافذة إذا لم يكن مسجلاً) */
  async requireRegistration() {
    if (this.isRegistered()) {
      return this.getCurrentUser();
    }

    return new Promise((resolve) => {
      this.showRegisterModal(resolve);
    });
  },

  /* عرض نافذة التسجيل */
  showRegisterModal(onComplete) {
    // إزالة أي نافذة موجودة
    const existing = document.getElementById('registerModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'registerModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box">
        <div class="modal-title">👋 مرحباً بك في كلشي كلاشي</div>
        <div class="modal-subtitle">
          أدخل بياناتك لنتمكن من التواصل معك<br>
          <span style="font-size:11px;color:#999;">تُحفظ على جهازك فقط</span>
        </div>
        <form id="registerForm">
          <label>الاسم الكامل *</label>
          <input type="text" id="regName" placeholder="مثال: علي محمد" required maxlength="50">

          <label>رقم الهاتف *</label>
          <input type="tel" id="regPhone" placeholder="07XXXXXXXXX" required maxlength="15">

          <label>المدينة (اختياري)</label>
          <input type="text" id="regCity" placeholder="مثال: بغداد" maxlength="30">

          <p id="regError" style="color:#d32f2f;font-size:13px;margin-top:10px;min-height:18px;"></p>

          <button type="submit" class="btn btn-primary btn-full" style="margin-top:15px;">
            ✅ تسجيل ومتابعة
          </button>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    const form = document.getElementById('registerForm');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitRegistration(onComplete);
    });

    // التركيز على الحقل الأول
    setTimeout(() => document.getElementById('regName').focus(), 100);
  },

  /* إرسال بيانات التسجيل */
  submitRegistration(onComplete) {
    const name = document.getElementById('regName').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const city = document.getElementById('regCity').value.trim();
    const errorEl = document.getElementById('regError');

    errorEl.textContent = '';

    // التحقق من الاسم
    if (name.length < 2) {
      errorEl.textContent = '❌ الاسم قصير جداً';
      return;
    }

    // التحقق من رقم الهاتف
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 13) {
      errorEl.textContent = '❌ رقم الهاتف غير صحيح';
      return;
    }

    // فحص الحظر
    if (window.Ban && Ban.isBanned(name, phone)) {
      errorEl.textContent = '🚫 أنت محظور من استخدام الموقع';
      setTimeout(() => {
        window.location.href = '/banned.html';
      }, 1500);
      return;
    }

    // حفظ المستخدم
    const user = {
      name: name,
      phone: cleanPhone,
      city: city || '',
      joinedAt: new Date().toISOString()
    };

    if (KK.setUser(user)) {
      document.getElementById('registerModal').remove();
      App.toast('✅ تم التسجيل بنجاح', 'success');
      if (typeof onComplete === 'function') onComplete(user);
    } else {
      errorEl.textContent = '❌ فشل الحفظ. تأكد من تفعيل التخزين في المتصفح';
    }
  },

  /* تحديث بيانات المستخدم */
  updateUser(updates) {
    const user = this.getCurrentUser();
    if (!user) return false;
    const updated = { ...user, ...updates };
    return KK.setUser(updated);
  },

  /* تسجيل خروج المستخدم */
  logout() {
    if (confirm('هل تريد تسجيل الخروج؟ ستحتاج لإدخال بياناتك مرة أخرى.')) {
      KK.clearUser();
      location.reload();
    }
  },

  /* عرض بيانات المستخدم في الهيدر */
  renderUserHeader() {
    const user = this.getCurrentUser();
    const el = document.getElementById('headerUser');
    if (!el) return;

    if (user) {
      el.innerHTML = `👤 <strong>${App.escapeHTML(user.name)}</strong>`;
    } else {
      el.innerHTML = `<a href="#" onclick="Auth.showRegisterModal(() => location.reload()); return false;" style="color:#ff9900;text-decoration:none;">تسجيل الدخول</a>`;
    }
  }
};

window.Auth = Auth;
