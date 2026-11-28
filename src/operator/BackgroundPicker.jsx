import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X, Ban, Layers } from 'lucide-react';
import { api } from '../bridge.js';
import { formatDuration } from '../lib/mediaLib.js';

// A background chooser with pictures: thumbnails of every picture and video, a search box and
// Pictures / Videos filters. A video plays silently while the pointer rests on it.
// value: '' = the default background (when allowDefault), 'none', or a media id.
function Tile({ m, on, onPick }) {
  const [hover, setHover] = useState(false);
  const thumb = api.media.thumbUrl(m);
  return (
    <button type="button" className={'bgp-tile' + (on ? ' on' : '')} data-bg={m.id} onClick={onPick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} title={m.name}>
      <span className="bgp-thumb">
        {m.kind === 'video' && hover
          ? <video src={api.media.url(m)} muted autoPlay loop playsInline />
          : thumb ? <img src={thumb} alt="" loading="lazy" />
            : m.kind === 'video' ? <video src={api.media.url(m) + '#t=1'} muted preload="metadata" />
              : <img src={api.media.url(m)} alt="" loading="lazy" />}
        {m.kind === 'video' && <span className="bgp-badge">▶ {formatDuration(m.duration) || ''}</span>}
        {on && <span className="bgp-check"><Check size={14} /></span>}
      </span>
      <span className="bgp-name">{m.name}</span>
    </button>
  );
}

export default function BackgroundPicker({ t, media, value, onChange, allowDefault, defaultMedia, id }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  const wrap = useRef(null);
  const list = media || [];
  const current = value && value !== 'none' ? list.find((m) => m.id === value) : null;

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc, true); };
  }, [open]);

  const pick = (v) => { onChange(v); setOpen(false); };
  const shown = list.filter((m) => (kind === 'all' || m.kind === (kind === 'pictures' ? 'image' : 'video'))
    && (!q.trim() || (m.name + ' ' + (m.collection || '')).toLowerCase().includes(q.trim().toLowerCase())));
  const count = (k) => list.filter((m) => m.kind === k).length;

  const label = current ? current.name : value === 'none' ? t('none') : allowDefault ? t('defaultBg') : t('none');
  const triggerThumb = current || (value === '' && allowDefault ? defaultMedia : null);

  return (
    <div className="bgp" ref={wrap}>
      <button type="button" id={id} className="bgp-trigger" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog">
        <span className="bgp-mini">
          {triggerThumb ? <img src={api.media.thumbUrl(triggerThumb) || api.media.url(triggerThumb)} alt="" /> : <Ban size={14} />}
        </span>
        <span className="bgp-label">{label}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="bgp-pop" role="dialog" aria-label={t('background')}>
          <div className="bgp-tools">
            <label className="bgp-search"><Search size={15} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchMedia')} aria-label={t('searchMedia')} /></label>
            <div className="chips">
              {[['all', t('all'), list.length], ['pictures', t('pictures'), count('image')], ['videos', t('videos'), count('video')]].map(([k, l, n]) => (
                <button key={k} type="button" className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}<span className="count">{n}</span></button>
              ))}
            </div>
            <button type="button" className="ghost icon-only" aria-label={t('close')} onClick={() => setOpen(false)}><X size={16} /></button>
          </div>
          <div className="bgp-grid">
            {allowDefault && (
              <button type="button" className={'bgp-tile special' + (value === '' ? ' on' : '')} data-bg="default" onClick={() => pick('')}>
                <span className="bgp-thumb">
                  {defaultMedia ? <img src={api.media.thumbUrl(defaultMedia) || api.media.url(defaultMedia)} alt="" /> : <Layers size={22} />}
                  {value === '' && <span className="bgp-check"><Check size={14} /></span>}
                </span>
                <span className="bgp-name">{t('defaultBg')}</span>
              </button>
            )}
            <button type="button" className={'bgp-tile special' + (value === 'none' || (!allowDefault && !value) ? ' on' : '')} data-bg="none" onClick={() => pick(allowDefault ? 'none' : '')}>
              <span className="bgp-thumb none"><Ban size={22} />{(value === 'none' || (!allowDefault && !value)) && <span className="bgp-check"><Check size={14} /></span>}</span>
              <span className="bgp-name">{t('none')}</span>
            </button>
            {shown.map((m) => <Tile key={m.id} m={m} on={value === m.id} onPick={() => pick(m.id)} />)}
          </div>
          {!shown.length && <p className="muted small" style={{ margin: '4px 2px' }}>{t('noMediaMatch')}</p>}
        </div>
      )}
    </div>
  );
}
