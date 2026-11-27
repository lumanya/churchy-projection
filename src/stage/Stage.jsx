import React, { useEffect, useState } from 'react';
import { api, onPhone } from '../bridge.js';
import { formatTimer, clockText } from './timer.js';

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
        <div className="stage-label">{live.black ? 'BLACK SCREEN' : 'NOW'}{slide && slide.ref ? ' · ' + slide.ref.split(' · ')[0] : ''}</div>
        <div className="stage-now-text">{slide ? slide.text : ''}</div>
      </div>
      <div className="stage-next">
        <div className="stage-label">NEXT{live.next && live.next.label ? ' · ' + live.next.label : ''}</div>
        <div className="stage-next-text">{live.next ? live.next.text : '—'}</div>
      </div>
    </div>
  );
}
