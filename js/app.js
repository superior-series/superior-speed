'use strict';

(function () {
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    // ----- Tabs -----
    var tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        tabButtons.forEach(function (b) {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        var tabName = btn.dataset.tab;
        document.querySelectorAll('.tab-panel').forEach(function (p) {
          p.classList.toggle('active', p.dataset.panel === tabName);
        });
      });
    });

    // ----- Elements -----
    var dropzone       = document.getElementById('dropzone');
    var fileInput       = document.getElementById('file-input');
    var fileListEl       = document.getElementById('file-list');
    var autoFormatCheckbox = document.getElementById('auto-format-checkbox');
    var qualitySlider    = document.getElementById('quality-slider');
    var qualityValueEl   = document.getElementById('quality-value');
    var resizeCheckbox   = document.getElementById('resize-checkbox');
    var resizeWidthInput = document.getElementById('resize-width');
    var convertBtn       = document.getElementById('convert-btn');
    var progressWrap     = document.getElementById('progress-wrap');
    var progressBarFill  = document.getElementById('progress-bar-fill');
    var progressLabel    = document.getElementById('progress-label');
    var statusMsg        = document.getElementById('status-msg');
    var resultsSection   = document.getElementById('results-section');
    var resultsList       = document.getElementById('results-list');
    var downloadAllBtn   = document.getElementById('download-all-btn');

    var selectedFiles = []; // { id, file, renameValue }
    var nextId = 1;
    var isConverting = false;

    // ----- Dropzone -----
    dropzone.addEventListener('click', function () { fileInput.click(); });
    dropzone.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });
    dropzone.addEventListener('dragover', function (e) {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', function () {
      dropzone.classList.remove('dragover');
    });
    dropzone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      addFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', function () {
      addFiles(fileInput.files);
      fileInput.value = '';
    });

    function addFiles(fileList) {
      Array.prototype.forEach.call(fileList, function (file) {
        if (file.type.indexOf('image/') !== 0) return;
        selectedFiles.push({ id: nextId++, file: file, renameValue: '' });
      });
      renderFileList();
      updateConvertButtonState();
    }

    function removeFile(id) {
      selectedFiles = selectedFiles.filter(function (f) { return f.id !== id; });
      renderFileList();
      updateConvertButtonState();
    }

    function stripExtension(name) {
      var idx = name.lastIndexOf('.');
      return idx > 0 ? name.slice(0, idx) : name;
    }

    function renderFileList() {
      fileListEl.innerHTML = '';
      selectedFiles.forEach(function (entry) {
        var item = document.createElement('div');
        item.className = 'file-item';

        var info = document.createElement('div');
        info.className = 'file-item-info';

        var nameEl = document.createElement('div');
        nameEl.className = 'file-item-name';
        nameEl.textContent = entry.file.name;

        var sizeEl = document.createElement('div');
        sizeEl.className = 'file-item-size';
        sizeEl.textContent = formatBytes(entry.file.size);

        info.appendChild(nameEl);
        info.appendChild(sizeEl);

        var renameField = document.createElement('div');
        renameField.className = 'form-field file-item-rename';
        var renameLabel = document.createElement('label');
        renameLabel.className = 'field-label';
        renameLabel.textContent = '新しいファイル名';
        var renameInput = document.createElement('input');
        renameInput.type = 'text';
        renameInput.placeholder = stripExtension(entry.file.name);
        renameInput.value = entry.renameValue;
        renameInput.addEventListener('input', function () {
          entry.renameValue = renameInput.value;
        });
        renameField.appendChild(renameLabel);
        renameField.appendChild(renameInput);

        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'file-item-remove';
        removeBtn.textContent = '✕';
        removeBtn.title = '削除';
        removeBtn.addEventListener('click', function () { removeFile(entry.id); });

        item.appendChild(info);
        item.appendChild(renameField);
        item.appendChild(removeBtn);
        fileListEl.appendChild(item);
      });
    }

    function updateConvertButtonState() {
      convertBtn.disabled = selectedFiles.length === 0 || isConverting;
    }

    // ----- Settings -----
    qualitySlider.addEventListener('input', function () {
      qualityValueEl.textContent = qualitySlider.value;
    });

    resizeCheckbox.addEventListener('change', function () {
      resizeWidthInput.disabled = !resizeCheckbox.checked;
    });

    // ----- Convert -----
    convertBtn.addEventListener('click', convertAll);

    async function convertAll() {
      if (selectedFiles.length === 0 || isConverting) return;

      isConverting = true;
      updateConvertButtonState();
      hideStatus();
      resultsSection.style.display = 'none';
      resultsList.innerHTML = '';
      downloadAllBtn.style.display = 'none';
      progressWrap.classList.add('visible');
      progressBarFill.style.width = '0%';

      var quality = parseInt(qualitySlider.value, 10);
      var resizeEnabled = resizeCheckbox.checked;
      var maxWidth = parseInt(resizeWidthInput.value, 10) || null;
      var autoFormat = autoFormatCheckbox.checked;

      var usedNames = new Set();
      var results = [];
      var total = selectedFiles.length;

      for (var i = 0; i < total; i++) {
        var entry = selectedFiles[i];
        progressLabel.textContent = '変換中... (' + (i + 1) + ' / ' + total + ') ' + entry.file.name;

        try {
          var blob = await ImageConverter.convertToWebP(entry.file, {
            quality: quality,
            resizeEnabled: resizeEnabled,
            maxWidth: maxWidth,
          });

          var rawBase = entry.renameValue.trim() || stripExtension(entry.file.name);
          var baseName = autoFormat ? ImageConverter.sanitizeForWeb(rawBase) : (rawBase || 'image');
          var finalBase = ImageConverter.dedupeName(baseName, usedNames);
          var filename = finalBase + '.webp';

          var url = URL.createObjectURL(blob);
          var originalSize = entry.file.size;
          var newSize = blob.size;
          var reduction = originalSize > 0 ? Math.round((1 - newSize / originalSize) * 100) : 0;

          results.push({
            filename: filename,
            url: url,
            originalSize: originalSize,
            newSize: newSize,
            reduction: reduction,
            error: null,
          });
        } catch (err) {
          results.push({
            filename: entry.file.name,
            error: (err && err.message) || '変換に失敗しました',
          });
        }

        progressBarFill.style.width = Math.round(((i + 1) / total) * 100) + '%';
      }

      progressLabel.textContent = '変換完了';
      renderResults(results);

      isConverting = false;
      updateConvertButtonState();
    }

    function renderResults(results) {
      resultsList.innerHTML = '';
      var successCount = 0;

      results.forEach(function (r) {
        var item = document.createElement('div');
        item.className = 'result-item';

        var nameEl = document.createElement('div');
        nameEl.className = 'result-name';
        nameEl.textContent = r.filename;
        item.appendChild(nameEl);

        if (r.error) {
          var errEl = document.createElement('div');
          errEl.className = 'result-sizes';
          errEl.textContent = 'エラー: ' + r.error;
          item.appendChild(errEl);
        } else {
          successCount++;

          var sizesEl = document.createElement('div');
          sizesEl.className = 'result-sizes';
          sizesEl.textContent = formatBytes(r.originalSize) + ' → ' + formatBytes(r.newSize);
          item.appendChild(sizesEl);

          var reductionEl = document.createElement('div');
          reductionEl.className = 'result-reduction';
          if (r.reduction >= 0) {
            reductionEl.textContent = '-' + r.reduction + '%';
          } else {
            reductionEl.classList.add('result-reduction--increase');
            reductionEl.textContent = '+' + Math.abs(r.reduction) + '%';
          }
          item.appendChild(reductionEl);

          var downloadBtn = document.createElement('a');
          downloadBtn.className = 'btn result-download';
          downloadBtn.href = r.url;
          downloadBtn.download = r.filename;
          downloadBtn.textContent = '↓ ダウンロード';
          item.appendChild(downloadBtn);
        }

        resultsList.appendChild(item);
      });

      resultsSection.style.display = 'block';
      downloadAllBtn.style.display = successCount > 0 ? 'inline-flex' : 'none';

      downloadAllBtn.onclick = function () {
        results.forEach(function (r, idx) {
          if (r.error) return;
          setTimeout(function () {
            var a = document.createElement('a');
            a.href = r.url;
            a.download = r.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }, idx * 150);
        });
      };
    }

    function hideStatus() {
      statusMsg.classList.remove('visible', 'success', 'error');
      statusMsg.textContent = '';
    }

    function formatBytes(bytes) {
      if (bytes < 1024) return bytes + ' B';
      var kb = bytes / 1024;
      if (kb < 1024) return kb.toFixed(kb < 10 ? 1 : 0) + ' KB';
      var mb = kb / 1024;
      return mb.toFixed(mb < 10 ? 1 : 0) + ' MB';
    }
  }
})();
