'use strict';

var ImageConverter = (function () {

  var LOAD_ERROR_MESSAGE = 'この画像は読み込めませんでした。ファイルが壊れているか、ブラウザが対応していない形式です';

  function sanitizeForWeb(name) {
    var s = name.replace(/[^a-zA-Z0-9\-_]/g, '-');
    s = s.replace(/-+/g, '-');
    s = s.replace(/^-+|-+$/g, '');
    s = s.toLowerCase();
    return s || 'image';
  }

  function dedupeName(baseName, usedNames) {
    if (!usedNames.has(baseName)) {
      usedNames.add(baseName);
      return baseName;
    }
    var i = 1;
    var candidate;
    do {
      candidate = baseName + '-' + i;
      i++;
    } while (usedNames.has(candidate));
    usedNames.add(candidate);
    return candidate;
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error(LOAD_ERROR_MESSAGE));
      };
      img.src = url;
    });
  }

  async function convertToWebP(file, opts) {
    var quality = opts.quality;
    var resizeEnabled = opts.resizeEnabled;
    var maxSize = opts.maxSize;

    var loaded = await loadImage(file);
    var img = loaded.img;
    var url = loaded.url;

    try {
      var w = img.naturalWidth;
      var h = img.naturalHeight;
      if (!w || !h) throw new Error(LOAD_ERROR_MESSAGE);

      // Shrink so the long edge fits maxSize; never upscale
      var longEdge = Math.max(w, h);
      if (resizeEnabled && maxSize && longEdge > maxSize) {
        var ratio = maxSize / longEdge;
        w = Math.max(1, Math.round(w * ratio));
        h = Math.max(1, Math.round(h * ratio));
      }

      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      var blob = await new Promise(function (resolve, reject) {
        canvas.toBlob(function (b) {
          if (!b) reject(new Error('WebP変換に失敗しました'));
          // Browsers without a WebP encoder silently fall back to PNG
          else if (b.type !== 'image/webp') reject(new Error('お使いのブラウザはWebPへの書き出しに対応していません。Chrome / Edge / Firefox などでお試しください'));
          else resolve(b);
        }, 'image/webp', quality / 100);
      });

      return blob;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return {
    sanitizeForWeb: sanitizeForWeb,
    dedupeName: dedupeName,
    convertToWebP: convertToWebP,
  };
})();
