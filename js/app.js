/* ==========================================
   app.js - المنطق الرئيسي للموقع
   ========================================== */

/* ===== أدوات مساعدة ===== */
const App = {

  /* قراءة ملف JSON من المسار */
  async fetchJSON(path) {
    try {
      const response = await fetch(path + '?t=' + Date.now());
      if (!response.ok) throw new Error('فشل تحميل ' + path);
      return await response.json();
    } catch (e) {
      console.error('خطأ في قراءة JSON:', path, e);
      return null;
    }
  },

  /* تنسيق السعر */
  formatPrice(price, currency = 'IQD') {
    if (!price && price !== 0) return 'السعر عند التواصل';
    const num = Number(price);
    if (isNaN(num)) return price;
    const formatted = num.toLocaleString('en-US');
    const currencies = {
      'IQD': 'د.ع',
      'USD': '$',
      'SAR': 'ر.س',
      'AED': 'د.إ'
    };
    return `${formatted} ${currencies[currency] || currency}`;
  },

  /* تنسيق التاريخ بالعربية */
  formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return 'الآن';
    if (diff < 3600) return `قبل ${Math.floor(diff / 60)} دقيقة`;
    if (diff < 86400) return `قبل ${Math.floor(diff / 3600)} ساعة`;
    if (diff < 604800) return `قبل ${Math.floor(diff / 86400)} يوم`;

    return date.toLocaleDateString('ar-IQ', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  },

  /* إنشاء رابط واتساب */
  whatsappLink(phone, message = '') {
    let cleanPhone = String(phone).replace(/[^0-9]/g, '');
    // إذا بدأ بـ 07، نحوّله إلى 9647
    if (cleanPhone.startsWith('07')) {
      cleanPhone = '964' + cleanPhone.substring(1);
    }
    const encodedMsg = encodeURIComponent(message);
    return `https://wa.me/${cleanPhone}${encodedMsg ? '?text=' + encodedMsg : ''}`;
  },

  /* توليد كود طلب */
  generateOrderCode() {
    const year = new Date().getFullYear();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `KK-${year}-${random}`;
  },

  /* الحصول على معامل URL */
  getURLParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  },

  /* تحويل الصور المشفرة (Base64) */
  async fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  /* ضغط صورة قبل الرفع */
  async compressImage(file, maxSizeKB = 400) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;

          // تصغير الأبعاد إذا كانت كبيرة
          const maxDim = 1200;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = (height * maxDim) / width;
              width = maxDim;
            } else {
              width = (width * maxDim) / height;
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // ضغط تدريجي
          let quality = 0.85;
          let result = canvas.toDataURL('image/jpeg', quality);

          while (result.length / 1024 > maxSizeKB && quality > 0.3) {
            quality -= 0.1;
            result = canvas.toDataURL('image/jpeg', quality);
          }

          resolve(result);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  },

  /* عرض رسالة تنبيه بسيطة */
  toast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
      background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#d32f2f' : '#232f3e'};
      color: white; padding: 12px 24px; border-radius: 8px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3); z-index: 9999;
      font-family: 'Cairo', sans-serif; font-size: 14px;
      animation: slideDown 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = '0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  /* إنشاء بطاقة منتج HTML */
  productCardHTML(product) {
    const img = (product.images && product.images[0])
      ? product.images[0]
      : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23f0f0f0" width="100" height="100"/><text x="50" y="55" font-size="30" text-anchor="middle" fill="%23999">📷</text></svg>';

    const price = this.formatPrice(product.price, product.currency);
    const location = product.city || '';

    return `
      <a href="/product.html?id=${product.id}" class="product-card">
        <div class="product-image-wrap">
          <img src="${img}" alt="${this.escapeHTML(product.title)}" loading="lazy">
        </div>
        <div class="product-info">
          <div class="product-title">${this.escapeHTML(product.title)}</div>
          <div class="product-price">${price}</div>
          ${location ? `<div class="product-location">📍 ${this.escapeHTML(location)}</div>` : ''}
        </div>
      </a>
    `;
  },

  /* تأمين النصوص من HTML */
  escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

window.App = App;
