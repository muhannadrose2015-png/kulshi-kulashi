/* ==========================================
   products.js - إدارة الإعلانات + التقييمات
   ========================================== */

const Products = {

  _cache: null,
  _cacheTime: 0,
  _cacheDuration: 60 * 1000,
  _viewsCache: null,
  _viewsCacheTime: 0,
  _viewsCacheDuration: 5 * 60 * 1000,

  /* ===== تحميل الإعلانات ===== */
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

  /* ===== تحميل المشاهدات ===== */
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

  async getViews(productId) {
    const views = await this.loadViews();
    return views[productId] || 0;
  },

  /* ===== دوال أساسية ===== */
  async getById(id) {
    const all = await this.loadAll();
    return all.find(p => String(p.id) === String(id));
  },

  async getByCategory(categoryId) {
    const all = await this.loadAll();
    return all.filter(p => p.category === categoryId);
  },

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

  /* ===== شبكة الإعلانات ===== */
  async renderGrid(containerId, products) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!products || products.length === 0) {
      container.innerHTML = this.emptyStateHTML();
      return;
    }

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

  /* ===== صفحة الصنف ===== */
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

  /* ===== صفحة المنتج ===== */
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

    this.trackView(productId);
    this.renderProductDetails(product);
    await this.renderSimilar(product);
    await this.renderReviews(productId);
  },

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
    } catch (e) {}
  },

  renderProductDetails(product) {
  const bodyEl = document.getElementById('productBody');
  const images = (product.images && product.images.length)
    ? product.images
    : ['data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23f0f0f0" width="100" height="100"/><text x="50" y="55" font-size="30" text-anchor="middle" fill="%23999">📷</text></svg>'];

  const price = App.formatPrice(product.price, product.currency);
  const isSold = product.sold === true;

  const waLink = App.whatsappLink(
    product.whatsapp || product.ownerPhone,
    `مرحباً، مهتم بـ: ${product.title}`
  );

  // معالجة حالة "تم البيع"
  const soldBanner = isSold ? `
    <div class="sold-banner">
      <div class="sold-banner-icon">🔴</div>
      <div class="sold-banner-content">
        <div class="sold-banner-title">تم بيع هذا المنتج</div>
        <div class="sold-banner-subtitle">قد يكون هناك منتجات مشابهة في نفس الصنف</div>
      </div>
    </div>
  ` : '';

  // زر واتساب (معطّل إذا تم البيع)
  const waButton = isSold
    ? `<button class="btn btn-whatsapp disabled" disabled>💬 المنتج مباع</button>`
    : `<a href="${waLink}" target="_blank" class="btn btn-whatsapp">💬 تواصل عبر واتساب</a>`;

  bodyEl.innerHTML = `
    <div class="product-details ${isSold ? 'is-sold' : ''}">
      ${soldBanner}
      <div class="product-gallery">
        <img id="mainImage" src="${images[0]}" alt="${App.escapeHTML(product.title)}">
        ${isSold ? `<div class="sold-overlay-large">🔴 تم البيع</div>` : ''}
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
          ${waButton}
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

  async shareProduct(productId) {
    const product = await this.getById(productId);
    if (!product) return;

    const url = window.location.href;
    const text = `🛒 ${product.title}\n💰 ${App.formatPrice(product.price, product.currency)}\n\nشاهد على كلشي كلاشي:`;

    if (navigator.share) {
      try {
        await navigator.share({ title: product.title, text: text, url: url });
      } catch (e) {}
    } else {
      try {
        await navigator.clipboard.writeText(url);
        App.toast('✅ تم نسخ الرابط', 'success');
      } catch (e) {
        App.toast('انسخ الرابط يدوياً: ' + url, 'info');
      }
    }
  },

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

  async reportProduct(productId) {
    const product = await this.getById(productId);
    if (!product) return;

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
        body: JSON.stringify({ action: 'report', data: report })
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

  showReportDialog() {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.onclick = (e) => {
        if (e.target === modal) { modal.remove(); resolve(null); }
      };

      modal.innerHTML = `
        <div class="modal-box">
          <div class="modal-title">⚠️ الإبلاغ عن إعلان</div>
          <div class="modal-subtitle">اختر سبب الإبلاغ</div>
          <div class="report-reasons">
            <button class="report-reason" data-reason="منتج مزيّف أو مزيف"><span>🚫</span> منتج مزيّف أو مزيف</button>
            <button class="report-reason" data-reason="محتوى مخالف أو غير لائق"><span>⚠️</span> محتوى مخالف أو غير لائق</button>
            <button class="report-reason" data-reason="سعر خاطئ أو مضلل"><span>💰</span> سعر خاطئ أو مضلل</button>
            <button class="report-reason" data-reason="إعلان مكرر"><span>📋</span> إعلان مكرر</button>
            <button class="report-reason" data-reason="احتيال أو نصب"><span>🚨</span> احتيال أو نصب</button>
            <button class="report-reason" data-reason="سبب آخر"><span>📝</span> سبب آخر</button>
          </div>
          <button class="btn btn-secondary btn-full" style="margin-top:15px;" onclick="this.closest('.modal-overlay').remove();">إلغاء</button>
        </div>
      `;

      const style = document.createElement('style');
      style.textContent = `
        .report-reasons { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
        .report-reason { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: #f8f9fa; border: 2px solid #e0e0e0; border-radius: 10px; font-family: inherit; font-size: 14px; font-weight: bold; color: #232f3e; cursor: pointer; transition: 0.2s; text-align: right; }
        .report-reason:hover, .report-reason:active { background: #fff9f0; border-color: #ff9900; }
        .report-reason span { font-size: 22px; }
      `;
      modal.appendChild(style);
      document.body.appendChild(modal);

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
     نظام التقييمات الجديد
     ========================================== */
  async renderReviews(productId) {
    const reviewsEl = document.getElementById('reviewsSection');
    if (!reviewsEl) return;

    reviewsEl.innerHTML = `
      <div class="loading" style="padding:20px;">
        <div class="spinner"></div>
      </div>
    `;

    try {
      const user = KK.getUser();
      const phoneParam = user ? encodeURIComponent(user.phone) : '';

      const response = await fetch(`/api/get-reviews?id=${encodeURIComponent(productId)}&phone=${phoneParam}`);
      const data = await response.json();

      if (!data.success) {
        reviewsEl.innerHTML = '';
        return;
      }

      this.displayReviews(productId, data);

    } catch (e) {
      console.error('Reviews load error:', e);
      reviewsEl.innerHTML = '';
    }
  },

  displayReviews(productId, data) {
    const reviewsEl = document.getElementById('reviewsSection');
    if (!reviewsEl) return;

    const { reviews = [], userReview = null, average = 0, total = 0 } = data;

    // نجوم المتوسط
    let starsHTML = '';
    if (total > 0) {
      const fullStars = Math.round(average);
      for (let i = 1; i <= 5; i++) {
        starsHTML += i <= fullStars ? '⭐' : '☆';
      }
    }

    // نموذج/تقييم المستخدم
    let userSectionHTML = '';
    if (userReview) {
      // المستخدم قيّم مسبقاً → اعرض تقييمه مميزاً مع زر تعديل
      userSectionHTML = this.userReviewCardHTML(userReview);
    } else {
      // نموذج تقييم جديد
      userSectionHTML = this.reviewFormHTML(productId);
    }

    // تقييمات الآخرين (بدون المستخدم)
    const otherReviews = reviews;

    reviewsEl.innerHTML = `
      <h2 class="section-title">⭐ التقييمات (${total})</h2>

      <div class="reviews-container">
        ${total > 0 ? `
          <div class="reviews-summary">
            <div class="reviews-average">${average}</div>
            <div class="reviews-stars-big">${starsHTML}</div>
            <div class="reviews-count">${total} تقييم</div>
          </div>
        ` : ''}

        ${userSectionHTML}

        ${otherReviews.length > 0 ? `
          <div class="reviews-list">
            ${otherReviews.map(r => this.reviewItemHTML(r)).join('')}
          </div>
        ` : ''}
      </div>
    `;

    // تفعيل اختيار النجوم إذا كنا في نموذج جديد
    if (!userReview) {
      this.setupRatingSelector();
    }
  },

  /* بطاقة تقييم المستخدم (مميزة مع زر تعديل) */
  userReviewCardHTML(review) {
    const stars = '⭐'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
    const isEdited = review.isEdited || review.updatedAt;

    return `
      <div class="user-review-card">
        <div class="user-review-badge">📝 تقييمك</div>
        <div class="review-header">
          <div class="review-avatar">${App.escapeHTML(review.reviewerName.charAt(0) || 'أ')}</div>
          <div class="review-info">
            <div class="review-name">${App.escapeHTML(review.reviewerName)}</div>
            <div class="review-date">
              ${App.formatDate(review.createdAt)}
              ${isEdited ? '<span style="color:var(--accent);"> (مُعدّل)</span>' : ''}
            </div>
          </div>
          <div class="review-stars">${stars}</div>
        </div>
        ${review.comment ? `<div class="review-comment">${App.escapeHTML(review.comment)}</div>` : ''}
        <div class="user-review-actions">
          <button class="btn btn-secondary" onclick="Products.editReview('${review.productId}')">
            ✏️ تعديل تقييمي
          </button>
        </div>
      </div>
    `;
  },

  /* نموذج تقييم جديد */
  reviewFormHTML(productId) {
    return `
      <div class="review-form-box">
        <h3>⭐ قيّم هذا الإعلان</h3>
        <div class="review-rating-selector" id="ratingSelector" data-rating="0">
          <span class="star-btn" data-value="1">⭐</span>
          <span class="star-btn" data-value="2">⭐</span>
          <span class="star-btn" data-value="3">⭐</span>
          <span class="star-btn" data-value="4">⭐</span>
          <span class="star-btn" data-value="5">⭐</span>
        </div>
        <textarea id="reviewComment" placeholder="اكتب تعليقك (اختياري)" maxlength="300" rows="3" class="review-textarea"></textarea>
        <button class="btn btn-primary btn-full" onclick="Products.submitReview('${productId}', false)">
          📝 إرسال التقييم
        </button>
      </div>
    `;
  },

  /* عرض تقييم عادي (من شخص آخر) */
  reviewItemHTML(review) {
    const stars = '⭐'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
    const name = App.escapeHTML(review.reviewerName || 'زائر');
    const initial = name.charAt(0).toUpperCase();
    const isEdited = review.isEdited || review.updatedAt;

    return `
      <div class="review-item">
        <div class="review-header">
          <div class="review-avatar">${initial}</div>
          <div class="review-info">
            <div class="review-name">${name}</div>
            <div class="review-date">
              ${App.formatDate(review.createdAt)}
              ${isEdited ? '<span style="color:var(--accent);"> (مُعدّل)</span>' : ''}
            </div>
          </div>
          <div class="review-stars">${stars}</div>
        </div>
        ${review.comment ? `<div class="review-comment">${App.escapeHTML(review.comment)}</div>` : ''}
      </div>
    `;
  },

  setupRatingSelector() {
    const selector = document.getElementById('ratingSelector');
    if (!selector) return;

    let currentRating = parseInt(selector.dataset.rating || 0);
    const stars = selector.querySelectorAll('.star-btn');

    // تفعيل النجوم الحالية (عند التعديل)
    if (currentRating > 0) {
      stars.forEach((s, i) => {
        s.classList.toggle('active', i < currentRating);
        s.classList.toggle('selected', i < currentRating);
      });
    }

    stars.forEach((star, index) => {
      star.addEventListener('mouseenter', () => {
        stars.forEach((s, i) => {
          s.classList.toggle('active', i <= index);
        });
      });

      star.addEventListener('click', () => {
        currentRating = index + 1;
        selector.dataset.rating = currentRating;
        stars.forEach((s, i) => {
          s.classList.toggle('active', i <= index);
          s.classList.toggle('selected', i <= index);
        });
      });
    });

    selector.addEventListener('mouseleave', () => {
      stars.forEach((s, i) => {
        s.classList.remove('active');
        if (i < currentRating) s.classList.add('active', 'selected');
      });
    });
  },

  /* تعديل التقييم */
  async editReview(productId) {
    const user = KK.getUser();
    if (!user) {
      App.toast('يجب تسجيل الدخول', 'error');
      return;
    }

    // جلب تقييم المستخدم الحالي
    const response = await fetch(`/api/get-reviews?id=${encodeURIComponent(productId)}&phone=${encodeURIComponent(user.phone)}`);
    const data = await response.json();

    if (!data.success || !data.userReview) {
      App.toast('لم يتم العثور على تقييمك', 'error');
      return;
    }

    const current = data.userReview;

    // فتح نافذة تعديل
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    modal.innerHTML = `
      <div class="modal-box">
        <div class="modal-title">✏️ تعديل التقييم</div>
        <div class="modal-subtitle">عدّل تقييمك وتعليقك</div>
        <div class="review-rating-selector" id="editRatingSelector" data-rating="${current.rating}">
          <span class="star-btn" data-value="1">⭐</span>
          <span class="star-btn" data-value="2">⭐</span>
          <span class="star-btn" data-value="3">⭐</span>
          <span class="star-btn" data-value="4">⭐</span>
          <span class="star-btn" data-value="5">⭐</span>
        </div>
        <textarea id="editReviewComment" placeholder="اكتب تعليقك (اختياري)" maxlength="300" rows="3" class="review-textarea">${App.escapeHTML(current.comment || '')}</textarea>
        <div style="display:flex;gap:8px;margin-top:15px;">
          <button class="btn btn-secondary" style="flex:1;" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
          <button class="btn btn-primary" style="flex:2;" onclick="Products.saveEditedReview('${productId}')">💾 حفظ التعديل</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // إعداد النجوم
    this.setupEditRatingSelector();
  },

  setupEditRatingSelector() {
    const selector = document.getElementById('editRatingSelector');
    if (!selector) return;

    let currentRating = parseInt(selector.dataset.rating || 0);
    const stars = selector.querySelectorAll('.star-btn');

    stars.forEach((s, i) => {
      s.classList.toggle('active', i < currentRating);
      s.classList.toggle('selected', i < currentRating);
    });

    stars.forEach((star, index) => {
      star.addEventListener('mouseenter', () => {
        stars.forEach((s, i) => s.classList.toggle('active', i <= index));
      });

      star.addEventListener('click', () => {
        currentRating = index + 1;
        selector.dataset.rating = currentRating;
        stars.forEach((s, i) => {
          s.classList.toggle('active', i <= index);
          s.classList.toggle('selected', i <= index);
        });
      });
    });

    selector.addEventListener('mouseleave', () => {
      stars.forEach((s, i) => {
        s.classList.remove('active');
        if (i < currentRating) s.classList.add('active', 'selected');
      });
    });
  },

  async saveEditedReview(productId) {
    const selector = document.getElementById('editRatingSelector');
    const rating = parseInt(selector?.dataset.rating || 0);
    const comment = document.getElementById('editReviewComment').value.trim();

    if (!rating || rating < 1 || rating > 5) {
      App.toast('اختر تقييماً من 1 إلى 5 نجوم', 'error');
      return;
    }

    await this.submitReview(productId, true, rating, comment);

    // إغلاق النافذة
    const modal = document.querySelector('.modal-overlay');
    if (modal) modal.remove();
  },

  async submitReview(productId, isUpdate = false, overrideRating = null, overrideComment = null) {
    const user = KK.getUser();
    if (!user || !user.phone) {
      App.toast('يجب تسجيل الدخول للتقييم', 'error');
      return;
    }

    let rating, comment;

    if (isUpdate && overrideRating !== null) {
      rating = overrideRating;
      comment = overrideComment || '';
    } else {
      const selector = document.getElementById('ratingSelector');
      rating = parseInt(selector?.dataset.rating || 0);
      comment = document.getElementById('reviewComment')?.value.trim() || '';

      if (!rating || rating < 1 || rating > 5) {
        App.toast('اختر تقييماً من 1 إلى 5 نجوم', 'error');
        return;
      }
    }

    // تعطيل الزر
    const btn = event?.target;
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ جارٍ الإرسال...';
    }

    try {
      const response = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: productId,
          rating: rating,
          comment: comment,
          reviewerName: user.name,
          reviewerPhone: user.phone,
          isUpdate: isUpdate
        })
      });

      const data = await response.json();

      if (data.success) {
        App.toast(isUpdate ? '✅ تم تحديث تقييمك' : '✅ شكراً لتقييمك!', 'success');
        await this.renderReviews(productId);
      } else {
        App.toast('❌ ' + (data.error || 'فشل الإرسال'), 'error');
        if (btn) {
          btn.disabled = false;
          btn.textContent = '📝 إرسال التقييم';
        }
      }
    } catch (e) {
      App.toast('❌ فشل الإرسال', 'error');
      if (btn) {
        btn.disabled = false;
        btn.textContent = '📝 إرسال التقييم';
      }
    }
  },

  /* ===== الصفحة الرئيسية ===== */
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
