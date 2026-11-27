import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, inElectron } from '../bridge.js';
import { makeT } from '../lib/i18n.js';
import { defaultLibrary, defaultSettings, uid } from '../lib/defaults.js';
import { slidesFor } from '../lib/slides.js';
import { parseReference, formatReference, getVerses } from '../lib/bibleRef.js';
import Library from './Library.jsx';
import { SongEditor, NoticeEditor, ServiceEditor } from './Editors.jsx';
import { Mini, Logo } from './Mini.jsx';

export default function Operator() {
  const [ready, setReady] = useState(false);
  const [library, setLibrary] = useState(null);
  const [settings, setSettings] = useState(null);
  const [bibleList, setBibleList] = useState([]);
  const [bibles, setBibles] = useState({});
  const [selected, setSelected] = useState(0);       // index in the order of service
  const [live, setLive] = useState(null);            // { itemId, index } or { custom: slide }
  const [black, setBlack] = useState(false);
  const [message, setMessage] = useState('');
  const [messageOn, setMessageOn] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);
  const [displays, setDisplays] = useState([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);      // { kind: 'song'|'notice', value }
  const [toast, setToast] = useState('');
  const searchRef = useRef(null);
  const t = makeT(settings?.lang);

  // ---------- load everything once ----------
  useEffect(() => {
    (async () => {
      const saved = await api.store.load();
      const lib = saved.library || defaultLibrary();
      if (!lib.currentServiceId) lib.currentServiceId = lib.services[0]?.id;
      const set = { ...defaultSettings(), ...(saved.settings || {}) };
      setLibrary(lib);
      setSettings(set);
      setBibleList(await api.bible.list());
      setDisplays(await api.displays.list());
      if (saved.session && saved.session.live) setLive(saved.session.live); // back where we were after a crash or power cut
      setReady(true);
    })();
    const off1 = api.output.onState(setOutputOpen);
    const off2 = api.displays.onChanged(async () => setDisplays(await api.displays.list()));
    return () => { off1(); off2(); };
  }, []);

  // ---------- load the Bibles we need ----------
  useEffect(() => {
    if (!settings) return;
    for (const id of [settings.mainBible, settings.secondBible]) {
      if (!id || bibles[id]) continue;
      api.bible.load(id).then((txt) => {
        if (!txt) return;
        try { const b = JSON.parse(txt); setBibles((m) => ({ ...m, [id]: b })); } catch (_) { /* bad file */ }
      });
    }
  }, [settings?.mainBible, settings?.secondBible]);

  // ---------- autosave, a moment after each change ----------
  const firstSave = useRef(true);
  useEffect(() => {
    if (!ready) return;
    if (firstSave.current) { firstSave.current = false; return; }
    const h = setTimeout(() => {
      api.store.save('library.json', library);
      api.store.save('settings.json', settings);
    }, 400);
    return () => clearTimeout(h);
  }, [library, settings, ready]);
  useEffect(() => { if (ready) api.store.save('session.json', { live }); }, [live, ready]);

  const service = library?.services.find((s) => s.id === library.currentServiceId) || library?.services[0];
  const items = service?.items || [];
  const ctx = useMemo(() => ({ songs: library?.songs || [], notices: library?.notices || [], bibles, settings: settings || {} }), [library, bibles, settings]);
  const slidesOf = useCallback((item) => slidesFor(item, ctx), [ctx]);
  const item = items[selected];
  const slides = useMemo(() => slidesOf(item), [item, slidesOf]);

  const liveSlide = useMemo(() => {
    if (!live) return null;
    if (live.custom) return live.custom;
    const it = items.find((i) => i.id === live.itemId);
    return it ? slidesOf(it)[live.index] || null : null;
  }, [live, items, slidesOf]);

  const nextSlide = useMemo(() => {
    if (!live || live.custom) return slides[0] || null;
    const idx = items.findIndex((i) => i.id === live.itemId);
    const cur = idx >= 0 ? slidesOf(items[idx]) : [];
    if (cur[live.index + 1]) return cur[live.index + 1];
    return items[idx + 1] ? slidesOf(items[idx + 1])[0] || null : null;
  }, [live, items, slides, slidesOf]);

  // ---------- send to the projector whenever something visible changes ----------
  useEffect(() => {
    if (!settings) return;
    api.live.set({ slide: liveSlide, black, message: messageOn ? message : '', theme: settings.theme });
  }, [liveSlide, black, message, messageOn, settings?.theme]);

  // ---------- actions ----------
  const updateService = (fn) => setLibrary((lib) => ({
    ...lib, services: lib.services.map((s) => (s.id === service.id ? { ...s, items: fn(s.items) } : s))
  }));
  const goLive = (itemIndex, slideIndex) => {
    const it = items[itemIndex];
    if (!it) return;
    setSelected(itemIndex);
    setLive({ itemId: it.id, index: slideIndex });
    setBlack(false);
  };
  const step = (dir) => {
    if (!live || live.custom) { if (slides.length) goLive(selected, 0); return; }
    const idx = items.findIndex((i) => i.id === live.itemId);
    const cur = slidesOf(items[idx]);
    const n = live.index + dir;
    if (n >= 0 && n < cur.length) return goLive(idx, n);
    if (dir > 0 && items[idx + 1]) return goLive(idx + 1, 0);
    if (dir < 0 && items[idx - 1]) { const prev = slidesOf(items[idx - 1]); return goLive(idx - 1, Math.max(prev.length - 1, 0)); }
  };
  const addItem = (newItem, showNow) => {
    const it = { id: uid(), ...newItem };
    const pos = items.length;
    updateService((list) => [...list, it]);
    setSelected(pos);
    if (showNow) setTimeout(() => { setLive({ itemId: it.id, index: 0 }); setBlack(false); }, 0);
    setQuery('');
  };
  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  // ---------- keyboard: works with presentation clickers too (they send Page Up / Page Down) ----------
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus(); return; }
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || editing) return;
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); step(1); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); step(-1); }
      else if (e.key.toLowerCase() === 'b' || e.key === '.') setBlack((b) => !b);
      else if (e.key.toLowerCase() === 'c') setLive(null);
      else if (/^[1-9]$/.test(e.key) && slides[+e.key - 1]) goLive(selected, +e.key - 1);
      else if (e.key === 'Escape') setMessageOn(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------- search: a verse reference, or songs by title, number or words ----------
  const results = useMemo(() => {
    const q = query.trim();
    if (!q || !library) return null;
    const ref = parseReference(q);
    const main = bibles[settings.mainBible];
    let verse = null;
    if (ref && main) {
      const vs = getVerses(main, ref);
      if (vs.length) verse = { ref: { ...ref, bibleId: settings.mainBible }, preview: vs.slice(0, 2).map((v) => v.text).join(' '), title: formatReference(ref, main.lang === 'sw' ? 'sw' : 'en') };
    }
    const lq = q.toLowerCase();
    const songs = library.songs.filter((s) =>
      s.title.toLowerCase().includes(lq) || (s.number && String(s.number) === q.replace(/\D/g, '') && /\d/.test(q)) || s.lyrics.toLowerCase().includes(lq)
    ).slice(0, 8);
    return { verse, songs };
  }, [query, library, bibles, settings]);

  if (!ready) return <div className="boot"><Logo size={40} /></div>;

  const toggleOutput = async () => { if (outputOpen && inElectron) await api.output.close(); else { await api.output.open(); setOutputOpen(true); } };
  const setSetting = (patch) => setSettings((s) => ({ ...s, ...patch }));

  return (
    <div className="op">
      <header className="op-top">
        <div className="brand"><Logo size={28} /><span>Mwanga</span></div>
        <div className="svc">
          <select aria-label={t('service')} value={service?.id} onChange={(e) => { setLibrary((l) => ({ ...l, currentServiceId: e.target.value })); setSelected(0); }}>
            {library.services.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.date}</option>)}
          </select>
          <button type="button" className="link" onClick={() => setEditing({ kind: 'service', value: { name: t('newService'), date: new Date().toISOString().slice(0, 10) } })}>+ {t('newService')}</button>
        </div>
        <div className="search">
          <label className="search-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
            <span className="sr">{t('search')}</span>
            <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('search')}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur(); }
                if (e.key === 'Enter' && results?.verse) addItem({ type: 'bible', ref: results.verse.ref, title: results.verse.title }, true);
                else if (e.key === 'Enter' && results?.songs[0]) { const s = results.songs[0]; addItem({ type: 'song', refId: s.id, title: s.title }, true); }
              }} />
            <kbd>CTRL K</kbd>
          </label>
          {results && (
            <div className="results" role="listbox">
              {results.verse && (
                <div className="result">
                  <div><strong>{results.verse.title}</strong><span className="muted"> · {results.verse.preview.slice(0, 110)}…</span></div>
                  <div className="result-actions">
                    <button type="button" className="primary sm" onClick={() => addItem({ type: 'bible', ref: results.verse.ref, title: results.verse.title }, true)}>{t('showNow')}</button>
                    <button type="button" className="sm" onClick={() => addItem({ type: 'bible', ref: results.verse.ref, title: results.verse.title })}>{t('addToService')}</button>
                  </div>
                </div>
              )}
              {results.songs.map((s) => (
                <div className="result" key={s.id}>
                  <div><span className="mono accent">{s.number || ''}</span> <strong>{s.title}</strong> <span className="muted">{s.book}</span></div>
                  <div className="result-actions">
                    <button type="button" className="primary sm" onClick={() => addItem({ type: 'song', refId: s.id, title: s.title }, true)}>{t('showNow')}</button>
                    <button type="button" className="sm" onClick={() => addItem({ type: 'song', refId: s.id, title: s.title })}>{t('addToService')}</button>
                  </div>
                </div>
              ))}
              {!results.verse && !results.songs.length && <div className="result muted">{t('notFound')}</div>}
            </div>
          )}
        </div>
        <div className="top-actions">
          <button type="button" className="mono-btn" aria-label="Language" onClick={() => setSetting({ lang: settings.lang === 'en' ? 'sw' : 'en' })}>
            {settings.lang === 'en' ? <>EN <span className="muted">/ SW</span></> : <>SW <span className="muted">/ EN</span></>}
          </button>
          <button type="button" className={black ? 'warn' : ''} onClick={() => setBlack((b) => !b)}>{black ? t('restore') : t('black')}</button>
          <button type="button" onClick={() => setLive(null)}>{t('clear')}</button>
        </div>
      </header>

      <main className="op-main">
        <section className="col-left" aria-label={t('service')}>
          <div className="col-head"><h2>{t('service')}</h2><span className="mono muted">{items.length} {t('minutes')}</span></div>
          <div className="svc-list">
            {!items.length && <p className="muted pad">{t('emptyService')}</p>}
            {items.map((it, i) => (
              <div key={it.id} className={'svc-item' + (i === selected ? ' on' : '') + (live && live.itemId === it.id ? ' is-live' : '')}>
                <button type="button" className="svc-main" onClick={() => setSelected(i)}>
                  <span className="mono muted">{String(i + 1).padStart(2, '0')}</span>
                  <span className="svc-text"><span>{it.title}</span><span className="muted small">{t(it.type === 'bible' ? 'bible' : it.type === 'song' ? 'songs' : it.type === 'notice' ? 'notices' : 'text')}</span></span>
                </button>
                <span className="svc-tools">
                  <button type="button" aria-label={t('moveUp')} onClick={() => i > 0 && updateService((l) => { const c = [...l]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; return c; })}>↑</button>
                  <button type="button" aria-label={t('moveDown')} onClick={() => i < items.length - 1 && updateService((l) => { const c = [...l]; [c[i + 1], c[i]] = [c[i], c[i + 1]]; return c; })}>↓</button>
                  <button type="button" aria-label={t('remove')} onClick={() => { updateService((l) => l.filter((x) => x.id !== it.id)); if (selected >= items.length - 1) setSelected(Math.max(0, items.length - 2)); }}>×</button>
                </span>
              </div>
            ))}
          </div>
          <Library
            t={t} library={library} setLibrary={setLibrary} settings={settings} setSettings={setSettings}
            bibleList={bibleList} setBibleList={setBibleList} bibles={bibles} setBibles={setBibles}
            addItem={addItem} onEdit={setEditing} flash={flash}
          />
        </section>

        <section className="col-mid" aria-label="Slides">
          <div className="mid-head">
            <h2>{item ? item.title : '—'}</h2>
            <span className="muted small">{item ? t('clickToSend') : t('emptySlides')}</span>
          </div>
          <div className="slides">
            {slides.map((s, i) => {
              const isLive = live && item && live.itemId === item.id && live.index === i;
              return (
                <button type="button" key={i} className={'slide' + (isLive ? ' on' : '')} onClick={() => goLive(selected, i)}>
                  <Mini slide={s} theme={settings.theme} />
                  <span className="slide-foot"><span>{s.label}</span><span className="mono">{i < 9 ? i + 1 : ''}</span></span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="col-right" aria-label={t('live')}>
          <div>
            <div className="mon-head"><strong>{t('live')}</strong>{liveSlide && !black && <span className="onair">{t('onAir')}</span>}</div>
            <Mini slide={black ? null : liveSlide} theme={settings.theme} live message={messageOn ? message : ''} />
          </div>
          <div>
            <div className="mon-head"><strong className="muted">{t('next')}</strong></div>
            <Mini slide={nextSlide} theme={settings.theme} />
          </div>
          <div className="panel">
            <label className="field"><span>{t('message')}</span>
              <input value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') setMessageOn(true); if (e.key === 'Escape') setMessageOn(false); }} />
            </label>
            <div className="row">
              <button type="button" className={messageOn ? 'warn' : 'primary'} onClick={() => setMessageOn((m) => !m)} disabled={!message}>{messageOn ? t('hide') : t('show')}</button>
              <span className="muted small">{t('messageHelp')}</span>
            </div>
          </div>
          <div className="panel">
            <div className="row between">
              <strong>{outputOpen ? t('projectorOn') : t('projectorOff')}</strong>
              <button type="button" className={outputOpen ? '' : 'primary'} onClick={toggleOutput}>{outputOpen ? '■' : '▶'} {t('display')}</button>
            </div>
            <label className="field"><span>{t('display')}</span>
              <select value={settings.displayId ?? ''} onChange={(e) => { setSetting({ displayId: e.target.value ? Number(e.target.value) : null }); setTimeout(() => api.output.move(), 500); }}>
                <option value="">Auto</option>
                {displays.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </label>
            <label className="field"><span>{t('secondBible')}</span>
              <select value={settings.secondBible} onChange={(e) => setSetting({ secondBible: e.target.value })}>
                <option value="">{t('none')}</option>
                {bibleList.filter((b) => b.id !== settings.mainBible).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <div className="row">
              <label className="swatch"><input type="color" value={settings.theme.bg} onChange={(e) => setSetting({ theme: { ...settings.theme, bg: e.target.value } })} /> {t('background')}</label>
              <label className="swatch"><input type="color" value={settings.theme.fg} onChange={(e) => setSetting({ theme: { ...settings.theme, fg: e.target.value } })} /> {t('textColour')}</label>
            </div>
          </div>
        </section>
      </main>

      <footer className="op-foot mono">
        <span>{t('shortcuts')}</span>
        <span>{toast || (inElectron ? '' : 'BROWSER PREVIEW')}</span>
      </footer>

      {editing?.kind === 'song' && (
        <SongEditor t={t} value={editing.value} onCancel={() => setEditing(null)} onSave={(song) => {
          setLibrary((l) => ({ ...l, songs: l.songs.some((s) => s.id === song.id) ? l.songs.map((s) => (s.id === song.id ? song : s)) : [song, ...l.songs] }));
          setEditing(null); flash(t('saved'));
        }} />
      )}
      {editing?.kind === 'service' && (
        <ServiceEditor t={t} value={editing.value} onCancel={() => setEditing(null)} onSave={({ name, date }) => {
          const s = { id: uid(), name, date, items: [] };
          setLibrary((l) => ({ ...l, services: [s, ...l.services], currentServiceId: s.id }));
          setSelected(0); setLive(null); setEditing(null);
        }} />
      )}
      {editing?.kind === 'notice' && (
        <NoticeEditor t={t} value={editing.value} onCancel={() => setEditing(null)} onSave={(n) => {
          setLibrary((l) => ({ ...l, notices: l.notices.some((x) => x.id === n.id) ? l.notices.map((x) => (x.id === n.id ? n : x)) : [n, ...l.notices] }));
          setEditing(null); flash(t('saved'));
        }} />
      )}
    </div>
  );
}
