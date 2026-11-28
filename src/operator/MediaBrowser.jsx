import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../bridge.js';
import { filterMedia, collectionsOf, formatBytes, formatDuration } from '../lib/mediaLib.js';
import { makeThumb } from './thumbs.js';
import { Plus } from 'lucide-react';

// Pictures and videos: add, find (Pictures / Videos, search, collections, sort), preview and use.
// The same browser appears in the narrow library column and, for big collections, as a large window.
export default function MediaBrowser({ t, library, setLibrary, settings, setSettings, addItem, flash }) {
  const [filter, setFilter] = useState({ kind: 'all', query: '', collection: '', sort: 'new' });
  const [large, setLarge] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState('');
  const media = library.media || [];

  const update = (id, patch) => setLibrary((l) => ({ ...l, media: (l.media || []).map((m) => (m.id === id ? { ...m, ...patch } : m)) }));

  // thumbnails for anything without one (just added, or added before thumbnails existed)
  const working = useRef(false);
  useEffect(() => {
    const todo = media.filter((m) => !m.thumb && !m.thumbFailed);
    if (!todo.length || working.current) return;
    working.current = true;
    (async () => {
      for (const [i, m] of todo.entries()) {
        setBusy(`${t('makingPreviews')} ${i + 1}/${todo.length}`);
        const info = await makeThumb(m);
        update(m.id, info.thumb ? info : { ...info, thumbFailed: true });
      }
      setBusy('');
      working.current = false;
    })();
  }, [media.length]);

  const addMedia = async () => {
    const added = await api.media.import();
    if (added.length) {
      // new files go into the collection being looked at, so they are easy to find again
      const collection = filter.collection && filter.collection !== '*none' ? filter.collection : undefined;
      setLibrary((l) => ({ ...l, media: [...added.map((m) => ({ ...m, collection })), ...(l.media || [])] }));
      flash(`${added.length} ${t('media').toLowerCase()} +`);
    }
  };

  const removeMedia = async (m) => {
    if (!confirm(`${t('remove')}: ${m.name}?`)) return;
    await api.media.remove(m);
    setLibrary((l) => ({ ...l, media: l.media.filter((x) => x.id !== m.id) }));
    if (settings.theme.bgMedia === m.id) setSettings((st) => ({ ...st, theme: { ...st.theme, bgMedia: null } }));
    setPreview(null);
  };
  const setBg = (m) => setSettings((st) => ({ ...st, theme: { ...st.theme, bgMedia: st.theme.bgMedia === m.id ? null : m.id } }));

  const shown = useMemo(() => filterMedia(media, filter), [media, filter]);
  const collections = useMemo(() => collectionsOf(media), [media]);
  const counts = useMemo(() => ({ all: media.length, image: media.filter((m) => m.kind === 'image').length, video: media.filter((m) => m.kind === 'video').length }), [media]);
  const handlers = { onPreview: setPreview, onShow: (m) => addItem({ type: 'media', refId: m.id, title: m.name }, true), onAdd: (m) => addItem({ type: 'media', refId: m.id, title: m.name }), onBg: setBg, isBg: (m) => settings.theme.bgMedia === m.id };

  const tools = (
    <>
      <div className="row">
        <button type="button" id="media-import" className="primary grow" onClick={addMedia}>+ {t('addMedia')}</button>
        {!large && <button type="button" id="media-large" onClick={() => setLarge(true)} title={t('largeView')}>⤢</button>}
      </div>
      <input id="media-search" value={filter.query} onChange={(e) => setFilter({ ...filter, query: e.target.value })} placeholder={t('searchMedia')} aria-label={t('searchMedia')} />
      <div className="chips" role="tablist">
        {[['all', t('all')], ['image', t('pictures')], ['video', t('videos')]].map(([k, label]) => (
          <button key={k} type="button" role="tab" data-kind={k} aria-selected={filter.kind === k} className={filter.kind === k ? 'on' : ''} onClick={() => setFilter({ ...filter, kind: k })}>
            {label} <span className="count">{counts[k]}</span>
          </button>
        ))}
      </div>
      <div className="row">
        <select className="grow" value={filter.collection} onChange={(e) => setFilter({ ...filter, collection: e.target.value })} aria-label={t('collection')}>
          <option value="">{t('allCollections')}</option>
          {collections.map((c) => <option key={c} value={c}>{c}</option>)}
          <option value="*none">{t('noCollection')}</option>
        </select>
        <select value={filter.sort} onChange={(e) => setFilter({ ...filter, sort: e.target.value })} aria-label={t('sort')}>
          <option value="new">{t('newest')}</option>
          <option value="name">{t('byName')}</option>
          <option value="size">{t('bySize')}</option>
        </select>
      </div>
    </>
  );

  const grid = (
    <div className={large ? 'media-tiles' : 'media-grid'}>
      {shown.map((m) => <MediaCard key={m.id} m={m} t={t} large={large} {...handlers} />)}
      {!shown.length && <p className="muted small">{media.length ? t('noMatch') : t('mediaHelp')}</p>}
    </div>
  );

  return (
    <div className="lib-body">
      {tools}
      {busy && <p className="muted small" style={{ margin: 0 }}>{busy}</p>}
      <label className="field"><span>{t('defaultBg')}</span>
        <select value={settings.theme.bgMedia || ''} onChange={(e) => setSettings((st) => ({ ...st, theme: { ...st.theme, bgMedia: e.target.value || null } }))}>
          <option value="">{t('none')}</option>
          {media.map((m) => <option key={m.id} value={m.id}>{m.kind === 'video' ? '▶ ' : ''}{m.name}</option>)}
        </select>
      </label>
      <label className="swatch">{t('darken')}
        <input type="range" min="0" max="0.8" step="0.05" value={settings.theme.dim ?? 0.45} onChange={(e) => setSettings((st) => ({ ...st, theme: { ...st.theme, dim: +e.target.value } }))} style={{ flex: 1, height: 'auto', '--fill': ((settings.theme.dim ?? 0.45) / 0.8 * 100) + '%' }} />
      </label>
      {!large && grid}

      {large && (
        <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) setLarge(false); }}>
          <div className="modal media-modal" role="dialog" aria-modal="true" aria-label={t('media')}>
            <div className="row between"><h2>{t('media')}</h2><button type="button" onClick={() => setLarge(false)}>{t('close')}</button></div>
            <div className="media-modal-tools">{tools}</div>
            <p className="muted small" style={{ margin: 0 }}>{shown.length} / {media.length}</p>
            {grid}
          </div>
        </div>
      )}

      {preview && (
        <MediaPreview t={t} m={media.find((x) => x.id === preview.id) || preview} collections={collections}
          onClose={() => setPreview(null)} onUpdate={update} onRemove={removeMedia} {...handlers} />
      )}
    </div>
  );
}

function Thumb({ m }) {
  const url = api.media.thumbUrl(m);
  return (
    <div className="media-thumb">
      {url ? <img src={url} alt="" loading="lazy" />
        : m.kind === 'video' ? <video src={api.media.url(m) + '#t=1'} muted preload="metadata" />
          : <img src={api.media.url(m)} alt="" loading="lazy" />}
      <span className={'badge ' + m.kind}>{m.kind === 'video' ? `▶ ${formatDuration(m.duration) || 'VIDEO'}` : 'PICTURE'}</span>
    </div>
  );
}

function MediaCard({ m, t, large, onPreview, onShow, onAdd, onBg, isBg }) {
  return (
    <div className={'media-card' + (isBg(m) ? ' is-bg' : '') + (large ? ' tile' : '')}>
      <button type="button" className="thumb-btn" onClick={() => onPreview(m)} title={t('preview')}><Thumb m={m} /></button>
      <div className="media-side">
        <div className="media-name" title={m.name}>{m.name}</div>
        {m.collection && <div className="media-coll">{m.collection}</div>}
        <div className="row">
          <button type="button" className="primary" onClick={() => onShow(m)}>{t('showNow')}</button>
          <button type="button" onClick={() => onAdd(m)} title={t('addToService')} aria-label={t('addToService')} className="icon-only"><Plus size={14} /></button>
          <button type="button" onClick={() => onBg(m)} title={t('useAsBg')}>BG</button>
        </div>
      </div>
    </div>
  );
}

function MediaPreview({ t, m, collections, onClose, onUpdate, onRemove, onShow, onAdd, onBg, isBg }) {
  const [sound, setSound] = useState(false);
  const [name, setName] = useState(m.name);
  const [coll, setColl] = useState(m.collection || '');
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const save = () => onUpdate(m.id, { name: name.trim() || m.name, collection: coll.trim() || undefined });
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) { save(); onClose(); } }}>
      <div className="modal preview-modal" role="dialog" aria-modal="true" aria-label={m.name}>
        <div className="preview-stage">
          {m.kind === 'video'
            ? <video id="preview-video" src={api.media.url(m)} controls muted={!sound} autoPlay playsInline />
            : <img src={api.media.url(m)} alt={m.name} />}
        </div>
        <div className="preview-side">
          <label className="field"><span>{t('title')}</span><input id="preview-name" value={name} onChange={(e) => setName(e.target.value)} onBlur={save} /></label>
          <label className="field"><span>{t('collection')}</span>
            <input id="preview-collection" list="media-collections" value={coll} placeholder={t('collectionHint')} onChange={(e) => setColl(e.target.value)} onBlur={save} />
            <datalist id="media-collections">{collections.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <dl className="facts">
            <dt>{t('type')}</dt><dd>{m.kind === 'video' ? t('video') : t('picture')}</dd>
            {m.width ? <><dt>{t('sizePx')}</dt><dd>{m.width}×{m.height}</dd></> : null}
            {m.duration ? <><dt>{t('length')}</dt><dd>{formatDuration(m.duration)}</dd></> : null}
            <dt>{t('fileSize')}</dt><dd>{formatBytes(m.size)}</dd>
          </dl>
          {m.kind === 'video' && (
            <label className="swatch"><input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> {t('previewSound')}</label>
          )}
          <div className="row">
            <button type="button" className="primary" onClick={() => { save(); onShow(m); onClose(); }}>{t('showNow')}</button>
            <button type="button" onClick={() => { save(); onAdd(m); }}>{t('addToService')}</button>
          </div>
          <div className="row">
            <button type="button" onClick={() => onBg(m)}>{isBg(m) ? t('stopBg') : t('useAsBg')}</button>
            <button type="button" onClick={() => onRemove(m)}>{t('remove')}</button>
          </div>
          <button type="button" onClick={() => { save(); onClose(); }}>{t('close')}</button>
        </div>
      </div>
    </div>
  );
}
