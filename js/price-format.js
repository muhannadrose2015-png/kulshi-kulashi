/* ==========================================
   price-format.js - تنسيق حقل السعر تلقائياً
   يُضيف فواصل الآلاف أثناء الكتابة
   ========================================== */

(function() {
  'use strict';

  function init() {
    const input = document.getElementById('adPrice');
    if (!input) return;

    input.addEventListener('input', handleInput);
    input.addEventListener('paste', handlePaste);
  }

  /* ===== معالجة الإدخال ===== */
  function handleInput(e) {
    let value = e.target.value;

    // إزالة كل ما ليس رقماً
    let numbersOnly = value.replace(/[^\d]/g, '');

    // إضافة فواصل الآلاف
    const formatted = formatNumber(numbersOnly);

    // عرض القيمة المنسّقة
    e.target.value = formatted;

    // حفظ القيمة الفعلية
    e.target.dataset.rawValue = numbersOnly;
  }

  /* ===== معالجة اللصق ===== */
  function handlePaste(e) {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    const numbers = pasted.replace(/[^\d]/g, '');

    if (numbers) {
      const current = e.target.dataset.rawValue || '';
      const newValue = current + numbers;
      e.target.value = formatNumber(newValue);
      e.target.dataset.rawValue = newValue;
    }
  }

  /* ===== تنسيق الرقم بفواصل ===== */
  function formatNumber(numStr) {
    if (!numStr) return '';

    const reversed = numStr.toString().split('').reverse().join('');
    const chunks = reversed.match(/.{1,3}/g) || [];
    const formatted = chunks.join(',').split('').reverse().join('');

    return formatted;
  }

  /* ===== التشغيل ===== */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
