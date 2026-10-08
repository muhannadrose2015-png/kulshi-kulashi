/* ==========================================
   products.js - إدارة الإعلانات وعرضها
   ========================================== */

const Products = {

  _cache: null,
  _cacheTime: 0,
  _cacheDuration: 60 * 1000, // دقيقة واحدة

  /* تحميل كل الإعلانات من ads.json */
  async loadAll(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this._cache && (now - this._cacheTime) < this._cacheDuration) {
      return this._cache;
    }

    const data = await App.fetchJSON('/data/ads.json');
    const ads = Array.isArray(data) ? data : [];

    // فلترة الإعلانات المعطّلة
    const active = ads.filter(ad => ad.status !== 'disabled' && ad.status !== 'rejected');

    // ترتيب حسب التاريخ (الأحدث أولاً)
    active.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0);
      const dateB = new Date(b.createdAt || 0);
      return dateB - dateA;
    });

    this._cache = active;
    this._cacheTime = now;

    // حفظ نسخة محلية
    try { KK.setCachedAds(active); } catch(e) {}

    return active;
  },

  /* الحصول على إعلان بالمعرّف */
  async getById(id) {
    const all = await this.loadAll();
    return all.find(p => String(p.id) === String(id));
  },

  /* فلترة حسب الصنف */
  async getByCategory(categoryId) {
    const all = await this.loadAll();
    return all.filter(p => p.category === categoryId);
  },

  /* بحث في العناوين والأوصاف */
  async search(query) {
    if (!query || query.trim().length < 2) return [];
    const all = await this.loadAll();
    const q = query.trim().toLowerCase();
    return all.filter(p =>
      (p.title && p.title.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.city && p.city.toLowerCase().includes(q))
    );
  },

  /* الحصول على الأصناف من categories.json */
  async getCategories() {
    const data = await App.fetchJSON('/data/categories.json');
    return Array.isArray(data) ? data : [];
  },

  /* الحصول على اسم الصنف */
  async getCategoryName(categoryId) {
    const cats = await this.getCategories();
    const cat = cats.find(c => c.id === categoryId);
    return cat ? cat.name : categoryId;
  },

  /* ============ دوال العرض ============ */

  /* عرض شبكة إعلانات */
  async renderGrid(containerId, products) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!products || products.length === 0) {
      container.innerHTML = this.emptyStateHTML();
      return;
    }

    container.innerHTML = products
      .map(p => App.productCardHTML(p))
      .join('');
  },

  /* HTML حالة الفراغ */
  emptyStateHTML(message = 'لا توجد إعلانات حالياً') {
    return `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-state-icon">📭</div>
        <h3>${message}</h3>
        <p>عد قريباً، الإعلانات الجديدة تُضاف باستمرار</p>
      </div>
    `;
  },

  /* ============ صفحة الصنف ============ */

  async initCategoryPage() {
    const categoryId = App.getURLParam('cat');
    const searchQuery = App.getURLParam('q');

    const titleEl = document.getElementById('categoryTitle');
    const gridEl = document.getElementById('categoryGrid');

    if (!gridEl) return;

    // حالة البحث
    if (searchQuery) {
      if (titleEl) titleEl.textContent = `🔍 نتائج البحث: ${searchQuery}`;
      const results = await this.search(searchQuery);
      await this.renderGrid('categoryGrid', results);
      return;
    }

    // حالة الصنف
    if (categoryId) {
      const catName = await this.getCategoryName(categoryId);
      if (titleEl) titleEl.textContent = catName;
      document.title = catName + ' - كلشي كلاشي';

      const products = await this.getByCategory(categoryId);
      await this.renderGrid('categoryGrid', products);

      // تفعيل فلتر الأحدث/الأرخص
      this.setupFilters(products);
      return;
    }

    // لا صنف ولا بحث - عرض الكل
    if (titleEl) titleEl.textContent = 'كل الإعلانات';
    const all = await this.loadAll();
    await this.renderGrid('categoryGrid', all);
  },

  /* إعداد الفلاتر (ترتيب) */
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

  /* ============ صفحة المنتج ============ */

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
    this.renderProductDetails(product);
    await this.renderSimilar(product);
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
            <button class="btn btn-report" onclick="Products.reportProduct('${product.id}')">
              ⚠️ إبلاغ
            </button>
          </div>
        </div>
      </div>
    `;

    // تفعيل مصغرات الصور
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

    similarEl.innerHTML = `
      <h2 class="section-title">🔎 إعلانات مشابهة</h2>
      <div class="products-grid">
        ${similar.map(p => App.productCardHTML(p)).join('')}
      </div>
    `;
  },

  /* الإبلاغ عن منتج */
  async reportProduct(productId) {
    if (!confirm('هل تريد الإبلاغ عن هذا الإعلان؟')) return;

    const product = await this.getById(productId);
    if (!product) return;

    const user = KK.getUser();

    const report = {
      type: 'report',
      productId: productId,
      productTitle: product.title,
      reporterName: user ? user.name : 'زائر',
      reporterPhone: user ? user.phone : '',
      reportedAt: new Date().toISOString()
    };

    // إرسال إلى تليجرام
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

  /* ============ الصفحة الرئيسية ============ */

  async initHomePage() {
    // عرض الأصناف
    await this.renderCategories();

    // عرض أحدث الإعلانات
    const all = await this.loadAll();
    const latest = all.slice(0, 8);
    await this.renderGrid('latestProducts', latest);
  },

  /* عرض الأصناف */
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
