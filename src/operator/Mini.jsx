import React from 'react';

export function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="6" fill="#FF6B2C" />
      <path d="M6 20a8 8 0 0 1 16 0z" fill="#1A0A00" />
      <rect x="5" y="20" width="18" height="2.4" fill="#1A0A00" />
    </svg>
  );
}

// A small copy of what the projector shows, sized to its box with container units.
export function Mini({ slide, theme, live, message }) {
  const th = theme || { bg: '#000000', fg: '#FFFFFF', accent: '#FF6B2C' };
  return (
    <div className={'mini' + (live ? ' live' : '')} style={{ background: th.bg, color: th.fg }}>
      {slide ? (
        <div className="mini-inner">
          {slide.title && <div className="mini-title" style={{ color: th.accent }}>{slide.title}</div>}
          <div className="mini-text">{slide.text}</div>
          {slide.sub && <div className="mini-sub">{slide.sub}</div>}
          {slide.ref && <div className="mini-ref" style={{ color: th.accent }}>{slide.ref.split(' · ')[0]}</div>}
        </div>
      ) : null}
      {message ? <div className="mini-msg" style={{ background: th.accent }}>{message}</div> : null}
    </div>
  );
}
