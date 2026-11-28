import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../bridge.js';

// The livestream view, for OBS:
//  · style=lower — lyrics or the verse in a bar at the bottom, over the camera picture
//  · style=full  — the same as the projector (pictures included; videos are left to OBS)
//  · key=transparent (OBS Browser Source over the network) | green | blue | black (capture card, removed in OBS)
//  · scale — text size, 0.7 to 1.5
const KEYS = { transparent: 'transparent', green: '#00B140', blue: '#0047BB', black: '#000000' };

function params() {
  const q = new URLSearchParams((window.location.hash.split('?')[1] || ''));
  const scale = Math.max(0.6, Math.min(1.6, parseFloat(q.get('scale')) || 1));
  return { style: q.get('style') === 'full' ? 'full' : 'lower', key: KEYS[q.get('key')] ? q.get('key') : 'transparent', scale };
}

function useFit(deps, max, min = 1.6) {
  const box = useRef(null);
  const inner = useRef(null);
  useLayoutEffect(() => {
    const b = box.current, el = inner.current;
    if (!b || !el) return;
    let s = max;
    el.style.fontSize = s + 'vh';
    while (s > min && (el.scrollHeight > b.clientHeight || el.scrollWidth > b.clientWidth)) { s -= 0.15; el.style.fontSize = s + 'vh'; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return [box, inner];
}

export default function Stream() {
  const [live, setLive] = useState({});
  const [opts, setOpts] = useState(params());
  useEffect(() => api.live.onUpdate((l) => setLive(l || {})), []);
  useEffect(() => {
    const h = () => setOpts(params());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  useEffect(() => {
    // OBS shows whatever is behind the page: keep it see-through unless a key colour was asked for
    document.documentElement.style.background = KEYS[opts.key];
    document.body.style.background = KEYS[opts.key];
  }, [opts.key]);

  const theme = live.theme || { fg: '#FFFFFF', accent: '#FF6B2C' };
  const slide = live.black ? null : live.slide;
  const text = slide && !slide.media ? slide.text : '';
  const [box, inner] = useFit([text, slide && slide.title, opts.style, opts.scale, window.innerHeight], (opts.style === 'lower' ? 5.4 : 8.5) * opts.scale);
  const refName = slide && slide.ref ? slide.ref.split(' · ')[0] : '';

  if (opts.style === 'full') {
    const bgImage = slide && !slide.media && slide.bg && slide.bg.kind === 'image' ? api.media.url(slide.bg) : '';
    return (
      <div className="stream full" style={{ color: theme.fg }}>
        {(text || (slide && slide.media)) && <div className="stream-fill" style={{ background: theme.bg || '#000' }} />}
        {bgImage && <><img className="bg-fill" src={bgImage} alt="" /><div className="bg-dim" style={{ background: `rgba(0,0,0,${theme.dim ?? 0.45})` }} /></>}
        {slide && slide.media && slide.media.kind === 'image' && <img className="media-fit" src={api.media.url(slide.media)} alt="" />}
        {text && (
          <div className="out-box" ref={box}>
            <div className="out-inner" ref={inner}>
              {slide.title && <div className="out-title" style={{ color: theme.accent }}>{slide.title}</div>}
              <div className="out-text">{text}</div>
              {slide.sub && <div className="out-sub">{slide.sub}</div>}
            </div>
          </div>
        )}
        {text && refName && <div className="stream-ref-full" style={{ color: theme.accent }}>{refName}{slide.credit && <span className="stream-credit"> · {slide.credit}</span>}</div>}
      </div>
    );
  }

  return (
    <div className="stream lower">
      {text && (
        // over a key colour the bar is solid, so OBS's colour remover can't eat into it
        <div className="lower-bar" style={{ borderLeftColor: theme.accent, background: opts.key === 'transparent' ? 'rgba(12, 11, 10, 0.78)' : '#0C0B0A' }}>
          <div className="lower-box" ref={box}>
            <div className="lower-text" ref={inner}>
              {slide.title && <div className="lower-title" style={{ color: theme.accent }}>{slide.title}</div>}
              {text}
            </div>
          </div>
          {refName && <div className="lower-ref" style={{ color: theme.accent }}>{refName}{slide.credit && <span className="stream-credit"> · {slide.credit}</span>}</div>}
        </div>
      )}
    </div>
  );
}
