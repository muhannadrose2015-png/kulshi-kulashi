/* ==========================================
   products.js - إدارة الإعلانات وعرضها
   ========================================== */

const Products = {

  _cache: null,
  _cacheTime: 0,
  _cacheDuration: 60 * 1000,
  _viewsCache: null,
  _viewsCacheTime: 0,
  _viewsCacheDuration: 5 * 60 * 1000, // 5 دقائق

  /* ==========================================
     تحميل كل الإعلانات من ads.json
     ========================================== */
  async loadAll(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this._cache && (now - this._cacheTime) < this._cacheDuration) {
      return this._cache;
    }

    const data = await App.fetchJSON('/data/ads.json');
    const ads = Array.isArray(data) ? data : [];

    const active = ads.filter(ad => ad.status !== 'disabled' && ad.status !== 'rejected');

    active.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0);
      const dateB = new Date(b.createdAt || 0);
      return dateB - dateA;
    });

    this._cache = active;
    this._cacheTime = now;

    try { KK.setCachedAds(active); } catch (e) {}

    return active;
  },

  /* ==========================================
     تحميل المشاهدات من views.json
     ========================================== */
  async loadViews(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this._viewsCache && (now - this._viewsCacheTime) < this._viewsCacheDuration) {
      return this._viewsCache;
    }

    try {
      const data = await App.fetchJSON('/data/views.json');
      this._viewsCache = (data && typeof data === 'object') ? data : {};
      this._viewsCacheTime = now;
      return this._viewsCache;
    } catch (e) {
      this._viewsCache = {};
      return {};
    }
  },

  /* الحصول على عدد المشاهدات لمنتج */
  async getViews(productId) {
    const views = await this.loadViews();
    return views[productId] || 0;
  },

  /* ==========================================
     دوال أساسية
     ========================================== */
  async getById(id) {
    const all = await this.loadAll();
    return all.find(p => String(p.id) === String(id));
  },

  async getByCategory(categoryId) {
    const all = await this.loadAll();
    return all.filter(p => p.category === categoryId);
  },

  /* تطبيع النص العربي (إزالة الهمزات والحركات) */
normalizeArabic(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .replace(/[أإآا]/g, 'ا')
    .replace(/[ىي]/g, 'ي')
    .replace(/[ةه]/g, 'ه')
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
},

async search(query) {
  if (!query || query.trim().length < 2) return [];
  const all = await this.loadAll();
  const q = this.normalizeArabic(query);

  return all.filter(p => {
    const title = this.normalizeArabic(p.title);
    const description = this.normalizeArabic(p.description);
    const city = this.normalizeArabic(p.city);
    return title.includes(q) || description.includes(q) || city.includes(q);
  });
},

  async getCategories() {
    const data = await App.fetchJSON('/data/categories.json');
    return Array.isArray(data) ? data : [];
  },

  async getCategoryName(categoryId) {
    const cats = await this.getCategories();
    const cat = cats.find(c => c.id === categoryId);
    return cat ? cat.name : categoryId;
  },

  /* ==========================================
     دوال العرض
     ========================================== */
  async renderGrid(containerId, products) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!products || products.length === 0) {
      container.innerHTML = this.emptyStateHTML();
      return;
    }

    // نُحمّل المشاهدات مرة واحدة قبل العرض
    const views = await this.loadViews();

    container.innerHTML = products
      .map(p => App.productCardHTML(p, views[p.id] || 0))
      .join('');
  },

  emptyStateHTML(message = 'لا توجد إعلانات حالياً') {
    return `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-state-icon">📭</div>
        <h3>${message}</h3>
        <p>عد قريباً، الإعلانات الجديدة تُضاف باستمرار</p>
      </div>
    `;
  },

  /* ==========================================
     صفحة الصنف
     ========================================== */
  async initCategoryPage() {
    const categoryId = App.getURLParam('cat');
    const searchQuery = App.getURLParam('q');

    const titleEl = document.getElementById('categoryTitle');
    const gridEl = document.getElementById('categoryGrid');

    if (!gridEl) return;

    if (searchQuery) {
      if (titleEl) titleEl.textContent = `🔍 نتائج البحث: ${searchQuery}`;
      const results = await this.search(searchQuery);
      await this.renderGrid('categoryGrid', results);
      return;
    }

    if (categoryId) {
      const catName = await this.getCategoryName(categoryId);
      if (titleEl) titleEl.textContent = catName;
      document.title = catName + ' - كلشي كلاشي';

      const products = await this.getByCategory(categoryId);
      await this.renderGrid('categoryGrid', products);
      this.setupFilters(products);
      return;
    }

    if (titleEl) titleEl.textContent = 'كل الإعلانات';
    const all = await this.loadAll();
    await this.renderGrid('categoryGrid', all);
  },

  setupFilters(products) {
    const filtersEl = document.getElementById('filtersBar');
    if (!filtersEl) return;

    filtersEl.innerHTML = `
      <button class="filter-chip active" data-sort="newest">🆕 الأحدث</button>
      <button class="filter-chip" data-sort="price-asc">💰 الأرخص</button>
      <button class="filter-chip" data-sort="price-desc">💎 الأغلى</button>
    `;

    filtersEl.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', async () => {
        filtersEl.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        const sort = chip.dataset.sort;
        let sorted = [...products];

        if (sort === 'price-asc') {
          sorted.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
        } else if (sort === 'price-desc') {
          sorted.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
        } else {
          sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        }

        await this.renderGrid('categoryGrid', sorted);
      });
    });
  },

  /* ==========================================
     صفحة المنتج
     ========================================== */
  async initProductPage() {
    const productId = App.getURLParam('id');
    const bodyEl = document.getElementById('productBody');

    if (!bodyEl) return;

    if (!productId) {
      bodyEl.innerHTML = this.emptyStateHTML('لم يتم تحديد المنتج');
      return;
    }

    const product = await this.getById(productId);

    if (!product) {
      bodyEl.innerHTML = this.emptyStateHTML('⚠️ المنتج غير موجود أو تم حذفه');
      return;
    }

    document.title = product.title + ' - كلشي كلاشي';

    // تسجيل مشاهدة (لا ننتظر النتيجة)
    this.trackView(productId);

    this.renderProductDetails(product);
    await this.renderSimilar(product);
  },

  /* تسجيل مشاهدة في Cloudflare KV */
  async trackView(productId) {
    try {
      const sessionKey = 'kk_viewed_' + productId;
      if (sessionStorage.getItem(sessionKey)) return;

      const response = await fetch('/api/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: productId })
      });

      const data = await response.json();
      if (data.success) {
        sessionStorage.setItem(sessionKey, '1');
      }
    } catch (e) {
      console.error('فشل تسجيل المشاهدة:', e);
    }
  },

  /* عرض تفاصيل المنتج */
  renderProductDetails(product) {
    const bodyEl = document.getElementById('productBody');
    const images = (product.images && product.images.length)
      ? product.images
      : ['data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23f0f0f0" width="100" height="100"/><text x="50" y="55" font-size="30" text-anchor="middle" fill="%23999">📷</text></svg>'];

    const price = App.formatPrice(product.price, product.currency);
    const waLink = App.whatsappLink(
      product.whatsapp || product.ownerPhone,
      `مرحباً، مهتم بـ: ${product.title}`
    );

    bodyEl.innerHTML = `
      <div class="product-details">
        <div class="product-gallery">
          <img id="mainImage" src="${images[0]}" alt="${App.escapeHTML(product.title)}">
        </div>
        ${images.length > 1 ? `
          <div class="gallery-thumbs">
            ${images.map((img, i) => `
              <div class="gallery-thumb ${i === 0 ? 'active' : ''}" data-index="${i}">
                <img src="${img}" alt="صورة ${i+1}">
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div class="product-body">
          <h1 class="product-detail-title">${App.escapeHTML(product.title)}</h1>
          <div class="product-detail-price">${price}</div>

          <div class="product-meta">
            ${product.city ? `<div class="meta-item">📍 ${App.escapeHTML(product.city)}</div>` : ''}
            ${product.createdAt ? `<div class="meta-item">🕐 ${App.formatDate(product.createdAt)}</div>` : ''}
            ${product.ownerName ? `<div class="meta-item">👤 ${App.escapeHTML(product.ownerName)}</div>` : ''}
          </div>

          ${product.description ? `
            <div class="product-description">${App.escapeHTML(product.description)}</div>
          ` : ''}

          <div class="product-actions">
            <a href="${waLink}" target="_blank" class="btn btn-whatsapp">
              💬 تواصل عبر واتساب
            </a>
            <button class="btn btn-report" onclick="Products.shareProduct('${product.id}')">
              📤 مشاركة
            </button>
            <button class="btn btn-report" onclick="Products.reportProduct('${product.id}')">
              ⚠️ إبلاغ
            </button>
          </div>
        </div>
      </div>
    `;

    const thumbs = bodyEl.querySelectorAll('.gallery-thumb');
    thumbs.forEach(thumb => {
      thumb.addEventListener('click', () => {
        const idx = parseInt(thumb.dataset.index);
        document.getElementById('mainImage').src = images[idx];
        thumbs.forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
      });
    });
  },

  /* مشاركة المنتج */
  async shareProduct(productId) {
    const product = await this.getById(productId);
    if (!product) return;

    const url = window.location.href;
    const text = `🛒 ${product.title}\n💰 ${App.formatPrice(product.price, product.currency)}\n\nشاهد على كلشي كلاشي:`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: product.title,
          text: text,
          url: url
        });
      } catch (e) {
        // المستخدم ألغى
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        App.toast('✅ تم نسخ الرابط', 'success');
      } catch (e) {
        App.toast('انسخ الرابط يدوياً: ' + url, 'info');
      }
    }
  },

  /* منتجات مشابهة */
  async renderSimilar(product) {
    const similarEl = document.getElementById('similarProducts');
    if (!similarEl) return;

    const all = await this.loadAll();
    const similar = all
      .filter(p => p.category === product.category && String(p.id) !== String(product.id))
      .slice(0, 4);

    if (similar.length === 0) {
      similarEl.innerHTML = '';
      return;
    }

    const views = await this.loadViews();

    similarEl.innerHTML = `
      <h2 class="section-title">🔎 إعلانات مشابهة</h2>
      <div class="products-grid">
        ${similar.map(p => App.productCardHTML(p, views[p.id] || 0)).join('')}
      </div>
    `;
  },

/* الإبلاغ عن منتج */
async reportProduct(productId) {
  const product = await this.getById(productId);
  if (!product) return;

  // عرض نافذة اختيار السبب
  const reason = await this.showReportDialog();
  if (!reason) return;

  const user = KK.getUser();

  const report = {
    type: 'report',
    productId: productId,
    productTitle: product.title,
    reporterName: user ? user.name : 'زائر',
    reporterPhone: user ? user.phone : '',
    reason: reason,
    reportedAt: new Date().toISOString()
  };

  try {
    const response = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'report',
        data: report
      })
    });
    const result = await response.json();
    if (result.success) {
      App.toast('✅ تم الإبلاغ، شكراً لك', 'success');
    } else {
      App.toast('⚠️ سيتم مراجعة الإبلاغ', 'info');
    }
  } catch (e) {
    App.toast('⚠️ سيتم مراجعة الإبلاغ', 'info');
  }
},

/* نافذة اختيار سبب الإبلاغ */
showReportDialog() {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.remove();
        resolve(null);
      }
    };

    modal.innerHTML = `
      <div class="modal-box">
        <div class="modal-title">⚠️ الإبلاغ عن إعلان</div>
        <div class="modal-subtitle">اختر سبب الإبلاغ</div>

        <div class="report-reasons">
          <button class="report-reason" data-reason="منتج مزيّف أو مزيف">
            <span>🚫</span> منتج مزيّف أو مزيف
          </button>
          <button class="report-reason" data-reason="محتوى مخالف أو غير لائق">
            <span>⚠️</span> محتوى مخالف أو غير لائق
          </button>
          <button class="report-reason" data-reason="سعر خاطئ أو مضلل">
            <span>💰</span> سعر خاطئ أو مضلل
          </button>
          <button class="report-reason" data-reason="إعلان مكرر">
            <span>📋</span> إعلان مكرر
          </button>
          <button class="report-reason" data-reason="احتيال أو نصب">
            <span>🚨</span> احتيال أو نصب
          </button>
          <button class="report-reason" data-reason="سبب آخر">
            <span>📝</span> سبب آخر
          </button>
        </div>

        <button class="btn btn-secondary btn-full" style="margin-top:15px;" onclick="this.closest('.modal-overlay').remove();">
          إلغاء
        </button>
      </div>
    `;

    // إضافة التنسيقات
    const style = document.createElement('style');
    style.textContent = `
      .report-reasons {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 10px;
      }
      .report-reason {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
        background: #f8f9fa;
        border: 2px solid #e0e0e0;
        border-radius: 10px;
        font-family: inherit;
        font-size: 14px;
        font-weight: bold;
        color: #232f3e;
        cursor: pointer;
        transition: 0.2s;
        text-align: right;
      }
      .report-reason:hover, .report-reason:active {
        background: #fff9f0;
        border-color: #ff9900;
      }
      .report-reason span {
        font-size: 22px;
      }
    `;
    modal.appendChild(style);

    document.body.appendChild(modal);

    // ربط الأزرار
    modal.querySelectorAll('.report-reason').forEach(btn => {
      btn.addEventListener('click', () => {
        const reason = btn.dataset.reason;
        modal.remove();
        resolve(reason);
      });
    });
  });
},

  /* ==========================================
     الصفحة الرئيسية
     ========================================== */
  async initHomePage() {
    await this.renderCategories();
    const all = await this.loadAll();
    const latest = all.slice(0, 8);
    await this.renderGrid('latestProducts', latest);
  },

  async renderCategories() {
    const gridEl = document.getElementById('categoriesGrid');
    if (!gridEl) return;

    const cats = await this.getCategories();

    gridEl.innerHTML = cats.map(cat => `
      <a href="/category.html?cat=${cat.id}" class="cat-card">
        <div class="cat-icon">${cat.icon}</div>
        <div class="cat-name">${cat.name}</div>
      </a>
    `).join('');
  }
};

window.Products = Products;
