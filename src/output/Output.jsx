import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../bridge.js';
import { Background, MediaSlide } from './MediaLayer.jsx';
import { Backdrop } from './Backdrop.jsx';
import { activeLook, fontOf, lookById, slideKey } from '../lib/looks.js';

const FADE_MS = 450;

// Shrinks the text until it fits the screen, so long verses never run off the edge.
export function useFitText(deps, max = 9, min = 2.2) {
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

// The words of one slide. With a second translation the main version leads and the second follows,
// smaller and in a softer colour but still easy to read: one above the other, or side by side.
export function SlideWords({ slide, theme, size }) {
  const dual = slide.sub ? (theme.dual === 'side' ? 'side' : 'stacked') : '';
  const [box, inner] = useFitText([slide.text, slide.sub, slide.title, dual, size]);
  const second = (slide.versions && slide.versions[1]) || '';
  return (
    <div className="out-box" ref={box}>
      <div className={'out-inner' + (dual ? ' dual dual-' + dual : '')} ref={inner}>
        {slide.title && <div className="out-title" style={{ color: theme.accent }}>{slide.title}</div>}
        {dual === 'side' ? (
          <div className="out-cols">
            <div className="out-text">{slide.text}</div>
            <div className="out-col-rule" style={{ background: theme.accent }} />
            <div className="out-sub">{second && <span className="out-sub-tag" style={{ color: theme.accent }}>{second}</span>}{slide.sub}</div>
          </div>
        ) : (
          <>
            <div className="out-text">{slide.text}</div>
            {slide.sub && (
              <>
                <div className="out-rule"><span style={{ background: theme.accent }} />{second && <em style={{ color: theme.accent }}>{second}</em>}<span style={{ background: theme.accent }} /></div>
                <div className="out-sub">{slide.sub}</div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// A Bible verse: the reference large at the top; each translation labelled above its own text,
// the main one with a filled tag, the second outlined; the verse number before each text, as in a printed Bible.
function VersionLabel({ slide, i, theme }) {
  const short = (slide.versions || [])[i];
  if (!short) return null;
  // the short name only, as plain text: the main one in the accent colour, the second a little softer
  return <div className="ver-label"><span className={'ver-tag' + (i ? ' second' : '')} style={{ color: theme.accent }}>{short}</span></div>;
}

export function VerseWords({ slide, theme, size }) {
  const two = !!slide.sub;
  const layout = two ? (theme.dual === 'side' ? 'side' : 'stacked') : 'single';
  const [box, inner] = useFitText([slide.text, slide.sub, layout, size], 7.6, 2);
  const num = <sup className="vnum" style={{ color: theme.accent }}>{slide.verse}</sup>;
  return (
    <>
      <div className="out-head">
        <span className="out-head-ref" style={{ color: theme.accent }}>{slide.refName}</span>
        {!two && slide.versions && slide.versions[0] && <span className="ver-tag second" style={{ color: theme.accent }}>{slide.versions[0]}</span>}
      </div>
      <div className="out-box verse-box" ref={box}>
        <div className={'out-inner verse verse-' + layout} ref={inner}>
          <section className="ver">
            {two && <VersionLabel slide={slide} i={0} theme={theme} />}
            <div className="out-text">{num}{slide.text}</div>
          </section>
          {two && <div className="ver-rule" />}
          {two && (
            <section className="ver">
              <VersionLabel slide={slide} i={1} theme={theme} />
              <div className="out-sub">{num}{slide.sub}</div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

// "John 3:16" with the versions as small tags: the main one filled, the second outlined
export function RefBar({ slide, theme }) {
  if (!slide.ref) return null;
  const [name, ...rest] = slide.ref.split(' · ');
  const versions = slide.versions || rest;
  return (
    <div className="out-ref">
      <span className="out-ref-name" style={{ color: theme.accent }}>{name}</span>
      <span className="out-ref-tags">
        {versions.map((v, i) => (
          <span key={v + i} className={'out-tag' + (i ? ' second' : '')} style={i ? { borderColor: theme.accent, color: theme.accent } : { background: theme.accent, color: lookById(theme.look)?.light ? '#fff' : '#120A05' }}>{v}</span>
        ))}
      </span>
    </div>
  );
}

// Slides on screen: the new one fades in while the old one fades out (or cuts, if the church prefers).
function useLayers(slide, fade) {
  const key = slideKey(slide);
  const [layers, setLayers] = useState(() => (slide ? [{ key, slide, leaving: false }] : []));
  useEffect(() => {
    setLayers((ls) => {
      const kept = fade ? ls.filter((l) => !l.leaving && l.key !== key).map((l) => ({ ...l, leaving: true })) : [];
      const same = ls.find((l) => !l.leaving && l.key === key);
      return slide ? [...kept, same ? { ...same, slide } : { key, slide, leaving: false }] : kept;
    });
    if (!fade) return undefined;
    const t = setTimeout(() => setLayers((ls) => ls.filter((l) => !l.leaving)), FADE_MS + 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fade]);
  return layers;
}

export default function Output() {
  const [live, setLive] = useState({ slide: null, black: false, message: '', theme: null });
  const [size, setSize] = useState(0);
  useEffect(() => api.live.onUpdate((l) => setLive(l || {})), []);
  useEffect(() => {
    const resize = () => setSize((n) => n + 1);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const theme = live.theme || { bg: '#000000', fg: '#FFFFFF', accent: '#FF6B2C' };
  const fade = theme.transition !== 'cut';
  const slide = live.slide || null;
  const layers = useLayers(slide, fade);
  const textBg = slide && !slide.media ? slide.bg : null;
  const onImage = !!textBg || (activeLook(theme) && !lookById(theme.look)?.light);

  return (
    <div className={'out' + (onImage ? ' on-image' : '') + (fade ? ' fades' : '')}
      style={{ background: theme.bg, color: theme.fg, fontFamily: fontOf(theme), '--fade': FADE_MS + 'ms', '--accent': theme.accent }}>
      <Backdrop theme={theme} />
      {textBg && <Background bg={textBg} dim={theme.dim ?? 0.45} />}
      {layers.map((l) => (
        <div key={l.key} className={'out-layer' + (l.leaving ? ' leaving' : '')}>
          {l.slide.media
            ? <MediaSlide media={l.slide.media} video={l.leaving ? { ...(live.video || {}), volume: 0 } : live.video} report={l.leaving ? () => {} : api.video.report} />
            : l.slide.verse ? (
              <>
                <VerseWords slide={l.slide} theme={theme} size={size} />
                {l.slide.credit && <div className="out-credit">{l.slide.credit}</div>}
              </>
            ) : (l.slide.text || l.slide.title) && (
              <>
                <SlideWords slide={l.slide} theme={theme} size={size} />
                <RefBar slide={l.slide} theme={theme} />
                {l.slide.credit && <div className="out-credit">{l.slide.credit}</div>}
              </>
            )}
        </div>
      ))}
      {live.message && <div className="out-message" style={{ background: theme.accent }}>{live.message}</div>}
      <div className={'out-black' + (live.black ? ' on' : '')} />
    </div>
  );
}
