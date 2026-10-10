/* ==========================================
   settings.js - إدارة بيانات المستخدم
   ========================================== */

const Settings = {

  /* عرض قسم معلومات المستخدم في أعلى الصفحة */
  renderUserBox(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const user = KK.getUser();
    if (!user) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = `
      <div class="user-settings-box">
        <div class="user-settings-info">
          <div class="user-settings-avatar">${App.escapeHTML(user.name.charAt(0))}</div>
          <div class="user-settings-details">
            <div class="user-settings-name">👤 ${App.escapeHTML(user.name)}</div>
            <div class="user-settings-phone">📱 ${App.escapeHTML(user.phone)}</div>
            ${user.city ? `<div class="user-settings-city">📍 ${App.escapeHTML(user.city)}</div>` : ''}
          </div>
        </div>
        <button class="btn-edit-settings" onclick="Settings.openEditDialog()">
          ⚙️ تعديل
        </button>
      </div>
    `;
  },

  /* فتح نافذة تعديل البيانات */
  openEditDialog() {
    const user = KK.getUser();
    if (!user) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    modal.innerHTML = `
      <div class="modal-box">
        <div class="modal-title">⚙️ تعديل بياناتي</div>
        <div class="modal-subtitle">يمكنك تعديل بياناتك في أي وقت</div>

        <label>الاسم الكامل *</label>
        <input type="text" id="settingsName" value="${App.escapeHTML(user.name)}" maxlength="50" required>

        <label>رقم الهاتف *</label>
        <input type="tel" id="settingsPhone" value="${App.escapeHTML(user.phone)}" maxlength="15" required>

        <label>المدينة (اختياري)</label>
        <input type="text" id="settingsCity" value="${App.escapeHTML(user.city || '')}" maxlength="30">

        <p id="settingsError" style="color:#d32f2f;font-size:13px;margin-top:10px;min-height:18px;"></p>

        <div style="display:flex;gap:8px;margin-top:15px;">
          <button class="btn btn-secondary" style="flex:1;" onclick="this.closest('.modal-overlay').remove()">
            إلغاء
          </button>
          <button class="btn btn-primary" style="flex:2;" onclick="Settings.saveChanges()">
            💾 حفظ التعديلات
          </button>
        </div>

        <p style="text-align:center;font-size:11px;color:#999;margin-top:15px;">
          ⚠️ تغيير رقم الهاتف يؤثر على تقييماتك السابقة
        </p>
      </div>
    `;

    document.body.appendChild(modal);
  },

  /* حفظ التعديلات */
  saveChanges() {
    const name = document.getElementById('settingsName').value.trim();
    const phone = document.getElementById('settingsPhone').value.trim().replace(/[^0-9]/g, '');
    const city = document.getElementById('settingsCity').value.trim();
    const errorEl = document.getElementById('settingsError');

    errorEl.textContent = '';

    // التحقق
    if (name.length < 2) {
      errorEl.textContent = '❌ الاسم قصير جداً';
      return;
    }
    if (phone.length < 10 || phone.length > 13) {
      errorEl.textContent = '❌ رقم الهاتف غير صحيح';
      return;
    }

    // فحص الحظر
    if (window.Ban && Ban.isBanned(name, phone)) {
      errorEl.textContent = '🚫 هذا الاسم أو الرقم محظور';
      return;
    }

    const oldUser = KK.getUser();
    const phoneChanged = oldUser && oldUser.phone !== phone;

    // حفظ التعديلات
    const updated = {
      ...oldUser,
      name: name,
      phone: phone,
      city: city || '',
      updatedAt: new Date().toISOString()
    };

    if (KK.setUser(updated)) {
      // إغلاق النافذة
      document.querySelector('.modal-overlay')?.remove();

      App.toast('✅ تم حفظ التعديلات', 'success');

      // إعادة عرض القسم
      this.renderUserBox('userSettingsBox');
      Auth.renderUserHeader();

      // تنبيه إذا تغير الرقم
      if (phoneChanged) {
        setTimeout(() => {
          App.toast('📱 تم تغيير رقمك - قد تحتاج لإعادة التقييمات', 'info');
        }, 2000);
      }
    } else {
      errorEl.textContent = '❌ فشل الحفظ';
    }
  }
};

window.Settings = Settings;
