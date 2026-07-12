'use strict';

var ImageConverter = (function () {

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
      img.onerror = function (e) {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });
  }

  async function convertToWebP(file, opts) {
    var quality = opts.quality;
    var resizeEnabled = opts.resizeEnabled;
    var maxWidth = opts.maxWidth;

    var loaded = await loadImage(file);
    var img = loaded.img;
    var url = loaded.url;

    try {
      var w = img.naturalWidth;
      var h = img.naturalHeight;

      if (resizeEnabled && maxWidth && w > maxWidth) {
        var ratio = maxWidth / w;
        w = maxWidth;
        h = Math.round(h * ratio);
      }

      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      var blob = await new Promise(function (resolve, reject) {
        canvas.toBlob(function (b) {
          if (b) resolve(b);
          else reject(new Error('WebP変換に失敗しました'));
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
