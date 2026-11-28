import React, { useEffect, useState } from 'react';
import { api, onPhone } from '../bridge.js';
import { formatTimer, clockText } from './timer.js';
import { useFitText } from '../output/Output.jsx';

// The preacher's screen: what the congregation sees now, what comes next, the time, and messages from the operator.
// Shown full screen on a monitor facing the pulpit, or on a tablet through the phone remote.
export default function Stage() {
  const [live, setLive] = useState({});
  const [offset, setOffset] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => api.live.onUpdate((l) => { setLive(l || {}); if (l && l.now) setOffset(Date.now() - l.now); }), []);
  useEffect(() => { const h = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(h); }, []);

  const slide = live.black ? null : live.slide;
  const t = formatTimer(live.timer, offset);
  const showTimer = live.timer && (live.timer.running || live.timer.base);

  return (
    <div className="stage">
      {onPhone && <a className="stage-back" href="#/remote">← Remote</a>}
      <div className="stage-top">
        <div className="stage-clock">{clockText()}</div>
        {showTimer ? <div className={'stage-timer' + (t.over ? ' over' : t.warn ? ' warn' : '')}>{t.text}</div> : <div />}
      </div>
      {live.stageMessage ? <div className="stage-msg">{live.stageMessage}</div> : null}
      <div className="stage-now">
        {slide && slide.verse ? (
          <>
            <div className="stage-label">{live.black ? 'BLACK SCREEN' : 'NOW'}</div>
            <div className="stage-ref">{slide.refName}</div>
            <StageVerse slide={slide} />
          </>
        ) : (
          <>
            <div className="stage-label">{live.black ? 'BLACK SCREEN' : 'NOW'}{slide && slide.ref ? ' · ' + slide.ref.split(' · ')[0] : ''}</div>
            <div className="stage-now-text">{slide ? (slide.media ? `${slide.media.kind === 'video' ? '▶ Video' : 'Picture'}: ${slide.media.name}` : slide.text) : ''}</div>
          </>
        )}
      </div>
      <div className="stage-next">
        <div className="stage-label">NEXT{live.next ? ' · ' + (live.next.refName || live.next.label || '') : ''}</div>
        <div className="stage-next-text">{live.next ? (live.next.media ? `${live.next.media.kind === 'video' ? '▶ Video' : 'Picture'}: ${live.next.media.name}` : live.next.text) : '—'}</div>
      </div>
    </div>
  );
}

// the verse on the preacher's screen: each translation with its tag, the main one first and largest
function StageVerse({ slide }) {
  const [box, inner] = useFitText([slide.text, slide.sub], 6.4, 2.4);
  const v = (slide.versions || []);
  return (
    <div className="stage-verse-box" ref={box}>
      <div className="stage-verse" ref={inner}>
        <div className="stage-ver">
          {v[0] && <span className="stage-tag">{v[0]}</span>}
          <div className="stage-now-text"><sup>{slide.verse}</sup>{slide.text}</div>
        </div>
        {slide.sub && (
          <div className="stage-ver second">
            {v[1] && <span className="stage-tag second">{v[1]}</span>}
            <div className="stage-sub-text"><sup>{slide.verse}</sup>{slide.sub}</div>
          </div>
        )}
      </div>
    </div>
  );
}
