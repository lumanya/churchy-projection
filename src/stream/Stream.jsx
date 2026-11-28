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

  return <LowerThird slide={slide} theme={theme} opts={opts} />;
}

// The lower third: a dark panel across the bottom, inside the TV-safe margins. It is only as tall as its text,
// never more than about a third of the picture. Verses show the main translation only, with its reference on top.
function LowerThird({ slide, theme, opts }) {
  const text = slide && !slide.media ? slide.text : '';
  const verse = !!(slide && slide.verse);
  const head = verse ? slide.refName : (slide && (slide.title || (slide.ref ? slide.ref.split(' · ')[0] : ''))) || '';
  const version = verse && slide.versions ? slide.versions[0] : '';
  const credit = verse ? slide.mainCredit : slide && slide.credit;
  const base = (verse ? 4.3 : 5) * opts.scale;
  const textRef = useRef(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    const again = () => setTick((n) => n + 1);
    window.addEventListener('resize', again);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(again).catch(() => {});
    return () => window.removeEventListener('resize', again);
  }, []);
  // as large as the design asks, smaller only when the words would make the panel too tall
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const limit = window.innerHeight * 0.26;
    let s = base;
    el.style.fontSize = s + 'vh';
    while (s > 1.8 && el.scrollHeight > limit) { s -= 0.1; el.style.fontSize = s + 'vh'; }
  });
  if (!text) return <div className="stream lower" />;
  const solid = opts.key !== 'transparent';
  return (
    <div className="stream lower">
      <div className="lt-panel" key={slideKeyOf(slide)} style={{ background: solid ? '#0E0D0C' : 'rgba(14, 13, 12, 0.86)', boxShadow: solid ? 'none' : '0 1.7vh 4.6vh rgba(0,0,0,0.45)' }}>
        {head && (
          <div className="lt-head" style={{ fontSize: (verse ? 3.15 : 2.4) * opts.scale + 'vh' }}>
            <span style={{ color: theme.accent }}>{head}</span>
            {version && <span className="lt-version">{version}</span>}
          </div>
        )}
        <div className={'lt-text' + (verse ? ' verse' : '')} ref={textRef}>{text}</div>
      </div>
      {credit && <div className="lt-credit">{credit}</div>}
    </div>
  );
}

const slideKeyOf = (s) => (s ? [s.title, s.text, s.ref].join('|') : '');
