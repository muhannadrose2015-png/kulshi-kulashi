/* ==========================================
   settings.js - إدارة بيانات المستخدم (userId)
   ========================================== */

const Settings = {

  /* عرض قسم معلومات المستخدم */
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

  /* فتح نافذة التعديل */
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

  /* حفظ التعديلات (عبر السيرفر) */
  async saveChanges() {
    const name = document.getElementById('settingsName').value.trim();
    const phone = document.getElementById('settingsPhone').value.trim().replace(/[^0-9]/g, '');
    const city = document.getElementById('settingsCity').value.trim();
    const errorEl = document.getElementById('settingsError');

    errorEl.textContent = '';

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

    // تعطيل الزر
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = '⏳ جارٍ الحفظ...';

    const success = await Auth.updateUser({
      name: name,
      phone: phone,
      city: city
    });

    if (success) {
      document.querySelector('.modal-overlay')?.remove();
      App.toast('✅ تم حفظ التعديلات', 'success');

      this.renderUserBox('userSettingsBox');
      Auth.renderUserHeader();
    } else {
      errorEl.textContent = '❌ فشل الحفظ';
      btn.disabled = false;
      btn.textContent = '💾 حفظ التعديلات';
    }
  }
};

window.Settings = Settings;
