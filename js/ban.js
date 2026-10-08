/* ==========================================
   ban.js - نظام الحظر
   ========================================== */

const Ban = {

  /* قائمة الحظر (تُحمّل من banned.json) */
  _cache: null,
  _cacheTime: 0,
  _cacheDuration: 5 * 60 * 1000, // 5 دقائق

  /* تحميل قائمة الحظر */
  async loadBanned() {
    const now = Date.now();
    if (this._cache && (now - this._cacheTime) < this._cacheDuration) {
      return this._cache;
    }

    try {
      const data = await App.fetchJSON('/data/banned.json');
      if (data) {
        this._cache = data;
        this._cacheTime = now;
        return data;
      }
    } catch (e) {
      console.error('فشل تحميل banned.json:', e);
    }

    return { phones: [], names: [], keywords: [] };
  },

  /* هل الاسم أو الرقم محظور؟ */
  isBanned(name, phone) {
    if (!this._cache) {
      // لم يُحمّل بعد - نُشغّل التحميل في الخلفية
      this.loadBanned();
      return false;
    }

    const data = this._cache;
    const cleanPhone = String(phone || '').replace(/[^0-9]/g, '');
    const cleanName = String(name || '').trim().toLowerCase();

    // فحص رقم الهاتف
    if (data.phones && data.phones.length) {
      for (const bannedPhone of data.phones) {
        const cleanBanned = String(bannedPhone).replace(/[^0-9]/g, '');
        if (cleanBanned && cleanPhone && cleanBanned === cleanPhone) {
          return true;
        }
      }
    }

    // فحص الاسم
    if (data.names && data.names.length) {
      for (const bannedName of data.names) {
        if (String(bannedName).trim().toLowerCase() === cleanName) {
          return true;
        }
      }
    }

    return false;
  },

  /* هل النص يحتوي كلمة محظورة؟ */
  containsBannedKeyword(text) {
    if (!this._cache || !this._cache.keywords) return false;
    const cleanText = String(text || '').toLowerCase();
    for (const keyword of this._cache.keywords) {
      if (cleanText.includes(String(keyword).toLowerCase())) {
        return true;
      }
    }
    return false;
  },

  /* فحص شامل عند تحميل الصفحة */
  async checkPageAccess() {
    const user = KK.getUser();
    if (!user) return true;

    await this.loadBanned();

    if (this.isBanned(user.name, user.phone)) {
      this.showBanScreen();
      return false;
    }

    return true;
  },

  /* عرض شاشة الحظر */
  showBanScreen() {
    document.body.innerHTML = `
      <div class="ban-screen">
        <div class="ban-box">
          <div class="ban-icon">🚫</div>
          <h1>أنت محظور</h1>
          <p>
            تم حظر حسابك من استخدام موقع كلشي كلاشي<br>
            بسبب مخالفة شروط الاستخدام
          </p>
          <p style="margin-top:20px;font-size:13px;opacity:0.7;">
            إذا كنت تعتقد أن هذا خطأ، تواصل معنا
          </p>
        </div>
      </div>
    `;
  },

  /* فحص النص المُدخل قبل النشر */
  validateContent(text) {
    if (this.containsBannedKeyword(text)) {
      return {
        ok: false,
        message: '❌ يحتوي الإعلان على كلمات محظورة'
      };
    }
    return { ok: true };
  }
};

window.Ban = Ban;
