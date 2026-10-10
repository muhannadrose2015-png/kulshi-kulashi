/* ==========================================
   Service Worker - كلشي كلاشي
   يسمح بالعمل بدون إنترنت وتخزين مؤقت
   ========================================== */

const CACHE_NAME = 'kulshi-v1';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 ساعة

// الملفات الأساسية للتخزين المسبق
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/category.html',
  '/product.html',
  '/add.html',
  '/my-ads.html',
  '/track.html',
  '/css/style.css',
  '/js/storage.js',
  '/js/app.js',
  '/js/auth.js',
  '/js/ban.js',
  '/js/products.js',
  '/js/uploader.js',
  '/js/submit.js',
  '/js/settings.js',
  '/images/logo.png',
  '/data/categories.json'
];

// ===== التثبيت =====
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.log('Precache error (some files may fail):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ===== التنشيط =====
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// ===== التعامل مع الطلبات =====
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // تجاهل طلبات:
  // - API (لأنها تحتاج السيرفر)
  // - غير GET
  // - دومينات خارجية (Telegram، GitHub، Google Fonts، إلخ)
  if (
    request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  // استراتيجية: Network first مع Cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        // نحفظ نسخة في الكاش
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone).catch(() => {});
          });
        }
        return response;
      })
      .catch(() => {
        // إذا فشل الاتصال، نقرأ من الكاش
        return caches.match(request).then((cached) => {
          if (cached) return cached;

          // صفحة 404 داخلية إذا لم نجد
          if (request.mode === 'navigate') {
            return caches.match('/');
          }

          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// ===== تحديث =====
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
