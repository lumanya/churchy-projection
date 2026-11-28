import { Backdrop } from '../output/Backdrop.jsx';
import { activeLook, fontOf, lookById } from '../lib/looks.js';
import { api } from '../bridge.js';
import React from 'react';

export function Logo({ size = 28 }) {
  // Mwanga = light: the sun rising over the horizon. Same drawing as build/icon.png.
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="6" fill="#FF6B2C" />
      <g fill="#1A0A00" stroke="#1A0A00" strokeWidth="1.7" strokeLinecap="round">
        <path d="M7.8 19.2a6.2 6.2 0 0 1 12.4 0z" stroke="none" />
        <rect x="4.5" y="20.6" width="19" height="2" rx="1" stroke="none" />
        <path d="M14 10.9V8.4M8.13 13.33L6.36 11.56M19.87 13.33l1.77-1.77M6.2 16.36l-1.6-.58M21.8 16.36l1.6-.58" fill="none" />
      </g>
    </svg>
  );
}

// A small copy of what the projector shows, sized to its box with container units.
// Videos play silently here; the sound is only on the projector.
export function Mini({ slide, theme, live, message }) {
  const th = theme || { bg: '#000000', fg: '#FFFFFF', accent: '#FF6B2C' };
  const canPlay = api.kind === 'electron' || api.kind === 'browser';
  const media = slide && slide.media;
  const bg = slide && !media ? slide.bg : null;
  const url = (m) => api.media.url(m.file);
  const dual = slide && slide.sub ? (th.dual === 'side' ? 'side' : 'stacked') : '';
  const versions = slide && (slide.versions || (slide.ref ? slide.ref.split(' · ').slice(1) : []));
  const onImage = !!bg || (activeLook(th) && !lookById(th.look)?.light);
  return (
    <div className={'mini' + (live ? ' live' : '') + (onImage ? ' on-image' : '')} style={{ background: th.bg, color: th.fg, fontFamily: fontOf(th), '--accent': th.accent }}>
      {!media && <Backdrop theme={th} still />}
      {bg && (bg.kind === 'video'
        ? (canPlay && live ? <video className="bg-fill" src={url(bg)} autoPlay loop muted playsInline /> : <video className="bg-fill" src={url(bg) + '#t=1'} muted preload="metadata" />)
        : <img className="bg-fill" src={url(bg)} alt="" />)}
      {bg && <div className="bg-dim" style={{ background: `rgba(0,0,0,${th.dim ?? 0.45})` }} />}
      {media && (media.kind === 'video'
        ? (canPlay ? <video className="media-fit" src={url(media) + (live ? '' : '#t=1')} muted autoPlay={!!live} loop={!!live} playsInline preload="metadata" /> : <div className="mini-inner"><div className="mini-text">▶ {media.name}</div></div>)
        : <img className="media-fit" src={url(media)} alt={media.name || ''} />)}
      {slide && !media ? (
        <div className={'mini-inner' + (dual ? ' dual-' + dual : '')}>
          {slide.title && <div className="mini-title" style={{ color: th.accent }}>{slide.title}</div>}
          {dual === 'side' ? (
            <div className="mini-cols"><div className="mini-text">{slide.text}</div><div className="mini-sub">{slide.sub}</div></div>
          ) : (
            <>
              <div className="mini-text">{slide.text}</div>
              {slide.sub && <div className="mini-sub">{slide.sub}</div>}
            </>
          )}
        </div>
      ) : null}
      {slide && !media && slide.ref && (
        <div className="mini-ref">
          <span style={{ color: th.accent }}>{slide.ref.split(' · ')[0]}</span>
          {versions && versions.length > 0 && <span className="mini-tags">{versions.map((v, i) => <span key={v + i} className={'mini-tag' + (i ? ' second' : '')} style={i ? { borderColor: th.accent, color: th.accent } : { background: th.accent, color: lookById(th.look)?.light ? '#fff' : '#120A05' }}>{v}</span>)}</span>}
        </div>
      )}
      {message ? <div className="mini-msg" style={{ background: th.accent }}>{message}</div> : null}
    </div>
  );
}
