/* ==========================================
   auth.js - نظام المستخدم (userId + Server)
   ========================================== */

const Auth = {

  /* هل المستخدم مسجل؟ */
  isRegistered() {
    const userId = KK.getUserId();
    const user = KK.getUser();
    return !!(userId && user && user.name && user.phone);
  },

  /* الحصول على المستخدم الحالي */
  getCurrentUser() {
    return KK.getUser();
  },

  /* معرّف المستخدم */
  getUserId() {
    return KK.getUserId();
  },

  /* ===== الدخول/التسجيل ===== */
  async loginOrRegister(phone, name, city) {
    try {
      const response = await fetch('/api/register-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, name, city })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'فشل التسجيل');
      }

      // حفظ userId + بيانات المستخدم
      KK.setUser(data.user);
      KK.setUserId(data.userId);

      return {
        success: true,
        isNew: data.isNew,
        user: data.user,
        userId: data.userId
      };
    } catch (e) {
      console.error('Login error:', e);
      return {
        success: false,
        error: e.message
      };
    }
  },

  /* ===== فحص حالة الحساب ===== */
  async checkAccountStatus() {
    const userId = KK.getUserId();

    if (!userId) {
      return { loggedIn: false };
    }

    // جلب بيانات محدثة من السيرفر
    const user = await KK.fetchUserFromServer(userId);

    if (!user) {
      // الحساب محذوف أو خطأ
      KK.clearUserId();
      return { loggedIn: false, error: 'الحساب غير موجود' };
    }

    return { loggedIn: true, user };
  },

  /* ===== عرض نافذة التسجيل/الدخول ===== */
  showAuthModal(onComplete) {
    const existing = document.getElementById('authModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'authModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box">
        <div class="modal-title">👋 مرحباً بك في كلشي كلاشي</div>
        <div class="modal-subtitle">
          أدخل بياناتك للبدء<br>
          <span style="font-size:11px;color:#999;">يمكنك العودة لحسابك من أي جهاز بنفس الرقم</span>
        </div>
        <form id="authForm">
          <label>الاسم الكامل *</label>
          <input type="text" id="authName" placeholder="مثال: علي محمد" required maxlength="50">

          <label>رقم الهاتف *</label>
          <input type="tel" id="authPhone" placeholder="07XXXXXXXXX" required maxlength="15">

          <label>المدينة (اختياري)</label>
          <input type="text" id="authCity" placeholder="مثال: بغداد" maxlength="30">

          <p id="authError" style="color:#d32f2f;font-size:13px;margin-top:10px;min-height:18px;"></p>

          <button type="submit" class="btn btn-primary btn-full" style="margin-top:15px;">
            ✅ تسجيل الدخول / التسجيل
          </button>

          <button type="button" class="btn btn-secondary btn-full" style="margin-top:8px;" onclick="document.getElementById('authModal').remove();">
            تصفح بدون تسجيل
          </button>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    const form = document.getElementById('authForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.submitAuth(onComplete);
    });

    setTimeout(() => document.getElementById('authName').focus(), 100);
  },

  /* ===== إرسال بيانات التسجيل ===== */
  async submitAuth(onComplete) {
    const name = document.getElementById('authName').value.trim();
    const phone = document.getElementById('authPhone').value.trim();
    const city = document.getElementById('authCity').value.trim();
    const errorEl = document.getElementById('authError');
    const submitBtn = document.querySelector('#authForm button[type="submit"]');

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

    // فحص الحظر
    if (window.Ban && Ban.isBanned(name, phone)) {
      errorEl.textContent = '🚫 أنت محظور من استخدام الموقع';
      setTimeout(() => {
        window.location.href = '/banned.html';
      }, 1500);
      return;
    }

    // تعطيل الزر
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ جارٍ الدخول...';
    }

    const result = await this.loginOrRegister(cleanPhone, name, city);

    if (result.success) {
      document.getElementById('authModal').remove();
      App.toast(result.isNew ? '✅ مرحباً بك!' : '✅ تم الدخول لحسابك', 'success');

      if (typeof onComplete === 'function') {
        onComplete(result.user);
      } else {
        location.reload();
      }
    } else {
      errorEl.textContent = '❌ ' + result.error;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '✅ تسجيل الدخول / التسجيل';
      }
    }
  },

  /* ===== طلب التسجيل إذا لم يكن مسجلاً ===== */
  async requireRegistration() {
    if (this.isRegistered()) {
      return this.getCurrentUser();
    }

    return new Promise((resolve) => {
      this.showAuthModal(resolve);
    });
  },

renderUserHeader() {
  const user = this.getCurrentUser();
  const el = document.getElementById('headerUser');
  if (!el) return;

  if (user && user.name) {
    // مسجل → اسم + زر خروج (عند الضغط)
    el.innerHTML = `
      <a href="/my-ads.html" style="color:inherit;text-decoration:none;">
        👤 <strong>${App.escapeHTML(user.name)}</strong>
      </a>
    `;
  } else {
    // غير مسجل → زر "دخول"
    el.innerHTML = `
      <a href="#" onclick="Auth.showAuthModal(); return false;" style="color:#ff9900;text-decoration:none;font-weight:bold;background:rgba(255,153,0,0.15);padding:6px 12px;border-radius:6px;">
        🔑 دخول
      </a>
    `;
  }
},

  /* ===== تحديث بيانات المستخدم ===== */
  async updateUser(updates) {
    const userId = KK.getUserId();
    if (!userId) return false;

    try {
      const response = await fetch('/api/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          ...updates
        })
      });

      const data = await response.json();

      if (data.success && data.user) {
        KK.setUser(data.user);
        return true;
      }
      return false;
    } catch (e) {
      console.error('Update user error:', e);
      return false;
    }
  },

  /* ===== تسجيل خروج ===== */
  logout() {
    if (confirm('هل تريد تسجيل الخروج؟ يمكنك العودة برقم هاتفك.')) {
      KK.clearUserId();
      location.reload();
    }
  }
};

window.Auth = Auth;
