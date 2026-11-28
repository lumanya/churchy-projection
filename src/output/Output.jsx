import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../bridge.js';
import { Background, MediaSlide } from './MediaLayer.jsx';

// Shrinks the text until it fits the screen, so long verses never run off the edge.
function useFitText(deps, max = 9, min = 2.2) {
  const box = useRef(null);
  const inner = useRef(null);
  useLayoutEffect(() => {
    const b = box.current, el = inner.current;
    if (!b || !el) return;
    let s = max;
    el.style.fontSize = s + 'vh';
    while (s > min && (el.scrollHeight > b.clientHeight || el.scrollWidth > b.clientWidth)) {
      s -= 0.2;
      el.style.fontSize = s + 'vh';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return [box, inner];
}

export default function Output() {
  const [live, setLive] = useState({ slide: null, black: false, message: '', theme: null });
  const [, setSize] = useState(0);
  useEffect(() => api.live.onUpdate((l) => setLive(l || {})), []);
  useEffect(() => {
    const resize = () => setSize((n) => n + 1);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const theme = live.theme || { bg: '#000000', fg: '#FFFFFF', accent: '#FF6B2C' };
  const slide = live.black ? null : live.slide;
  const hasText = slide && !slide.media && (slide.text || slide.title);
  const [box, inner] = useFitText([slide && slide.text, slide && slide.sub, slide && slide.title, window.innerWidth, window.innerHeight]);

  return (
    <div className="out" style={{ background: theme.bg, color: theme.fg }}>
      {slide && !slide.media && <Background bg={slide.bg} dim={theme.dim ?? 0.45} />}
      {slide && slide.media && <MediaSlide media={slide.media} video={live.video} report={api.video.report} />}
      {hasText && (
        <>
          <div className="out-box" ref={box}>
            <div className="out-inner" ref={inner}>
              {slide.title && <div className="out-title" style={{ color: theme.accent }}>{slide.title}</div>}
              <div className="out-text">{slide.text}</div>
              {slide.sub && <div className="out-sub">{slide.sub}</div>}
            </div>
          </div>
          {slide.ref && (
            <div className="out-ref">
              <span style={{ color: theme.accent }}>{slide.ref.split(' · ')[0]}</span>
              <span className="out-ref-tr">{slide.ref.split(' · ').slice(1).join(' · ')}</span>
            </div>
          )}
          {slide.credit && <div className="out-credit">{slide.credit}</div>}
        </>
      )}
      {live.message && <div className="out-message" style={{ background: theme.accent }}>{live.message}</div>}
    </div>
  );
}
