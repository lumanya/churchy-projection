import React, { useMemo, useState } from 'react';
import { api } from '../bridge.js';
import { BOOKS, bookName } from '../lib/books.js';
import { formatReference } from '../lib/bibleRef.js';
import { parseOpenLyrics, parsePlainSong } from '../lib/songs.js';
import { importBibleFiles } from '../lib/bibleImport.js';
import { uid } from '../lib/defaults.js';
import MediaBrowser from './MediaBrowser.jsx';
import { easyWorshipSongs, parseVideoPsalmFile, LockedBookError, pickEasyWorshipFiles } from '../lib/importers.js';

export default function Library({ t, library, setLibrary, settings, setSettings, bibleList, setBibleList, bibles, setBibles, addItem, onEdit, flash }) {
  const [tab, setTab] = useState('songs');
  const [filter, setFilter] = useState('');
  const [pick, setPick] = useState({ book: 'JHN', chapter: 3, from: 16, to: 16 });
  const lang = settings.lang;

  const songs = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = [...library.songs].sort((a, b) => (a.book || '').localeCompare(b.book || '') || (parseInt(a.number, 10) || 1e9) - (parseInt(b.number, 10) || 1e9) || a.title.localeCompare(b.title));
    return q ? list.filter((s) => s.title.toLowerCase().includes(q) || String(s.number) === q || (s.book || '').toLowerCase().includes(q)) : list;
  }, [library.songs, filter]);

  const importSongs = async () => {
    const files = await api.openFiles([{ name: 'Songs', extensions: ['txt', 'xml'] }]);
    const added = [];
    for (const f of files) {
      try {
        const s = /\.xml$/i.test(f.name) ? parseOpenLyrics(f.text) : parsePlainSong(f.text, f.name.replace(/\.[^.]+$/, ''));
        if (s.lyrics) added.push({ id: uid(), book: '', number: '', ...s });
      } catch (e) { flash(t('importFailed') + ': ' + f.name); }
    }
    if (added.length) { setLibrary((l) => ({ ...l, songs: [...added, ...l.songs] })); flash(`${added.length} ${t('songs').toLowerCase()} +`); }
  };

  // adds songs, skipping ones the church already has (same title and song book)
  const addSongs = (list, from) => {
    const have = new Set(library.songs.map((s) => (s.title + '|' + (s.book || '')).toLowerCase()));
    const fresh = list.filter((s) => !have.has((s.title + '|' + (s.book || '')).toLowerCase())).map((s) => ({ id: uid(), ...s }));
    if (fresh.length) setLibrary((l) => ({ ...l, songs: [...fresh, ...l.songs] }));
    flash(`${from}: ${fresh.length} ${t('songs').toLowerCase()} +${list.length > fresh.length ? ` (${list.length - fresh.length} already here)` : ''}`);
  };

  const importEasyWorship = async () => {
    try {
      let pair = await api.findEasyWorship();
      if (!pair) {
        const files = await api.openFiles([{ name: 'EasyWorship', extensions: ['db', 'ewsx', 'zip'] }], true);
        if (!files.length) return;
        const { unzipSync } = await import('fflate');
        pair = pickEasyWorshipFiles(files, unzipSync);
        if (!pair) { flash(t('ewHelp')); return; }
      }
      const { sqlite } = await import('../lib/sqlite.js');
      const openDb = await sqlite();
      addSongs(easyWorshipSongs(openDb, pair.songs, pair.words), 'EasyWorship');
    } catch (e) { flash(`${t('importFailed')}: ${e.message}`); }
  };

  const importVideoPsalm = async () => {
    // VideoPsalm keeps song books in a known folder; if it isn't there, the church chooses the files
    let files = await api.findVideoPsalm();
    if (!files || !files.length) files = await api.openFiles([{ name: 'VideoPsalm', extensions: ['vpc', 'json'] }], true);
    if (!files || !files.length) return;
    const { unzipSync } = await import('fflate');
    const all = [];
    const notes = [];
    for (const f of files) {
      try { all.push(...parseVideoPsalmFile(f.name, f.data, unzipSync)); } catch (e) { notes.push(e instanceof LockedBookError ? e.message : `${f.name}: ${t('importFailed')}`); }
    }
    if (all.length) addSongs(all, 'VideoPsalm');
    if (notes.length) setTimeout(() => flash(notes.join(' · ')), all.length ? 3000 : 0);
  };

  const importBible = async () => {
    const files = await api.openFiles([{ name: 'Bible', extensions: ['xml', 'json', 'usfm', 'sfm', 'txt'] }]);
    if (!files.length) return;
    try {
      const b = importBibleFiles(files);
      if (/swahili|kiswahili|biblia|sw_|swh/i.test(b.name + files[0].name)) b.lang = 'sw';
      const id = await api.bible.save(b);
      setBibles((m) => ({ ...m, [id]: { ...b, id } }));
      setBibleList(await api.bible.list());
      flash(`${t('importedBible')}: ${b.name}`);
    } catch (e) { flash(`${t('importFailed')}: ${e.message}`); }
  };

  const main = bibles[settings.mainBible];
  const chapters = main?.books[pick.book]?.length || 0;
  const verses = main?.books[pick.book]?.[pick.chapter - 1]?.length || 0;
  const ref = { ...pick, bibleId: settings.mainBible };
  const refTitle = formatReference(ref, main?.lang === 'sw' ? 'sw' : 'en');

  return (
    <div className="lib">
      <div className="tabs" role="tablist">
        {['songs', 'bible', 'notices', 'media'].map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(k)}</button>
        ))}
      </div>

      {tab === 'songs' && (
        <div className="lib-body">
          <div className="row">
            <input className="grow" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('title') + ' / ' + t('number')} aria-label={t('songs')} />
            <button type="button" onClick={() => onEdit({ kind: 'song', value: null })}>+</button>
          </div>
          <div className="lib-list">
            {songs.map((s) => (
              <div className="lib-row" key={s.id}>
                <button type="button" className="lib-main" onClick={() => addItem({ type: 'song', refId: s.id, title: s.title })} title={t('addToService')}>
                  <span className="mono accent num">{s.number || ''}</span>
                  <span className="svc-text"><span>{s.title}</span><span className="muted small">{s.book}</span></span>
                </button>
                <button type="button" className="ghost sm" onClick={() => onEdit({ kind: 'song', value: s })}>{t('edit')}</button>
                <button type="button" className="ghost sm" aria-label={t('remove')} onClick={() => { if (confirm(`${t('remove')}: ${s.title}?`)) setLibrary((l) => ({ ...l, songs: l.songs.filter((x) => x.id !== s.id) })); }}>×</button>
              </div>
            ))}
          </div>
          <div className="import-box">
            <span className="muted small">{t('importFrom')}</span>
            <div className="row">
              <button type="button" className="sm" onClick={importEasyWorship} title={t('ewHelp')}>EasyWorship</button>
              <button type="button" className="sm" onClick={importVideoPsalm}>VideoPsalm</button>
              <button type="button" className="sm" onClick={importSongs} title=".txt, OpenLyrics .xml">OpenLP / .txt</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'bible' && (
        <div className="lib-body">
          <label className="field"><span>{t('bible')}</span>
            <select value={settings.mainBible} onChange={(e) => setSettings((s) => ({ ...s, mainBible: e.target.value }))}>
              {bibleList.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <div className="grid4">
            <label className="field span4"><span>Book</span>
              <select value={pick.book} onChange={(e) => setPick({ book: e.target.value, chapter: 1, from: 1, to: 1 })}>
                {BOOKS.map((b) => <option key={b.id} value={b.id}>{bookName(b.id, lang)}</option>)}
              </select>
            </label>
            <label className="field"><span>Ch.</span><input type="number" min="1" max={chapters || 150} value={pick.chapter} onChange={(e) => setPick({ ...pick, chapter: Math.max(1, +e.target.value || 1), from: 1, to: 1 })} /></label>
            <label className="field"><span>From</span><input type="number" min="1" max={verses || 176} value={pick.from} onChange={(e) => { const v = Math.max(1, +e.target.value || 1); setPick({ ...pick, from: v, to: Math.max(v, pick.to) }); }} /></label>
            <label className="field"><span>To</span><input type="number" min={pick.from} max={verses || 176} value={pick.to} onChange={(e) => setPick({ ...pick, to: Math.max(pick.from, +e.target.value || pick.from) })} /></label>
          </div>
          <div className="row">
            <button type="button" className="primary grow" onClick={() => addItem({ type: 'bible', ref, title: refTitle }, true)}>{t('showNow')}</button>
            <button type="button" className="grow" onClick={() => addItem({ type: 'bible', ref, title: refTitle })}>{t('addToService')}</button>
          </div>
          <p className="muted small">{refTitle}{main?.short ? ' · ' + main.short : ''}</p>
          <div className="lib-list">
            {bibleList.map((b) => (
              <div className="lib-row" key={b.id}>
                <span className="lib-main static"><span className="mono accent num">{(b.lang || '').toUpperCase()}</span><span>{b.name}</span></span>
                {!b.bundled && <button type="button" className="ghost sm" aria-label={t('remove')} onClick={async () => { await api.bible.remove(b.id); setBibleList(await api.bible.list()); }}>×</button>}
              </div>
            ))}
          </div>
          <button type="button" className="wide" onClick={importBible}>{t('importBible')} (Zefania XML, USFM, JSON)</button>
        </div>
      )}

      {tab === 'media' && (
        <MediaBrowser t={t} library={library} setLibrary={setLibrary} settings={settings} setSettings={setSettings} addItem={addItem} flash={flash} />
      )}

      {tab === 'notices' && (
        <div className="lib-body">
          <button type="button" onClick={() => onEdit({ kind: 'notice', value: null })}>+ {t('newNotice')}</button>
          <div className="lib-list">
            {library.notices.map((n) => (
              <div className="lib-row" key={n.id}>
                <button type="button" className="lib-main" onClick={() => addItem({ type: 'notice', refId: n.id, title: n.title })} title={t('addToService')}>
                  <span className="svc-text"><span>{n.title}</span><span className="muted small">{String(n.body).split('\n')[0]}</span></span>
                </button>
                <button type="button" className="ghost sm" onClick={() => onEdit({ kind: 'notice', value: n })}>{t('edit')}</button>
                <button type="button" className="ghost sm" aria-label={t('remove')} onClick={() => setLibrary((l) => ({ ...l, notices: l.notices.filter((x) => x.id !== n.id) }))}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
