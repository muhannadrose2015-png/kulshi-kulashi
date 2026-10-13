/* ==========================================
   favorites.js - نظام المفضلة
   يحفظ الإعلانات في LocalStorage
   ========================================== */

const Favorites = {

  STORAGE_KEY: 'kk_favorites',

  /* ===== قراءة كل المفضلة ===== */
  getAll() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  /* ===== حفظ المفضلة ===== */
  saveAll(list) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      console.error('Save favorites error:', e);
      return false;
    }
  },

  /* ===== هل الإعلان في المفضلة؟ ===== */
  isFavorite(productId) {
    const list = this.getAll();
    return list.some(f => String(f.id) === String(productId));
  },

  /* ===== إضافة إلى المفضلة ===== */
  add(product) {
    if (this.isFavorite(product.id)) return true;

    const list = this.getAll();
    list.unshift({
      id: product.id,
      title: product.title,
      price: product.price,
      currency: product.currency,
      image: (product.images && product.images[0]) || null,
      city: product.city,
      addedAt: new Date().toISOString()
    });

    return this.saveAll(list);
  },

  /* ===== إزالة من المفضلة ===== */
  remove(productId) {
    const list = this.getAll();
    const filtered = list.filter(f => String(f.id) !== String(productId));
    return this.saveAll(filtered);
  },

  /* ===== تبديل (إضافة/إزالة) ===== */
  toggle(product) {
    if (this.isFavorite(product.id)) {
      this.remove(product.id);
      return false;
    } else {
      this.add(product);
      return true;
    }
  },

  /* ===== عدد المفضلة ===== */
  count() {
    return this.getAll().length;
  },

  /* ===== حذف كل المفضلة ===== */
  clearAll() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      return true;
    } catch (e) {
      return false;
    }
  },

  /* ===== عرض زر ❤️ ===== */
  buttonHTML(productId, extraClass = '') {
    const isFav = this.isFavorite(productId);
    return `
      <button class="fav-btn ${isFav ? 'active' : ''} ${extraClass}" 
              onclick="Favorites.toggleById('${productId}', event)" 
              title="${isFav ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}">
        ${isFav ? '❤️' : '🤍'}
      </button>
    `;
  },

  /* ===== تبديل بواسطة ID ===== */
  async toggleById(productId, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    // جلب الإعلان من السيرفر
    try {
      const product = await Products.getById(productId);
      if (!product) {
        App.toast('لم يتم العثور على الإعلان', 'error');
        return;
      }

      const isNowFavorite = this.toggle(product);

      // تحديث الزر
      if (event && event.target) {
        const btn = event.target.closest('.fav-btn');
        if (btn) {
          btn.innerHTML = isNowFavorite ? '❤️' : '🤍';
          btn.classList.toggle('active', isNowFavorite);
          btn.title = isNowFavorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة';
        }
      }

      // إشعار
      App.toast(
        isNowFavorite ? '❤️ أُضيف إلى المفضلة' : '💔 أُزيل من المفضلة',
        'success'
      );

      // تحديث عدّاد المفضلة في الشريط السفلي
      this.updateBadge();

    } catch (e) {
      console.error('Toggle favorite error:', e);
      App.toast('حدث خطأ', 'error');
    }
  },

  /* ===== تحديث عدّاد المفضلة ===== */
  updateBadge() {
    const badge = document.getElementById('favBadge');
    if (!badge) return;

    const count = this.count();
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  },

  /* ===== عرض صفحة المفضلة ===== */
  async renderPage(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const list = this.getAll();

    if (list.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💔</div>
          <h3>لا توجد إعلانات في المفضلة</h3>
          <p>اضغط ❤️ على أي إعلان لحفظه هنا</p>
          <a href="/" class="btn btn-primary" style="margin-top:15px;">
            🏠 تصفح الإعلانات
          </a>
        </div>
      `;
      return;
    }

    // جلب بيانات الإعلانات الكاملة
    const allProducts = await Products.loadAll();
    const views = await Products.loadViews();

    // تصفية الإعلانات الموجودة فقط
    const validFavorites = list.filter(fav => 
      allProducts.some(p => String(p.id) === String(fav.id))
    );

    // إذا بعض الإعلانات محذوفة، حدّث القائمة
    if (validFavorites.length !== list.length) {
      this.saveAll(validFavorites);
    }

    if (validFavorites.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <h3>الإعلانات المحفوظة لم تعد موجودة</h3>
          <p>يبدو أن الإعلانات التي حفظتها قد حُذفت</p>
          <a href="/" class="btn btn-primary" style="margin-top:15px;">
            🏠 تصفح الإعلانات
          </a>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="favorites-info">
        ❤️ لديك <strong>${validFavorites.length}</strong> إعلان في المفضلة
      </div>
      <div class="products-grid" id="favoritesGrid">
        ${validFavorites.map(fav => {
          const product = allProducts.find(p => String(p.id) === String(fav.id));
          return App.productCardHTML(product, views[product.id] || 0);
        }).join('')}
      </div>
      <div style="text-align:center; margin-top:20px;">
        <button class="btn btn-secondary" onclick="Favorites.confirmClear()">
          🗑️ حذف كل المفضلة
        </button>
      </div>
    `;
  },

  /* ===== تأكيد حذف الكل ===== */
  confirmClear() {
    if (confirm('هل تريد حذف كل الإعلانات من المفضلة؟\n\nلا يمكن التراجع.')) {
      this.clearAll();
      App.toast('✅ تم حذف المفضلة', 'success');
      setTimeout(() => location.reload(), 500);
    }
  }
};

window.Favorites = Favorites;
