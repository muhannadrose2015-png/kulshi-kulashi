/* ==========================================
   auth.js - نظام المستخدم المبسط + التصفح كزائر
   ========================================== */

const Auth = {

  /* هل المستخدم مسجل؟ */
  isRegistered() {
    const user = KK.getUser();
    return !!(user && user.name && user.phone);
  },

  /* الحصول على المستخدم الحالي */
  getCurrentUser() {
    return KK.getUser();
  },

  /* ===== للتصفح الحر (بدون طلب تسجيل) ===== */
  browseAsGuest() {
    // لا نفعل شيئاً - المستخدم يتصفح بحرية
    // اسمه في الهيدر يظهر "زائر"
  },

  /* ===== طلب التسجيل فقط عند الحاجة ===== */
  async requireRegistration() {
    // إذا كان مسجلاً → لا نفعل شيئاً
    if (this.isRegistered()) {
      return this.getCurrentUser();
    }

    // إذا كان زائراً → نعرض النافذة
    return new Promise((resolve) => {
      this.showRegisterModal(resolve);
    });
  },

  /* عرض نافذة التسجيل */
  showRegisterModal(onComplete) {
    const existing = document.getElementById('registerModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'registerModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box">
        <div class="modal-title">👋 مرحباً بك في كلشي كلاشي</div>
        <div class="modal-subtitle">
          أدخل بياناتك للاستمرار<br>
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

          <button type="button" class="btn btn-secondary btn-full" style="margin-top:8px;" onclick="document.getElementById('registerModal').remove();">
            تصفح بدون تسجيل
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

    setTimeout(() => document.getElementById('regName').focus(), 100);
  },

  /* إرسال بيانات التسجيل */
  submitRegistration(onComplete) {
    const name = document.getElementById('regName').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const city = document.getElementById('regCity').value.trim();
    const errorEl = document.getElementById('regError');

    errorEl.textContent = '';

    if (name.length < 2) {
      errorEl.textContent = '❌ الاسم قصير جداً';
      return;
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 13) {
      errorEl.textContent = '❌ رقم الهاتف غير صحيح';
      return;
    }

    if (window.Ban && Ban.isBanned(name, phone)) {
      errorEl.textContent = '🚫 أنت محظور من استخدام الموقع';
      setTimeout(() => {
        window.location.href = '/banned.html';
      }, 1500);
      return;
    }

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

  /* ===== عرض اسم المستخدم في الهيدر ===== */
  renderUserHeader() {
    const user = this.getCurrentUser();
    const el = document.getElementById('headerUser');
    if (!el) return;

    if (user && user.name) {
      el.innerHTML = `👤 <strong>${App.escapeHTML(user.name)}</strong>`;
    } else {
      // زائر
      el.innerHTML = `<a href="#" onclick="Auth.showRegisterModal(() => location.reload()); return false;" style="color:#ff9900;text-decoration:none;">تسجيل الدخول</a>`;
    }
  },

  /* تحديث بيانات المستخدم */
  updateUser(updates) {
    const user = this.getCurrentUser();
    if (!user) return false;
    const updated = { ...user, ...updates };
    return KK.setUser(updated);
  },

  /* تسجيل خروج */
  logout() {
    if (confirm('هل تريد تسجيل الخروج؟ ستحتاج لإدخال بياناتك مرة أخرى.')) {
      KK.clearUser();
      location.reload();
    }
  }
};

window.Auth = Auth;
