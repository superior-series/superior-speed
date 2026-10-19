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
    var imagePanel       = document.getElementById('panel-image');
    var dropzone       = document.getElementById('dropzone');
    var fileInput       = document.getElementById('file-input');
    var folderInput      = document.getElementById('folder-input');
    var folderBtn        = document.getElementById('folder-btn');
    var fileListEl       = document.getElementById('file-list');
    var fileListHeader   = document.getElementById('file-list-header');
    var fileCountEl      = document.getElementById('file-count');
    var clearAllBtn      = document.getElementById('clear-all-btn');
    var renameModeInputs = document.querySelectorAll('input[name="rename-mode"]');
    var seqSettings      = document.getElementById('seq-settings');
    var seqBaseInput     = document.getElementById('seq-base');
    var seqBaseErrorEl   = document.getElementById('seq-base-error');
    var seqStartInput    = document.getElementById('seq-start');
    var seqStartErrorEl  = document.getElementById('seq-start-error');
    var seqDigitsSelect  = document.getElementById('seq-digits');
    var seqOrderSelect   = document.getElementById('seq-order');
    var seqPreview       = document.getElementById('seq-preview');
    var seqPreviewList   = document.getElementById('seq-preview-list');
    var seqPreviewToggle = document.getElementById('seq-preview-toggle');
    var autoFormatCheckbox = document.getElementById('auto-format-checkbox');
    var qualitySlider    = document.getElementById('quality-slider');
    var qualityValueEl   = document.getElementById('quality-value');
    var resizeCheckbox   = document.getElementById('resize-checkbox');
    var resizeWidthInput = document.getElementById('resize-width');
    var resizeErrorEl    = document.getElementById('resize-error');
    var convertBtn       = document.getElementById('convert-btn');
    var progressWrap     = document.getElementById('progress-wrap');
    var progressBarFill  = document.getElementById('progress-bar-fill');
    var progressLabel    = document.getElementById('progress-label');
    var statusMsg        = document.getElementById('status-msg');
    var resultsSection   = document.getElementById('results-section');
    var resultsSummary   = document.getElementById('results-summary');
    var resultsList       = document.getElementById('results-list');
    var downloadAllBtn   = document.getElementById('download-all-btn');
    var webpBanner       = document.getElementById('webp-unsupported-banner');

    var DOWNLOAD_ALL_LABEL = downloadAllBtn.textContent;
    var MAX_RESIZE = 10000;
    var RENAME_MODE_KEY = 'superior_speed_rename_mode';
    var PREVIEW_HEAD = 5;
    var PREVIEW_TAIL = 2;
    var COMPACT_RESULTS_THRESHOLD = 10;

    var selectedFiles = []; // { id, file, path, renameValue }
    var nextId = 1;
    var isConverting = false;
    var isZipping = false;
    var resultUrls = []; // object URLs of the current results, revoked before the next run
    var previewExpanded = false;
    var webpSupported = ImageConverter.canEncodeWebP();

    if (!webpSupported) webpBanner.hidden = false;

    // ----- Dropzone / pickers -----
    dropzone.addEventListener('click', function () {
      if (!isConverting) fileInput.click();
    });
    dropzone.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!isConverting) fileInput.click();
      }
    });
    dropzone.addEventListener('dragover', function (e) {
      e.preventDefault();
      if (!isConverting) dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', function () {
      dropzone.classList.remove('dragover');
    });
    dropzone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (isConverting) return;
      collectDropped(e.dataTransfer).then(addFiles);
    });
    fileInput.addEventListener('change', function () {
      addFiles(Array.prototype.map.call(fileInput.files, function (file) {
        return { file: file, path: file.name, fromFolder: false };
      }));
      fileInput.value = '';
    });
    folderBtn.addEventListener('click', function () { folderInput.click(); });
    folderInput.addEventListener('change', function () {
      var items = [];
      Array.prototype.forEach.call(folderInput.files, function (file) {
        var path = file.webkitRelativePath || file.name;
        if (!isHiddenPath(path)) items.push({ file: file, path: path, fromFolder: true });
      });
      addFiles(items);
      folderInput.value = '';
    });

    function isHiddenPath(path) {
      return path.split('/').some(function (part) { return part.charAt(0) === '.'; });
    }

    // Must read DataTransfer items synchronously; they are emptied once the drop handler returns
    function collectDropped(dataTransfer) {
      var items = dataTransfer.items;
      if (!items || !items.length || typeof items[0].webkitGetAsEntry !== 'function') {
        return Promise.resolve(Array.prototype.map.call(dataTransfer.files, function (file) {
          return { file: file, path: file.name, fromFolder: false };
        }));
      }

      var tasks = [];
      Array.prototype.forEach.call(items, function (item) {
        if (item.kind !== 'file') return;
        var entry = item.webkitGetAsEntry();
        if (entry && entry.isDirectory) {
          tasks.push(readDirectory(entry));
        } else if (entry) {
          tasks.push(entryToFile(entry).then(function (file) {
            return file ? [{ file: file, path: file.name, fromFolder: false }] : [];
          }));
        } else {
          var file = item.getAsFile();
          if (file) tasks.push(Promise.resolve([{ file: file, path: file.name, fromFolder: false }]));
        }
      });
      return Promise.all(tasks).then(flatten);
    }

    function readDirectory(dirEntry) {
      var reader = dirEntry.createReader();
      var children = [];

      // readEntries returns results in batches; keep calling until it returns nothing
      function readBatch() {
        return new Promise(function (resolve) {
          reader.readEntries(resolve, function () { resolve([]); });
        }).then(function (batch) {
          if (batch.length === 0) return children;
          children = children.concat(batch);
          return readBatch();
        });
      }

      return readBatch().then(function (entries) {
        return Promise.all(entries.map(function (entry) {
          if (entry.name.charAt(0) === '.') return [];
          if (entry.isDirectory) return readDirectory(entry);
          return entryToFile(entry).then(function (file) {
            return file ? [{ file: file, path: entry.fullPath.replace(/^\//, ''), fromFolder: true }] : [];
          });
        }));
      }).then(flatten);
    }

    function entryToFile(entry) {
      return new Promise(function (resolve) {
        entry.file(resolve, function () { resolve(null); });
      });
    }

    function flatten(arrays) {
      return Array.prototype.concat.apply([], arrays);
    }

    var REJECT_REASONS = {
      heic:  'HEIC形式はブラウザで変換できません。iPhoneの設定で『互換性優先』にするか、JPG/PNGに変換してからお試しください',
      svg:   'SVGはそのままWebで使える軽量な形式なので、変換は不要です',
      other: '画像ファイル以外は追加できません',
    };

    function getRejectReason(file) {
      var type = (file.type || '').toLowerCase();
      var name = file.name.toLowerCase();
      if (type === 'image/heic' || type === 'image/heif' || /\.(heic|heif)$/.test(name)) return 'heic';
      if (type === 'image/svg+xml') return 'svg';
      if (type.indexOf('image/') !== 0) return 'other';
      return null;
    }

    // items: [{ file, path, fromFolder }]
    function addFiles(items) {
      if (isConverting) return;

      var rejected = { heic: 0, svg: 0, other: 0 };
      var hasRejected = false;
      var hasGif = false;
      var addedCount = 0;
      var fromFolder = false;

      items.forEach(function (item) {
        if (item.fromFolder) fromFolder = true;
        var reason = getRejectReason(item.file);
        // Non-images inside folders (.DS_Store, notes...) are dropped silently
        if (reason === 'other' && item.fromFolder) return;
        if (reason) {
          rejected[reason]++;
          hasRejected = true;
          return;
        }
        if (item.file.type === 'image/gif') hasGif = true;
        selectedFiles.push({ id: nextId++, file: item.file, path: item.path, renameValue: '' });
        addedCount++;
      });
      refreshFiles();

      var lines = [];
      Object.keys(rejected).forEach(function (reason) {
        if (rejected[reason] > 0) {
          lines.push(rejected[reason] + '件を除外しました（' + REJECT_REASONS[reason] + '）');
        }
      });
      if (hasGif) lines.push('GIFは1コマ目だけが静止画のWebPとして変換されます');
      if (fromFolder && addedCount === 0 && !hasRejected) lines.push('フォルダ内に画像が見つかりませんでした');

      if (lines.length > 0) {
        showStatus(lines.join('\n'), hasRejected ? 'error' : 'warn');
      } else {
        hideStatus();
      }
    }

    function removeFile(id) {
      selectedFiles = selectedFiles.filter(function (f) { return f.id !== id; });
      refreshFiles();
    }

    clearAllBtn.addEventListener('click', function () {
      if (selectedFiles.length === 0) return;
      if (!window.confirm('リストの画像 ' + selectedFiles.length + '件 をすべて削除しますか？')) return;
      selectedFiles = [];
      hideStatus();
      refreshFiles();
    });

    function stripExtension(name) {
      var idx = name.lastIndexOf('.');
      return idx > 0 ? name.slice(0, idx) : name;
    }

    function refreshFiles() {
      renderFileList();
      renderPreview();
      updateConvertButtonState();
    }

    // ----- Rename mode -----
    function getRenameMode() {
      var checked = document.querySelector('input[name="rename-mode"]:checked');
      return checked ? checked.value : 'individual';
    }

    function isSequentialMode() {
      return getRenameMode() === 'sequential';
    }

    function applyRenameMode() {
      var seq = isSequentialMode();
      seqSettings.hidden = !seq;
      fileListEl.classList.toggle('file-list--compact', seq);
      if (!seq) setFieldError(seqBaseInput, seqBaseErrorEl, '');
      if (!seq) setFieldError(seqStartInput, seqStartErrorEl, '');
      refreshFiles();
    }

    (function restoreRenameMode() {
      var saved = null;
      try { saved = localStorage.getItem(RENAME_MODE_KEY); } catch (_) {}
      renameModeInputs.forEach(function (input) {
        if (input.value === saved) input.checked = true;
      });
    })();

    renameModeInputs.forEach(function (input) {
      input.addEventListener('change', function () {
        try { localStorage.setItem(RENAME_MODE_KEY, getRenameMode()); } catch (_) {}
        applyRenameMode();
      });
    });

    // Processing order: natural filename (path) order or insertion order
    function getOrderedFiles() {
      var list = selectedFiles.slice();
      if (isSequentialMode() && seqOrderSelect.value === 'name') {
        list.sort(function (a, b) {
          return a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }) || a.id - b.id;
        });
      }
      return list;
    }

    // Returns the start number, or null if the field is not a non-negative integer
    function parseSeqStart() {
      var raw = seqStartInput.value.trim();
      if (!/^\d+$/.test(raw)) return null;
      var value = parseInt(raw, 10);
      return Number.isSafeInteger(value) ? value : null;
    }

    function getSeqBase() {
      var raw = seqBaseInput.value.trim();
      return autoFormatCheckbox.checked ? ImageConverter.sanitizeBase(raw) : raw;
    }

    // count: number of files that will be numbered (decides the "auto" width)
    function makeSeqNamer(base, start, count) {
      var width = seqDigitsSelect.value === 'auto'
        ? Math.max(3, String(start + Math.max(count, 1) - 1).length)
        : parseInt(seqDigitsSelect.value, 10);
      return function (index) {
        return base + '-' + String(start + index).padStart(width, '0') + '.webp';
      };
    }

    function validateSeqSettings() {
      var base = getSeqBase();
      var start = parseSeqStart();
      setFieldError(seqBaseInput, seqBaseErrorEl, base ? '' : '共通名を半角英数字で入力してください');
      setFieldError(seqStartInput, seqStartErrorEl, start === null ? '0以上の整数を入力してください' : '');
      if (!base) return null;
      if (start === null) return null;
      return { base: base, start: start };
    }

    [seqBaseInput, seqStartInput].forEach(function (input) {
      input.addEventListener('input', function () {
        // Only re-check once an error is shown, so typing isn't nagged mid-entry
        if (seqBaseErrorEl.textContent || seqStartErrorEl.textContent) validateSeqSettings();
        renderPreview();
      });
    });
    seqDigitsSelect.addEventListener('change', renderPreview);
    seqOrderSelect.addEventListener('change', function () {
      renderFileList();
      renderPreview();
    });
    autoFormatCheckbox.addEventListener('change', function () {
      if (seqBaseErrorEl.textContent) validateSeqSettings();
      renderPreview();
    });

    seqPreviewToggle.addEventListener('click', function () {
      previewExpanded = !previewExpanded;
      renderPreview();
    });

    function renderPreview() {
      var ordered = getOrderedFiles();
      seqPreview.hidden = !isSequentialMode() || ordered.length === 0;
      if (seqPreview.hidden) return;

      seqPreviewList.innerHTML = '';
      var start = parseSeqStart();
      if (start === null) {
        appendPreviewMessage('開始番号に0以上の整数を入力すると、ここに新しいファイル名が表示されます');
        seqPreviewToggle.hidden = true;
        return;
      }

      var base = getSeqBase();
      var nameAt = makeSeqNamer(base || '（共通名）', start, ordered.length);
      var collapsible = ordered.length > PREVIEW_HEAD + PREVIEW_TAIL;
      var collapsed = collapsible && !previewExpanded;

      ordered.forEach(function (entry, i) {
        if (collapsed && i >= PREVIEW_HEAD && i < ordered.length - PREVIEW_TAIL) {
          if (i === PREVIEW_HEAD) {
            appendPreviewMessage('… 他' + (ordered.length - PREVIEW_HEAD - PREVIEW_TAIL) + '件 …');
          }
          return;
        }
        var row = document.createElement('li');
        row.className = 'seq-preview-row';
        var from = document.createElement('span');
        from.className = 'seq-preview-from';
        from.textContent = entry.path;
        var arrow = document.createElement('span');
        arrow.className = 'seq-preview-arrow';
        arrow.textContent = '→';
        var to = document.createElement('span');
        to.className = 'seq-preview-to' + (base ? '' : ' seq-preview-to--placeholder');
        to.textContent = nameAt(i);
        row.appendChild(from);
        row.appendChild(arrow);
        row.appendChild(to);
        seqPreviewList.appendChild(row);
      });

      seqPreviewToggle.hidden = !collapsible;
      seqPreviewToggle.textContent = previewExpanded ? '折りたたむ' : 'すべて表示（' + ordered.length + '件）';
    }

    function appendPreviewMessage(text) {
      var li = document.createElement('li');
      li.className = 'seq-preview-gap';
      li.textContent = text;
      seqPreviewList.appendChild(li);
    }

    // ----- File list -----
    function renderFileList() {
      fileListEl.innerHTML = '';
      var compact = isSequentialMode();
      var totalBytes = 0;

      getOrderedFiles().forEach(function (entry) {
        totalBytes += entry.file.size;

        var item = document.createElement('div');
        item.className = 'file-item';

        var info = document.createElement('div');
        info.className = 'file-item-info';

        var nameEl = document.createElement('div');
        nameEl.className = 'file-item-name';
        nameEl.textContent = entry.path;
        nameEl.title = entry.path;

        var sizeEl = document.createElement('div');
        sizeEl.className = 'file-item-size';
        sizeEl.textContent = formatBytes(entry.file.size);

        info.appendChild(nameEl);
        info.appendChild(sizeEl);
        item.appendChild(info);

        // Per-file name fields only in individual mode (hundreds of inputs would make the page heavy)
        if (!compact) {
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
          item.appendChild(renameField);
        }

        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'file-item-remove';
        removeBtn.textContent = '✕';
        removeBtn.title = '削除';
        removeBtn.addEventListener('click', function () { removeFile(entry.id); });
        item.appendChild(removeBtn);

        fileListEl.appendChild(item);
      });

      fileListHeader.hidden = selectedFiles.length === 0;
      fileCountEl.textContent = selectedFiles.length + '件の画像（合計 ' + formatBytes(totalBytes) + '）';
    }

    function updateConvertButtonState() {
      convertBtn.disabled = selectedFiles.length === 0 || isConverting || isZipping || !webpSupported;
    }

    // Locks file adding and every setting while a batch is running
    function setControlsLocked(locked) {
      imagePanel.querySelectorAll('.lockable input, .lockable select, .lockable button').forEach(function (el) {
        el.disabled = locked;
      });
      if (!locked) resizeWidthInput.disabled = !resizeCheckbox.checked;
      dropzone.classList.toggle('is-disabled', locked);
      dropzone.setAttribute('aria-disabled', locked ? 'true' : 'false');
    }

    window.addEventListener('beforeunload', function (e) {
      if (!isConverting) return;
      e.preventDefault();
      e.returnValue = '';
    });

    // ----- Settings -----
    qualitySlider.addEventListener('input', function () {
      qualityValueEl.textContent = qualitySlider.value;
    });

    resizeCheckbox.addEventListener('change', function () {
      resizeWidthInput.disabled = !resizeCheckbox.checked;
      if (!resizeCheckbox.checked) setResizeError('');
    });

    resizeWidthInput.addEventListener('input', function () {
      // Only re-check once an error is shown, so typing isn't nagged mid-entry
      if (resizeErrorEl.textContent) validateResizeValue();
    });

    // Returns the max size as an integer, or null (with an error shown) if invalid
    function validateResizeValue() {
      var raw = resizeWidthInput.value.trim();
      var value = /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN;
      if (!(value >= 1)) {
        setResizeError('1以上の整数を入力してください');
        return null;
      }
      if (value > MAX_RESIZE) {
        setResizeError(MAX_RESIZE + '以下の整数を入力してください');
        return null;
      }
      setResizeError('');
      return value;
    }

    function setResizeError(msg) {
      setFieldError(resizeWidthInput, resizeErrorEl, msg);
    }

    function setFieldError(input, errorEl, msg) {
      errorEl.textContent = msg;
      if (msg) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }

    applyRenameMode();

    // ----- Convert -----
    convertBtn.addEventListener('click', convertAll);

    function nextFrame() {
      // Let the progress bar repaint between images. Skipped in background tabs,
      // where timers are throttled and there is nothing to paint anyway.
      if (document.visibilityState !== 'visible') return Promise.resolve();
      return new Promise(function (r) { setTimeout(r, 0); });
    }

    async function convertAll() {
      if (selectedFiles.length === 0 || isConverting || isZipping || !webpSupported) return;

      var sequential = isSequentialMode();
      var seqConfig = null;
      if (sequential) {
        seqConfig = validateSeqSettings();
        if (!seqConfig) {
          (seqBaseErrorEl.textContent ? seqBaseInput : seqStartInput).focus();
          return;
        }
      }

      var resizeEnabled = resizeCheckbox.checked;
      var maxSize = null;
      if (resizeEnabled) {
        maxSize = validateResizeValue();
        if (maxSize === null) {
          resizeWidthInput.focus();
          return;
        }
      }

      isConverting = true;
      updateConvertButtonState();
      setControlsLocked(true);
      hideStatus();
      resultsSection.style.display = 'none';
      resultsList.innerHTML = '';
      resultsSummary.innerHTML = '';
      downloadAllBtn.style.display = 'none';
      revokeResultUrls();
      progressWrap.classList.add('visible');
      progressBarFill.style.width = '0%';

      var quality = parseInt(qualitySlider.value, 10);
      var autoFormat = autoFormatCheckbox.checked;

      var ordered = getOrderedFiles();
      var total = ordered.length;
      var seqName = sequential ? makeSeqNamer(seqConfig.base, seqConfig.start, total) : null;
      var seqIndex = 0; // only advances on success, so failed images leave no gaps
      var usedNames = new Set();
      var results = [];

      try {
        for (var i = 0; i < total; i++) {
          var entry = ordered[i];
          progressLabel.textContent = '変換中... (' + (i + 1) + ' / ' + total + ') ' + entry.path;

          try {
            var blob = await ImageConverter.convertToWebP(entry.file, {
              quality: quality,
              resizeEnabled: resizeEnabled,
              maxSize: maxSize,
            });

            var filename;
            if (sequential) {
              filename = seqName(seqIndex++);
            } else {
              var rawBase = entry.renameValue.trim() || stripExtension(entry.file.name);
              var baseName = autoFormat ? ImageConverter.sanitizeForWeb(rawBase) : (rawBase || 'image');
              filename = ImageConverter.dedupeName(baseName, usedNames) + '.webp';
            }

            var url = URL.createObjectURL(blob);
            resultUrls.push(url);
            var originalSize = entry.file.size;
            var newSize = blob.size;
            var reduction = originalSize > 0 ? Math.round((1 - newSize / originalSize) * 100) : 0;

            results.push({
              filename: filename,
              url: url,
              blob: blob,
              originalSize: originalSize,
              newSize: newSize,
              reduction: reduction,
              error: null,
            });
          } catch (err) {
            results.push({
              filename: entry.path,
              error: (err && err.message) || '変換に失敗しました',
            });
          }

          progressBarFill.style.width = Math.round(((i + 1) / total) * 100) + '%';
          await nextFrame();
        }

        progressLabel.textContent = '変換完了';
        renderResults(results);
      } finally {
        isConverting = false;
        setControlsLocked(false);
        updateConvertButtonState();
      }
    }

    function renderResults(results) {
      resultsList.innerHTML = '';
      var successes = results.filter(function (r) { return !r.error; });
      var compact = results.length > COMPACT_RESULTS_THRESHOLD;
      resultsList.classList.toggle('results-list--compact', compact);

      renderSummary(successes, results.length - successes.length);

      results.forEach(function (r) {
        var item = document.createElement('div');
        item.className = 'result-item';

        var nameEl = document.createElement('div');
        nameEl.className = 'result-name';
        nameEl.textContent = r.filename;
        nameEl.title = r.filename;
        item.appendChild(nameEl);

        if (r.error) {
          item.classList.add('result-item--error');
          var errEl = document.createElement('div');
          errEl.className = 'result-error';
          errEl.textContent = r.error;
          item.appendChild(errEl);
        } else {
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

          if (r.newSize > r.originalSize) {
            var noteEl = document.createElement('div');
            noteEl.className = 'result-note';
            noteEl.textContent = '元のファイルの方が小さいため、元のファイルをそのまま使うのがおすすめです';
            item.appendChild(noteEl);
          }
        }

        resultsList.appendChild(item);
      });

      resultsSection.style.display = 'block';
      downloadAllBtn.style.display = successes.length > 0 ? 'inline-flex' : 'none';
      downloadAllBtn.onclick = function () { downloadAll(successes); };
    }

    function renderSummary(successes, failedCount) {
      var text;
      if (successes.length > 0) {
        var before = 0;
        var after = 0;
        successes.forEach(function (r) {
          before += r.originalSize;
          after += r.newSize;
        });
        var reduction = before > 0 ? Math.round((1 - after / before) * 100) : 0;
        text = successes.length + '件を変換：合計 ' + formatBytes(before) + ' → ' + formatBytes(after) +
          '（' + (reduction >= 0 ? '-' : '+') + Math.abs(reduction) + '%）';
      } else {
        text = '変換できた画像はありませんでした';
      }
      resultsSummary.textContent = text;
      if (failedCount > 0) {
        var failEl = document.createElement('span');
        failEl.className = 'results-summary-failed';
        failEl.textContent = '、' + failedCount + '件は失敗';
        resultsSummary.appendChild(failEl);
      }
    }

    async function downloadAll(successes) {
      if (isZipping || successes.length === 0) return;

      // JSZip comes from a CDN; if it failed to load (offline etc.), download one by one
      if (typeof JSZip === 'undefined') {
        downloadSequentially(successes);
        return;
      }

      isZipping = true;
      downloadAllBtn.disabled = true;
      downloadAllBtn.textContent = 'ZIPを作成中…';
      updateConvertButtonState();

      try {
        var zip = new JSZip();
        successes.forEach(function (r) { zip.file(r.filename, r.blob); });
        // WebP is already compressed, so store without recompressing
        var zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
        var zipUrl = URL.createObjectURL(zipBlob);
        resultUrls.push(zipUrl);
        triggerDownload(zipUrl, 'superior-speed-' + formatTimestamp(new Date()) + '.zip');
      } catch (err) {
        showStatus('ZIPの作成に失敗したため、1件ずつダウンロードします', 'error');
        downloadSequentially(successes);
      } finally {
        isZipping = false;
        downloadAllBtn.disabled = false;
        downloadAllBtn.textContent = DOWNLOAD_ALL_LABEL;
        updateConvertButtonState();
      }
    }

    function downloadSequentially(successes) {
      successes.forEach(function (r, idx) {
        setTimeout(function () { triggerDownload(r.url, r.filename); }, idx * 150);
      });
    }

    function triggerDownload(url, filename) {
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    function revokeResultUrls() {
      resultUrls.forEach(function (url) { URL.revokeObjectURL(url); });
      resultUrls = [];
    }

    function formatTimestamp(d) {
      function pad(n) { return (n < 10 ? '0' : '') + n; }
      return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' +
        pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
    }

    function showStatus(msg, type) {
      statusMsg.classList.remove('success', 'error', 'warn');
      statusMsg.classList.add('visible', type);
      statusMsg.textContent = msg;
    }

    function hideStatus() {
      statusMsg.classList.remove('visible', 'success', 'error', 'warn');
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
