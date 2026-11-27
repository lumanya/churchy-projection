import React, { useEffect, useRef } from 'react';
import { api } from '../bridge.js';

// Background behind lyrics and verses: a picture or a silent looping video, darkened so text stays readable.
// Keyed by file, so moving between slides with the same background never restarts the video.
export function Background({ bg, dim = 0.45 }) {
  if (!bg) return null;
  const src = api.media.url(bg.file);
  return (
    <div className="bg-layer" key={bg.file}>
      {bg.kind === 'video'
        ? <video className="bg-fill" src={src} autoPlay loop muted playsInline />
        : <img className="bg-fill" src={src} alt="" />}
      <div className="bg-dim" style={{ background: `rgba(0,0,0,${dim})` }} />
    </div>
  );
}

// A picture or a video shown on its own (posters, notices, clips). Video follows the operator's commands:
// video = { playing, loop, volume, restart } — restart changes each time the operator presses Restart.
export function MediaSlide({ media, video, report }) {
  const ref = useRef(null);
  const src = api.media.url(media.file);
  const v = video || { playing: true, loop: false, volume: 1, restart: 0 };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.loop = !!v.loop;
    el.volume = Math.max(0, Math.min(1, v.volume ?? 1));
    if (v.playing) el.play().catch(() => {}); else el.pause();
  }, [v.playing, v.loop, v.volume, media.file]);

  useEffect(() => {
    const el = ref.current;
    if (el && v.restart) { el.currentTime = 0; if (v.playing) el.play().catch(() => {}); }
  }, [v.restart]);

  useEffect(() => {
    if (!report || media.kind !== 'video') return undefined;
    const h = setInterval(() => {
      const el = ref.current;
      if (el) report({ file: media.file, current: el.currentTime, duration: el.duration || 0, paused: el.paused, ended: el.ended });
    }, 500);
    return () => clearInterval(h);
  }, [media.file, report]);

  if (media.kind === 'video') return <video ref={ref} className="media-fit" src={src} playsInline autoPlay />;
  return <img className="media-fit" src={src} alt={media.name || ''} />;
}
