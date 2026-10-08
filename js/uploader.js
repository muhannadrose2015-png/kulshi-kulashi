/* ==========================================
   uploader.js - رفع الصور إلى GitHub
   ========================================== */

const Uploader = {

  MAX_IMAGES: 5,
  MAX_SIZE_KB: 400,

  /* الملفات المختارة (مؤقتاً) */
  _files: [],

  /* اختيار الصور */
  async handleFiles(fileList) {
    const files = Array.from(fileList);

    // فحص عدد الصور
    if (this._files.length + files.length > this.MAX_IMAGES) {
      App.toast(`الحد الأقصى ${this.MAX_IMAGES} صور`, 'error');
      return false;
    }

    for (const file of files) {
      // فحص النوع
      if (!file.type.startsWith('image/')) {
        App.toast(`الملف ${file.name} ليس صورة`, 'error');
        continue;
      }

      // فحص الحجم قبل الضغط (5MB)
      if (file.size > 5 * 1024 * 1024) {
        App.toast(`الصورة ${file.name} كبيرة جداً (5MB)`, 'error');
        continue;
      }

      try {
        const compressed = await App.compressImage(file, this.MAX_SIZE_KB);
        this._files.push({
          original: file.name,
          data: compressed,
          size: Math.round(compressed.length * 3 / 4 / 1024)
        });
      } catch (e) {
        console.error('خطأ في ضغط الصورة:', e);
        App.toast(`فشل معالجة ${file.name}`, 'error');
      }
    }

    this.renderPreview();
    return true;
  },

  /* عرض الصور المختارة */
  renderPreview() {
    const container = document.getElementById('uploadPreview');
    if (!container) return;

    if (this._files.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = this._files.map((f, i) => `
      <div class="upload-thumb">
        <img src="${f.data}" alt="صورة ${i + 1}">
        <button type="button" class="remove-thumb" onclick="Uploader.removeFile(${i})">✕</button>
        <div class="thumb-size">${f.size}KB</div>
      </div>
    `).join('');
  },

  /* حذف صورة */
  removeFile(index) {
    this._files.splice(index, 1);
    this.renderPreview();
  },

  /* مسح كل الصور */
  clear() {
    this._files = [];
    this.renderPreview();
  },

  /* عدد الصور */
  count() {
    return this._files.length;
  },

  /* رفع كل الصور إلى GitHub */
  async uploadAll() {
    if (this._files.length === 0) {
      return [];
    }

    const urls = [];
    const total = this._files.length;

    for (let i = 0; i < total; i++) {
      // تحديث شريط التقدم
      this.updateProgress(i + 1, total, `جارٍ رفع الصورة ${i + 1}/${total}...`);

      try {
        const url = await this.uploadOne(this._files[i].data, this._files[i].original);
        if (url) urls.push(url);
      } catch (e) {
        console.error('فشل رفع صورة:', e);
        App.toast(`فشل رفع الصورة ${i + 1}`, 'error');
      }
    }

    this.updateProgress(total, total, '✅ تم رفع الصور');
    return urls;
  },

  /* رفع صورة واحدة */
  async uploadOne(base64, filename) {
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64: base64,
        filename: filename
      })
    });

    const data = await response.json();

    if (data.success && data.url) {
      return data.url;
    } else {
      throw new Error(data.error || 'فشل الرفع');
    }
  },

  /* شريط التقدم */
  updateProgress(current, total, text) {
    const el = document.getElementById('uploadProgress');
    if (!el) return;

    const percent = Math.round((current / total) * 100);
    el.style.display = 'block';
    el.innerHTML = `
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${percent}%"></div>
      </div>
      <p class="progress-text">${text}</p>
    `;
  },

  /* إخفاء شريط التقدم */
  hideProgress() {
    const el = document.getElementById('uploadProgress');
    if (el) el.style.display = 'none';
  },

  /* ربط حقل الملفات */
  bindInput(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    input.addEventListener('change', async (e) => {
      await this.handleFiles(e.target.files);
      // إعادة تعيين القيمة للسماح باختيار نفس الصورة مرة أخرى
      input.value = '';
    });
  }
};

window.Uploader = Uploader;
