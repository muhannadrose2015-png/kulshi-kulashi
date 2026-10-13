/* ==========================================
   favorites.js - نظام المفضلة
   ========================================== */

const Favorites = {

  STORAGE_KEY: 'kk_favorites',

  /* قراءة كل المفضلة */
  getAll() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  /* حفظ المفضلة */
  saveAll(list) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  },

  /* هل الإعلان في المفضلة؟ */
  isFavorite(productId) {
    const list = this.getAll();
    return list.some(f => String(f.id) === String(productId));
  },

  /* إضافة */
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

  /* إزالة */
  remove(productId) {
    const list = this.getAll();
    const filtered = list.filter(f => String(f.id) !== String(productId));
    return this.saveAll(filtered);
  },

  /* تبديل */
  toggle(product) {
    if (this.isFavorite(product.id)) {
      this.remove(product.id);
      return false;
    } else {
      this.add(product);
      return true;
    }
  },

  /* عدد */
  count() {
    return this.getAll().length;
  },

  /* حذف الكل */
  clearAll() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      return true;
    } catch (e) {
      return false;
    }
  },

  /* HTML زر المفضلة */
  buttonHTML(productId, extraClass = '') {
    const isFav = this.isFavorite(productId);
    return `<button class="fav-btn ${isFav ? 'active' : ''} ${extraClass}" 
                    onclick="Favorites.toggleById('${productId}', event)" 
                    title="${isFav ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}">${isFav ? '❤️' : '🤍'}</button>`;
  },

  /* تبديل بواسطة ID */
  async toggleById(productId, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    try {
      // البحث عن الإعلان
      let product = null;

      // أولاً: من الـ cache
      if (window.Products && Products._cache) {
        product = Products._cache.find(p => String(p.id) === String(productId));
      }

      // ثانياً: من السيرفر
      if (!product && window.Products) {
        product = await Products.getById(productId);
      }

      if (!product) {
        if (window.App) App.toast('لم يتم العثور على الإعلان', 'error');
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
      if (window.App) {
        App.toast(
          isNowFavorite ? '❤️ أُضيف إلى المفضلة' : '💔 أُزيل من المفضلة',
          'success'
        );
      }

      // تحديث العدّاد
      this.updateBadge();

    } catch (e) {
      console.error('Toggle favorite error:', e);
      if (window.App) App.toast('حدث خطأ', 'error');
    }
  },

  /* تحديث عدّاد المفضلة */
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

  /* عرض صفحة المفضلة */
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

    try {
      const allProducts = await Products.loadAll();
      const views = await Products.loadViews();

      // تصفية الإعلانات الموجودة
      const validFavorites = list.filter(fav =>
        allProducts.some(p => String(p.id) === String(fav.id))
      );

      // تحديث القائمة
      if (validFavorites.length !== list.length) {
        this.saveAll(validFavorites);
      }

      if (validFavorites.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">📭</div>
            <h3>الإعلانات المحفوظة لم تعد موجودة</h3>
            <p>يبدو أن الإعلانات قد حُذفت</p>
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
        <div class="products-grid">
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
    } catch (e) {
      console.error('Render favorites error:', e);
      container.innerHTML = '<div class="empty-state"><p>حدث خطأ في التحميل</p></div>';
    }
  },

  /* تأكيد الحذف */
  confirmClear() {
    if (confirm('هل تريد حذف كل الإعلانات من المفضلة؟')) {
      this.clearAll();
      if (window.App) App.toast('✅ تم حذف المفضلة', 'success');
      setTimeout(() => location.reload(), 500);
    }
  }
};

window.Favorites = Favorites;



/* ==========================================
   إضافة تلقائية لرابط المفضلة في الشريط السفلي
   يعمل على جميع الصفحات
   ========================================== */
(function() {
  function addFavoritesNavLink() {
    const nav = document.querySelector('.bottom-nav');
    if (!nav) return;

    // إذا كان الرابط موجوداً، لا نفعل شيئاً
    if (nav.querySelector('a[href="/favorites.html"]')) {
      // تحديث العدّاد فقط
      if (typeof Favorites !== 'undefined') {
        Favorites.updateBadge();
      }
      return;
    }

    // ابحث عن رابط "الإضافة" كمرجع
    const addLink = nav.querySelector('a[href="/add.html"]');
    if (!addLink) return;

    // أنشئ رابط المفضلة
    const favLink = document.createElement('a');
    favLink.href = '/favorites.html';
    favLink.className = 'nav-item';
    favLink.innerHTML = `
      <span class="nav-icon">❤️</span>
      <span>المفضلة</span>
      <span class="fav-badge" id="favBadge" style="display:none;">0</span>
    `;

    // أضفه بعد "الإضافة"
    addLink.insertAdjacentElement('afterend', favLink);

    // تحديث العدّاد
    if (typeof Favorites !== 'undefined') {
      Favorites.updateBadge();
    }
  }

  // التشغيل بعد تحميل الصفحة
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addFavoritesNavLink);
  } else {
    addFavoritesNavLink();
  }
})();
