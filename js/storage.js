/* ==========================================
   storage.js - إدارة التخزين المحلي (نسخة userId)
   ========================================== */

const KK = {
  KEYS: {
    USER_ID: 'kk_user_id',           // ← الجديد: معرّف المستخدم
    USER_CACHE: 'kk_user_cache',     // ← نسخة مخزّنة من بيانات المستخدم
    MY_ORDERS: 'kk_my_orders',
    CACHED_ADS: 'kk_cached_ads',
    SETTINGS: 'kk_settings',
    LOGIN_ATTEMPTS: 'kk_login_attempts'
  },

  /* ===== معرّف المستخدم ===== */
  getUserId() {
    try {
      return localStorage.getItem(this.KEYS.USER_ID);
    } catch (e) {
      return null;
    }
  },

  setUserId(userId) {
    try {
      localStorage.setItem(this.KEYS.USER_ID, userId);
      return true;
    } catch (e) {
      return false;
    }
  },

  clearUserId() {
    localStorage.removeItem(this.KEYS.USER_ID);
    localStorage.removeItem(this.KEYS.USER_CACHE);
  },

  /* ===== بيانات المستخدم (cache) ===== */
  getUser() {
    try {
      const data = localStorage.getItem(this.KEYS.USER_CACHE);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },

  setUser(user) {
    try {
      // نُخزّن userId + بيانات المستخدم
      if (user && user.userId) {
        localStorage.setItem(this.KEYS.USER_ID, user.userId);
      }
      localStorage.setItem(this.KEYS.USER_CACHE, JSON.stringify(user));
      return true;
    } catch (e) {
      return false;
    }
  },

  clearUser() {
    this.clearUserId();
  },

  /* ===== جلب بيانات المستخدم من السيرفر ===== */
  async fetchUserFromServer(userId) {
    if (!userId) return null;

    try {
      const response = await fetch(`/api/get-user?userId=${encodeURIComponent(userId)}`);
      const data = await response.json();

      if (data.success && data.user) {
        // حفظ نسخة محلية
        this.setUser(data.user);
        return data.user;
      }
      return null;
    } catch (e) {
      console.error('Fetch user error:', e);
      return null;
    }
  },

  /* ===== مزامنة بيانات المستخدم ===== */
  async syncUser() {
    const userId = this.getUserId();
    if (!userId) return null;

    const user = await this.fetchUserFromServer(userId);
    if (user) {
      this.setUser(user);
    }
    return user;
  },

  /* ===== طلباتي ===== */
  getMyOrders() {
    try {
      const data = localStorage.getItem(this.KEYS.MY_ORDERS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  addMyOrder(order) {
    const orders = this.getMyOrders();
    orders.unshift(order);
    localStorage.setItem(this.KEYS.MY_ORDERS, JSON.stringify(orders));
    return order;
  },

  updateMyOrder(orderCode, updates) {
    const orders = this.getMyOrders();
    const index = orders.findIndex(o => o.code === orderCode);
    if (index !== -1) {
      orders[index] = { ...orders[index], ...updates };
      localStorage.setItem(this.KEYS.MY_ORDERS, JSON.stringify(orders));
      return true;
    }
    return false;
  },

  clearMyOrders() {
    localStorage.removeItem(this.KEYS.MY_ORDERS);
  },

  /* ===== الإعلانات المؤقتة ===== */
  getCachedAds() {
    try {
      const data = localStorage.getItem(this.KEYS.CACHED_ADS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  setCachedAds(ads) {
    localStorage.setItem(this.KEYS.CACHED_ADS, JSON.stringify(ads));
  },

  /* ===== الإعدادات ===== */
  getSettings() {
    try {
      const data = localStorage.getItem(this.KEYS.SETTINGS);
      return data ? JSON.parse(data) : { theme: 'light', language: 'ar' };
    } catch (e) {
      return { theme: 'light', language: 'ar' };
    }
  },

  setSettings(settings) {
    localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(settings));
  },

  /* ===== محاولات تسجيل الدخول ===== */
  getLoginAttempts() {
    try {
      const data = localStorage.getItem(this.KEYS.LOGIN_ATTEMPTS);
      return data ? JSON.parse(data) : { count: 0, lockedUntil: null };
    } catch (e) {
      return { count: 0, lockedUntil: null };
    }
  },

  recordFailedAttempt() {
    const attempts = this.getLoginAttempts();
    attempts.count += 1;
    if (attempts.count >= 5) {
      attempts.lockedUntil = Date.now() + (60 * 60 * 1000);
    }
    localStorage.setItem(this.KEYS.LOGIN_ATTEMPTS, JSON.stringify(attempts));
  },

  resetLoginAttempts() {
    localStorage.removeItem(this.KEYS.LOGIN_ATTEMPTS);
  },

  isLocked() {
    const attempts = this.getLoginAttempts();
    if (!attempts.lockedUntil) return false;
    if (Date.now() > attempts.lockedUntil) {
      this.resetLoginAttempts();
      return false;
    }
    return true;
  },

  /* ===== أدوات عامة ===== */
  clearAll() {
    Object.values(this.KEYS).forEach(key => localStorage.removeItem(key));
  },

  exportAll() {
    const data = {};
    Object.entries(this.KEYS).forEach(([name, key]) => {
      const value = localStorage.getItem(key);
      data[name] = value ? JSON.parse(value) : null;
    });
    return data;
  }
};

window.KK = KK;
