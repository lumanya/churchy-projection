import React, { useEffect, useState } from 'react';
import { api } from '../bridge.js';
import { Logo, Mini } from '../operator/Mini.jsx';

// The phone remote. Same Wi-Fi as the church PC; opened from the QR code in Mwanga.
export default function Remote() {
  const [live, setLive] = useState(null);
  const [status, setStatus] = useState('connecting');
  const [verse, setVerse] = useState('');
  const [msg, setMsg] = useState('');
  const [tab, setTab] = useState('service');
  useEffect(() => api.live.onUpdate((l) => { setLive(l); setStatus('connected'); }, setStatus), []);
  const cmd = (c) => api.command(c).then((r) => { if (r.status === 401) setStatus('pin'); }).catch(() => setStatus('reconnecting'));

  if (status === 'pin') return <div className="rm rm-center"><Logo size={48} /><p>The PIN is wrong or has changed. Scan the QR code in Mwanga again.</p></div>;
  if (!live) return <div className="rm rm-center"><Logo size={48} /><p>{status === 'reconnecting' ? 'Looking for Mwanga on this Wi-Fi…' : 'Connecting…'}</p></div>;

  const items = live.service?.items || [];
  const slides = live.slides || [];

  return (
    <div className="rm">
      <header className="rm-head">
        <div className="brand"><Logo size={26} /><span>Mwanga Remote</span></div>
        <span className={'rm-dot ' + status}>{status === 'connected' ? 'Connected' : 'Reconnecting…'}</span>
      </header>

      <Mini slide={live.black ? null : live.slide} theme={live.theme} live />
      <div className="rm-caption muted small">{live.black ? 'Black screen' : live.slide ? live.slide.label : 'Nothing on screen'}</div>

      <div className="rm-nav">
        <button type="button" id="rm-prev" onClick={() => cmd({ type: 'prev' })}>← Back</button>
        <button type="button" id="rm-next" className="primary" onClick={() => cmd({ type: 'next' })}>Next →</button>
      </div>

      <form className="rm-row" onSubmit={(e) => { e.preventDefault(); if (verse.trim()) { cmd({ type: 'verse', text: verse }); setVerse(''); } }}>
        <label className="sr" htmlFor="rm-verse">Verse</label>
        <input id="rm-verse" value={verse} onChange={(e) => setVerse(e.target.value)} placeholder="Verse, e.g. ps 23:1 or yh 3:16" enterKeyHint="go" />
        <button type="submit">Show</button>
      </form>

      <div className="rm-three">
        <button type="button" className={live.black ? 'warn' : ''} onClick={() => cmd({ type: 'black' })}>{live.black ? 'Restore' : 'Black'}</button>
        <button type="button" onClick={() => cmd({ type: 'clear' })}>Clear</button>
        <a className="btn" href="#/stage">Preacher view</a>
      </div>

      <form className="rm-row" onSubmit={(e) => { e.preventDefault(); cmd({ type: 'stageMessage', text: msg }); }}>
        <label className="sr" htmlFor="rm-msg">Message to preacher</label>
        <input id="rm-msg" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Message to preacher" />
        <button type="submit">Send</button>
        {live.stageMessage ? <button type="button" onClick={() => { setMsg(''); cmd({ type: 'stageMessage', text: '' }); }}>Hide</button> : null}
      </form>

      <div className="tabs">
        <button type="button" className={tab === 'service' ? 'on' : ''} onClick={() => setTab('service')}>Order of service</button>
        <button type="button" className={tab === 'slides' ? 'on' : ''} onClick={() => setTab('slides')}>Slides</button>
      </div>
      {tab === 'service' && (
        <div className="rm-list">
          {items.map((it, i) => (
            <button type="button" key={i} className={'rm-item' + (i === live.liveItem ? ' on' : '')} onClick={() => cmd({ type: 'goto', item: i, slide: 0 })}>
              <span className="mono muted">{String(i + 1).padStart(2, '0')}</span><span>{it.title}</span>
            </button>
          ))}
        </div>
      )}
      {tab === 'slides' && (
        <div className="rm-list">
          {slides.map((s, i) => (
            <button type="button" key={i} className={'rm-item' + (i === live.liveIndex ? ' on' : '')} onClick={() => cmd({ type: 'goto', item: live.liveItem, slide: i })}>
              <span className="mono muted">{s.label}</span><span className="rm-slide-text">{s.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
