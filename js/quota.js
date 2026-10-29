/* ==========================================
   quota.js - عرض الحد الأسبوعي والنقاط
   ========================================== */

const Quota = {

  /* جلب بيانات الحصة */
  async fetch() {
    const userId = KK.getUserId();
    if (!userId) return null;

    try {
      const response = await fetch('/api/user-quota?userId=' + encodeURIComponent(userId));
      const data = await response.json();
      return data.success ? data : null;
    } catch (e) {
      console.error('Quota fetch error:', e);
      return null;
    }
  },

  /* عرض صندوق الحصة */
  async render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="quota-loading">
        <div class="spinner" style="width:20px;height:20px;border-width:2px;"></div>
        <span style="margin-right:8px;font-size:12px;color:#666;">جارٍ التحميل...</span>
      </div>
    `;

    const data = await this.fetch();

    if (!data) {
      container.innerHTML = '';
      return;
    }

    const isPremium = data.isPremium;
    const used = data.used || 0;
    const limit = isPremium ? '∞' : (data.limit || 7);
    const remaining = data.remaining;

    let percentage = 0;
    if (!isPremium && data.limit) {
      percentage = Math.min(100, (used / data.limit) * 100);
    }

    let progressColor = '#4caf50';
    if (percentage >= 100) progressColor = '#d32f2f';
    else if (percentage >= 70) progressColor = '#ff9900';

    if (isPremium) {
      container.innerHTML = `
        <div class="quota-card premium">
          <div class="quota-header">
            <div class="quota-title">
              <span style="font-size:24px;">💎</span>
              <div>
                <div style="font-weight:bold;">الباقة المميزة</div>
                <div style="font-size:11px;opacity:0.85;">غير محدود</div>
              </div>
            </div>
            <div class="quota-premium-badge">⭐ مشترك</div>
          </div>
          <div class="quota-info">
            <div class="quota-item">
              <div class="quota-value">${used}</div>
              <div class="quota-label">إعلانات هذا الأسبوع</div>
            </div>
            <div class="quota-item">
              <div class="quota-value">♾️</div>
              <div class="quota-label">الحد</div>
            </div>
          </div>
          ${data.premiumUntil ? `
            <div class="quota-premium-until">
              ينتهي الاشتراك: ${this.formatDate(data.premiumUntil)}
            </div>
          ` : ''}
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="quota-card">
        <div class="quota-header">
          <div class="quota-title">
            <span style="font-size:20px;">📊</span>
            <div>
              <div style="font-weight:bold;">حدك الأسبوعي</div>
              <div style="font-size:11px;color:#999;" id="weekRange">
                ${this.formatWeekRange(data.weekStart, data.weekEnd)}
              </div>
            </div>
          </div>
          <div class="quota-used">
            <span style="color:#ff9900;font-size:20px;font-weight:bold;">${used}</span>
            <span style="color:#999;font-size:14px;">/ ${limit}</span>
          </div>
        </div>

        <div class="quota-progress">
          <div class="quota-progress-bar">
            <div class="quota-progress-fill" style="width: ${percentage}%; background: ${progressColor};"></div>
          </div>
        </div>

        <div class="quota-footer">
          ${remaining === 0 ? `
            <div class="quota-warning">
              ⚠️ وصلت للحد الأسبوعي
            </div>
            <button class="quota-upgrade-btn" onclick="Submit.contactForPremium()">
              💎 ترقية للباقة المميزة - 15,000 د.ع/شهر
            </button>
          ` : `
            <div class="quota-remaining">
              ✅ متبقي لك: <strong>${remaining}</strong> إعلان
            </div>
            <button class="quota-info-btn" onclick="Quota.showInfo()">
              💡 معلومات عن الحد
            </button>
          `}
        </div>
      </div>
    `;
  },

  formatWeekRange(weekStart, weekEnd) {
    if (!weekStart || !weekEnd) return '';
    const start = new Date(weekStart);
    const end = new Date(weekEnd);
    const opts = { month: 'short', day: 'numeric' };
    return `${start.toLocaleDateString('ar-IQ', opts)} → ${end.toLocaleDateString('ar-IQ', opts)}`;
  },

  formatDate(dateStr) {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  },

  showInfo() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    modal.innerHTML = `
      <div class="modal-box">
        <div class="modal-title">📊 حد النشر الأسبوعي</div>
        <div style="font-size:13px;line-height:1.9;color:#444;">

          <div style="background:#f8f9fa;border-radius:10px;padding:15px;margin-bottom:12px;">
            <div style="font-weight:bold;color:#232f3e;margin-bottom:8px;">📅 كيف يُحسب الأسبوع؟</div>
            <div>من <strong>الأحد</strong> إلى <strong>السبت</strong> كل أسبوع</div>
          </div>

          <div style="background:#f8f9fa;border-radius:10px;padding:15px;margin-bottom:12px;">
            <div style="font-weight:bold;color:#232f3e;margin-bottom:8px;">📝 كم إعلان أستطيع نشر؟</div>
            <div>✅ <strong>7 إعلانات</strong> مجاناً كل أسبوع</div>
          </div>

          <div style="background:#fff9f0;border:2px dashed #ff9900;border-radius:10px;padding:15px;margin-bottom:12px;">
            <div style="font-weight:bold;color:#856404;margin-bottom:8px;">💡 ملاحظات مهمة:</div>
            <div style="font-size:12px;line-height:1.8;">
              • الإعلان المحذوف يُحسب من الحد<br>
              • يُعاد تعيين الحد كل يوم أحد<br>
              • الاشتراك المميز = غير محدود
            </div>
          </div>

          <div style="background:#e8f5e9;border-radius:10px;padding:15px;">
            <div style="font-weight:bold;color:#2e7d32;margin-bottom:8px;">💎 الباقة المميزة:</div>
            <div style="font-size:12px;line-height:1.8;">
              • إعلانات <strong>غير محدودة</strong><br>
              • السعر: <strong>15,000 د.ع/شهر</strong><br>
              • إعلانات مميزة بخصم<br>
              • دعم مباشر
            </div>
            <button class="btn btn-primary btn-full" style="margin-top:12px;" onclick="Submit.contactForPremium(); this.closest('.modal-overlay').remove();">
              📞 اشترك الآن
            </button>
          </div>
        </div>

        <button class="btn btn-secondary btn-full" style="margin-top:15px;" onclick="this.closest('.modal-overlay').remove()">
          إغلاق
        </button>
      </div>
    `;

    document.body.appendChild(modal);
  }
};

window.Quota = Quota;
