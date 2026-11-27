import { api } from '../bridge.js';

// Makes a small JPEG preview (320 px wide) of a picture or of a frame early in a video,
// and reads its size and, for videos, its length. Saved next to the media so lists stay fast.
export function makeThumb(entry, width = 320) {
  return new Promise((resolve) => {
    const src = api.media.url(entry);
    const done = (el, w, h, duration) => {
      try {
        const height = Math.round((width * 9) / 16);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
        // cover the 16:9 box, like the thumbnails in the list
        const scale = Math.max(width / w, height / h);
        const dw = w * scale;
        const dh = h * scale;
        ctx.drawImage(el, (width - dw) / 2, (height - dh) / 2, dw, dh);
        api.media.saveThumb(entry.id, canvas.toDataURL('image/jpeg', 0.8))
          .then((thumb) => resolve({ thumb, width: w, height: h, duration }))
          .catch(() => resolve({ width: w, height: h, duration }));
      } catch (_) { resolve({ width: w, height: h, duration }); }
    };
    const fail = () => resolve({});
    setTimeout(fail, 15000); // a broken file must not hold up the others
    if (entry.kind === 'video') {
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous'; // so the frame can be copied into the preview
      v.muted = true;
      v.preload = 'auto';
      v.onloadedmetadata = () => { v.currentTime = Math.min(2, (v.duration || 4) / 4); };
      v.onseeked = () => done(v, v.videoWidth, v.videoHeight, v.duration);
      v.onerror = fail;
      v.src = src;
    } else {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => done(img, img.naturalWidth, img.naturalHeight, null);
      img.onerror = fail;
      img.src = src;
    }
  });
}
