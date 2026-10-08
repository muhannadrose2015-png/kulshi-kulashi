/* admin.js - منطق لوحة التحكم */

const ADMIN_PASSWORD = '1992/11/24';
const SESSION_KEY = 'kk_admin_session';
const SESSION_DURATION = 2 * 60 * 60 * 1000;

function tryLogin() {
  if (KK.isLocked()) {
    const attempts = KK.getLoginAttempts();
    const remaining = Math.ceil((attempts.lockedUntil - Date.now()) / 60000);
    document.getElementById('loginError').textContent =
      `🚫 محظور مؤقتاً. حاول بعد ${remaining} دقيقة`;
    return;
  }

  const input = document.getElementById('passwordInput').value;
  const errorEl = document.getElementById('loginError');

  if (input === ADMIN_PASSWORD) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      loggedIn: true,
      expiresAt: Date.now() + SESSION_DURATION
    }));
    KK.resetLoginAttempts();
    showPanel();
  } else {
    KK.recordFailedAttempt();
    const attempts = KK.getLoginAttempts();
    const remaining = 5 - attempts.count;
    errorEl.textContent = `❌ كلمة المرور خاطئة. متبقي ${remaining} محاولات`;
    document.getElementById('passwordInput').value = '';
  }
}

function isLoggedIn() {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (!session || !session.loggedIn) return false;
    if (Date.now() > session.expiresAt) {
      sessionStorage.removeItem(SESSION_KEY);
      return false;
    }
    return true;
  } catch (e) { return false; }
}

function showPanel() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminPanel').style.display = 'block';
  initPanel();
}

function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
}

function initPanel() {
  loadStats();
  loadInfo();
  checkStatus();
  setInterval(checkStatus, 30000);
}

function loadStats() {
  const user = KK.getUser();
  document.getElementById('statUser').textContent = user ? user.name : 'غير مسجل';
  document.getElementById('statMyOrders').textContent = KK.getMyOrders().length;
  document.getElementById('statCachedAds').textContent = KK.getCachedAds().length;
}

function loadInfo() {
  document.getElementById('infoVersion').textContent = '1.0.0';
  document.getElementById('infoRepo').textContent = 'muhannadrose2015-png/kulshi-kulashi';
  document.getElementById('infoUrl').textContent = location.origin;
  document.getElementById('infoBrowser').textContent =
    navigator.userAgent.split(' ').slice(-2).join(' ');
  document.getElementById('infoTime').textContent = new Date().toLocaleString('ar-IQ');
}

async function checkStatus() {
  await checkGithub();
  await checkTelegram();
  await checkData();
}

async function checkGithub() {
  const el = document.getElementById('statusGithub');
  const icon = el.querySelector('.status-icon');
  const text = el.querySelector('.status-text');

  try {
    const repo = 'muhannadrose2015-png/kulshi-kulashi';
    const response = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });

    if (response.ok) {
      el.classList.add('ok');
      el.classList.remove('error');
      icon.textContent = '✅';
      text.textContent = 'متصل - المستودع موجود';
    } else {
      throw new Error('فشل');
    }
  } catch (e) {
    el.classList.add('error');
    el.classList.remove('ok');
    icon.textContent = '❌';
    text.textContent = 'فشل الاتصال';
  }
}

async function checkTelegram() {
  const el = document.getElementById('statusTelegram');
  const icon = el.querySelector('.status-icon');
  const text = el.querySelector('.status-text');

  try {
    const response = await fetch('/api/status');
    if (response.ok) {
      const data = await response.json();
      if (data.telegram === 'ok') {
        el.classList.add('ok');
        el.classList.remove('error');
        icon.textContent = '✅';
        text.textContent = 'البوت يعمل';
      } else {
        throw new Error('البوت لا يستجيب');
      }
    } else {
      throw new Error('Function غير متاحة');
    }
  } catch (e) {
    el.classList.add('error');
    el.classList.remove('ok');
    icon.textContent = '⚠️';
    text.textContent = 'يحتاج إعداد Cloudflare';
  }
}

async function checkData() {
  const el = document.getElementById('statusData');
  const icon = el.querySelector('.status-icon');
  const text = el.querySelector('.status-text');

  try {
    const response = await fetch('/data/ads.json');
    if (response.ok) {
      const data = await response.json();
      el.classList.add('ok');
      el.classList.remove('error');
      icon.textContent = '✅';
      text.textContent = `${data.length || 0} إعلان`;
    } else {
      throw new Error('ملف غير موجود');
    }
  } catch (e) {
    el.classList.add('error');
    el.classList.remove('ok');
    icon.textContent = '⚠️';
    text.textContent = 'ملف ads.json غير جاهز';
  }
}

async function testTelegram() {
  const resultEl = document.getElementById('testResult');
  resultEl.className = 'test-result';
  resultEl.textContent = '⏳ جارٍ الإرسال...';

  try {
    const response = await fetch('/api/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'test',
        message: '🧪 رسالة تجريبية من لوحة تحكم كلشي كلاشي'
      })
    });

    const data = await response.json();

    if (data.success) {
      resultEl.className = 'test-result success';
      resultEl.textContent = '✅ تم إرسال الرسالة بنجاح إلى تليجرام';
    } else {
      throw new Error(data.error || 'فشل الإرسال');
    }
  } catch (e) {
    resultEl.className = 'test-result error';
    resultEl.textContent = `❌ ${e.message}`;
  }
}

function exportData() {
  const data = KK.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kulshi-backup-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function clearMyOrders() {
  if (confirm('هل أنت متأكد من مسح كل الطلبات المحلية؟')) {
    KK.clearMyOrders();
    loadStats();
    alert('✅ تم');
  }
}

function clearUser() {
  if (confirm('سيتم تسجيل خروج المستخدم الحالي. متابعة؟')) {
    KK.clearUser();
    loadStats();
    alert('✅ تم');
  }
}

function clearAll() {
  if (confirm('⚠️ تحذير! سيتم مسح كل البيانات المحلية. متابعة؟')) {
    if (confirm('هل أنت متأكد تماماً؟')) {
      KK.clearAll();
      sessionStorage.removeItem(SESSION_KEY);
      location.reload();
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (isLoggedIn()) showPanel();
  document.getElementById('passwordInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') tryLogin();
  });
});
