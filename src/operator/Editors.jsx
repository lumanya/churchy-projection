import React, { useEffect, useRef, useState } from 'react';
import { uid } from '../lib/defaults.js';
import { parseLyrics } from '../lib/songs.js';

function Modal({ title, children, onCancel }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current?.querySelector('input, textarea');
    el && el.focus();
    const k = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function SongEditor({ t, value, onSave, onCancel }) {
  const [song, setSong] = useState({ id: uid(), title: '', book: '', number: '', lyrics: '', ...value });
  const parts = parseLyrics(song.lyrics);
  const set = (k) => (e) => setSong({ ...song, [k]: e.target.value });
  return (
    <Modal title={value?.title ? t('edit') + ': ' + value.title : t('newSong')} onCancel={onCancel}>
      <div className="grid3">
        <label className="field span2"><span>{t('title')}</span><input value={song.title} onChange={set('title')} /></label>
        <label className="field"><span>{t('number')}</span><input value={song.number} onChange={set('number')} /></label>
      </div>
      <label className="field"><span>{t('book')}</span><input value={song.book} onChange={set('book')} placeholder="Tenzi za Rohoni, Nyimbo za Kristo, Choir…" /></label>
      <div className="editor-split">
        <label className="field grow"><span>{t('lyrics')}</span>
          <textarea rows={16} value={song.lyrics} onChange={set('lyrics')} spellCheck={false} />
          <span className="muted small">{t('lyricsHelp')}</span>
        </label>
        <div className="parts" aria-label="Preview">
          {parts.map((p, i) => <div key={i} className="part"><div className="mono accent small">{p.label}</div><div className="pre">{p.text}</div></div>)}
        </div>
      </div>
      <div className="row end">
        <button type="button" onClick={onCancel}>{t('cancel')}</button>
        <button type="button" className="primary" disabled={!song.title.trim() || !song.lyrics.trim()} onClick={() => onSave({ ...song, title: song.title.trim() })}>{t('save')}</button>
      </div>
    </Modal>
  );
}

export function NoticeEditor({ t, value, onSave, onCancel }) {
  const [n, setN] = useState({ id: uid(), title: '', body: '', ...value });
  return (
    <Modal title={value?.title ? t('edit') + ': ' + value.title : t('newNotice')} onCancel={onCancel}>
      <label className="field"><span>{t('title')}</span><input value={n.title} onChange={(e) => setN({ ...n, title: e.target.value })} /></label>
      <label className="field"><span>{t('body')}</span>
        <textarea rows={8} value={n.body} onChange={(e) => setN({ ...n, body: e.target.value })} />
        <span className="muted small">{t('noticeHelp')}</span>
      </label>
      <div className="row end">
        <button type="button" onClick={onCancel}>{t('cancel')}</button>
        <button type="button" className="primary" disabled={!n.title.trim()} onClick={() => onSave(n)}>{t('save')}</button>
      </div>
    </Modal>
  );
}

export function ServiceEditor({ t, value, onSave, onCancel }) {
  const [s, setS] = useState(value);
  return (
    <Modal title={t('newService')} onCancel={onCancel}>
      <label className="field"><span>{t('serviceName')}</span><input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} /></label>
      <label className="field"><span>Date</span><input type="date" value={s.date} onChange={(e) => setS({ ...s, date: e.target.value })} /></label>
      <div className="row end">
        <button type="button" onClick={onCancel}>{t('cancel')}</button>
        <button type="button" className="primary" disabled={!s.name.trim()} onClick={() => onSave(s)}>{t('save')}</button>
      </div>
    </Modal>
  );
}
