import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, inElectron } from '../bridge.js';
import { makeT } from '../lib/i18n.js';
import { defaultLibrary, defaultSettings, uid } from '../lib/defaults.js';
import { slidesFor } from '../lib/slides.js';
import { parseReference, formatReference, getVerses } from '../lib/bibleRef.js';
import Library from './Library.jsx';
import { SongEditor, NoticeEditor, ServiceEditor } from './Editors.jsx';
import { Mini, Logo } from './Mini.jsx';
import { formatTimer } from '../stage/timer.js';
import { findSpokenReferences, validReferences } from '../lib/spokenRefs.js';
import { useMicrophone, listMicrophones } from './useMicrophone.js';

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
  const [rightTab, setRightTab] = useState('projector');
  const [stageOpen, setStageOpen] = useState(false);
  const [stageDraft, setStageDraft] = useState('');
  const [stageMessage, setStageMessage] = useState('');
  const [timer, setTimer] = useState({ running: false, startedAt: 0, base: 0, minutes: 0 });
  const [, tick] = useState(0);
  const [remote, setRemote] = useState({ on: false, urls: [] });
  const [qr, setQr] = useState('');
  const [update, setUpdate] = useState({ state: 'idle' });
  const [version, setVersion] = useState('');
  const [listenOn, setListenOn] = useState(false);
  const [listenStatus, setListenStatus] = useState({ state: 'off' });
  const [heard, setHeard] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [mics, setMics] = useState([]);
  const listenRef = useRef(null);
  const searchRef = useRef(null);
  const commandRef = useRef(null);
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
      setOutputOpen(await api.output.isOpen());
      setStageOpen(await api.stage.isOpen());
      setRemote(await api.remote.info());
      setUpdate(await api.update.status());
      setVersion(await api.version());
      if (saved.session && saved.session.live) setLive(saved.session.live); // back where we were after a crash or power cut
      setReady(true);
    })();
    const off1 = api.output.onState(setOutputOpen);
    const off2 = api.displays.onChanged(async () => setDisplays(await api.displays.list()));
    const off3 = api.stage.onState(setStageOpen);
    const off4 = api.remote.onInfo(setRemote);
    const off5 = api.update.onStatus(setUpdate);
    const off6 = api.remote.onCommand((c) => commandRef.current && commandRef.current(c));
    const off7 = api.listen.onEvent((m) => listenRef.current && listenRef.current(m));
    return () => { off1(); off2(); off3(); off4(); off5(); off6(); off7(); };
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

  const liveItemIndex = live && !live.custom ? items.findIndex((i) => i.id === live.itemId) : -1;
  const liveSlides = useMemo(() => (liveItemIndex >= 0 ? slidesOf(items[liveItemIndex]) : []), [liveItemIndex, items, slidesOf]);

  // ---------- send to the projector, the preacher's screen and phones whenever something changes ----------
  useEffect(() => {
    if (!settings) return;
    api.live.set({
      slide: liveSlide, next: nextSlide, black, message: messageOn ? message : '', theme: settings.theme,
      stageMessage, timer, now: Date.now(),
      service: { name: service?.name, items: items.map((i) => ({ title: i.title, type: i.type })) },
      liveItem: liveItemIndex, liveIndex: live && !live.custom ? live.index : -1,
      slides: liveSlides.map((x) => ({ label: x.label, text: x.text.length > 140 ? x.text.slice(0, 140) + '…' : x.text }))
    });
  }, [liveSlide, nextSlide, black, message, messageOn, settings?.theme, stageMessage, timer, items, liveItemIndex, liveSlides, live]);

  // ---------- QR code for the phone remote ----------
  useEffect(() => {
    if (remote.on && remote.urls[0]) api.remote.qr(remote.urls[0]).then(setQr);
    else setQr('');
  }, [remote.on, remote.urls[0]]);

  // ---------- verse finder: microphone → speech engine → references ----------
  const { level: micLevel, error: micError } = useMicrophone({
    enabled: listenOn && listenStatus.state === 'ready',
    deviceId: settings?.micId,
    onAudio: (samples) => api.listen.audio(samples, settings.listenLang || 'auto')
  });
  listenRef.current = (m) => {
    if (m.type === 'progress') {
      if (m.status === 'progress' && m.total > 1e6) setListenStatus({ state: 'downloading', percent: Math.round(m.progress || 0), file: m.file });
      else if (m.status === 'initiate' || m.status === 'download') setListenStatus((st) => (st.state === 'downloading' ? st : { state: 'loading' }));
    } else if (m.type === 'ready') setListenStatus({ state: 'ready' });
    else if (m.type === 'error') {
      const offline = m.during === 'init' && /fetch|network|ENOTFOUND|EAI_AGAIN|ECONN|getaddrinfo|timed? ?out/i.test(m.message || '');
      setListenStatus({ state: 'error', message: offline ? t('needInternet') : m.message });
      if (m.during === 'init') setListenOn(false);
    }
    else if (m.type === 'stopped') setListenStatus((st) => (st.state === 'error' ? st : { state: 'off' }));
    else if (m.type === 'text' && m.text) {
      setHeard(m.text);
      const main = bibles[settings.mainBible];
      const refs = validReferences(findSpokenReferences(m.text), main);
      if (!refs.length) return;
      const now = Date.now();
      setSuggestions((list) => {
        let next = list.filter((x) => now - x.at < 10 * 60000);
        for (const r of refs) {
          const key = `${r.book} ${r.chapter}:${r.from || ''}-${r.to || ''}`;
          if (next.some((x) => x.key === key && now - x.at < 90000)) continue; // said again within 90 s: same suggestion
          next = [{ key, at: now, ref: { book: r.book, chapter: r.chapter, from: r.from, to: r.to }, title: formatReference(r, main && main.lang === 'sw' ? 'sw' : 'en') }, ...next.filter((x) => x.key !== key)];
        }
        return next.slice(0, 6);
      });
    }
  };
  useEffect(() => { if (rightTab === 'listen') listMicrophones().then(setMics); }, [rightTab, listenStatus.state]);

  // the timer on this screen ticks while it runs
  useEffect(() => {
    if (!timer.running) return undefined;
    const h = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(h);
  }, [timer.running]);

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
  const sameItem = (a, b) => a.type === b.type && (a.refId ? a.refId === b.refId : JSON.stringify(a.ref) === JSON.stringify(b.ref));
  const addItem = (newItem, showNow) => {
    const existing = showNow ? items.findIndex((x) => sameItem(x, newItem)) : -1;
    if (existing >= 0) { goLive(existing, 0); setQuery(''); return; }
    const it = { id: uid(), ...newItem };
    const pos = items.length;
    updateService((list) => [...list, it]);
    setSelected(pos);
    if (showNow) setTimeout(() => { setLive({ itemId: it.id, index: 0 }); setBlack(false); }, 0);
    setQuery('');
  };
  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const timerAction = (action, minutes) => setTimer((tm) => {
    const now = Date.now();
    if (action === 'start') return tm.running ? tm : { ...tm, running: true, startedAt: now };
    if (action === 'pause') return tm.running ? { ...tm, running: false, base: tm.base + (now - tm.startedAt), startedAt: 0 } : tm;
    if (action === 'reset') return { running: false, startedAt: 0, base: 0, minutes: tm.minutes };
    if (action === 'minutes') return { ...tm, minutes: Math.max(0, Math.min(600, minutes || 0)) };
    return tm;
  });

  const showVerseText = (text) => {
    const ref = parseReference(text);
    const main = bibles[settings.mainBible];
    if (ref && main && getVerses(main, ref).length) {
      addItem({ type: 'bible', ref: { ...ref, bibleId: settings.mainBible }, title: formatReference(ref, main.lang === 'sw' ? 'sw' : 'en') }, true);
      return true;
    }
    flash(t('notFound'));
    return false;
  };

  // commands from phones (always the latest version of the handlers)
  commandRef.current = (c) => {
    if (c.type === 'next') step(1);
    else if (c.type === 'prev') step(-1);
    else if (c.type === 'black') setBlack((b) => !b);
    else if (c.type === 'clear') setLive(null);
    else if (c.type === 'goto' && Number.isInteger(c.item) && Number.isInteger(c.slide)) goLive(c.item, c.slide);
    else if (c.type === 'verse' && typeof c.text === 'string') showVerseText(c.text.slice(0, 60));
    else if (c.type === 'stageMessage' && typeof c.text === 'string') { setStageMessage(c.text.slice(0, 200)); setStageDraft(c.text.slice(0, 200)); }
    else if (c.type === 'timer' && ['start', 'pause', 'reset'].includes(c.action)) timerAction(c.action);
  };

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
      else if (e.key.toLowerCase() === 'v' && suggestions[0]) showSuggestion(suggestions[0]);
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

  const timerView = formatTimer(timer);
  const showSuggestion = (sg) => sg && addItem({ type: 'bible', ref: { ...sg.ref, bibleId: settings.mainBible }, title: sg.title }, true);
  const toggleListen = async () => {
    if (listenOn) { setListenOn(false); setListenStatus({ state: 'off' }); await api.listen.stop(); return; }
    setListenOn(true);
    setListenStatus({ state: 'loading' });
    const ok = await api.listen.start(settings.listenQuality || 'fast');
    if (!ok) setListenStatus({ state: 'error', message: t('listenDesktopOnly') });
  };
  const toggleStage = async () => {
    if (stageOpen) { await api.stage.close(); setSetting({ stageOpen: false }); }
    else { await api.stage.open(); setStageOpen(true); setSetting({ stageOpen: true }); }
  };
  const toggleRemote = async () => {
    const info = remote.on ? await api.remote.stop() : await api.remote.start();
    setRemote(info);
    setSetting({ remoteOn: info.on, remotePin: info.pin || settings.remotePin });
  };
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
          <button type="button" className={outputOpen ? '' : 'primary'} onClick={toggleOutput} title={outputOpen ? t('projectorOn') : t('projectorOff')}>{outputOpen ? '■ ' + t('projector') : '▶ ' + t('projector')}</button>
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

          {listenOn && (
            <div className="finder">
              <div className="row between">
                <strong>{t('verseFinder')}</strong>
                <span className="small muted">
                  {listenStatus.state === 'ready' && <><span className="mic-dot" style={{ opacity: 0.35 + micLevel * 0.65 }} /> {t('listening')}</>}
                  {listenStatus.state === 'loading' && t('loadingModel')}
                  {listenStatus.state === 'downloading' && `${t('downloadingModel')} ${listenStatus.percent || 0}%`}
                  {listenStatus.state === 'error' && <span className="accent">{t('listenError')}</span>}
                </span>
              </div>
              {heard && <div className="heard">{t('heard')}: “…{heard.slice(-120)}”</div>}
              {suggestions[0] ? (
                <button type="button" id="suggest-show" className="primary big" onClick={() => showSuggestion(suggestions[0])}>{t('show')} {suggestions[0].title} <kbd className="on-accent">V</kbd></button>
              ) : <div className="muted small">{t('noVerseYet')}</div>}
              {suggestions.length > 1 && (
                <div className="row">
                  {suggestions.slice(1, 5).map((sg) => <button key={sg.key} type="button" className="sm" onClick={() => showSuggestion(sg)}>{sg.title}</button>)}
                </div>
              )}
            </div>
          )}

          <div className="tabs right-tabs" role="tablist">
            {[['projector', t('projector')], ['stage', t('preacher')], ['phone', t('phone')], ['listen', t('listen')]].map(([k, label]) => (
              <button key={k} type="button" role="tab" data-tab={k} aria-selected={rightTab === k} className={rightTab === k ? 'on' : ''} onClick={() => setRightTab(k)}>{label}</button>
            ))}
          </div>

          {rightTab === 'projector' && (
            <div className="panel">
              <div className="row between">
                <strong>{outputOpen ? t('projectorOn') : t('projectorOff')}</strong>
                <button type="button" className={outputOpen ? '' : 'primary'} onClick={toggleOutput}>{outputOpen ? '■' : '▶'} {t('display')}</button>
              </div>
              {displays.length < 2 && <p className="muted small" style={{ margin: 0 }}>{t('noSecond')}</p>}
              <label className="field"><span>{t('display')}</span>
                <select value={settings.displayId ?? ''} onChange={(e) => { setSetting({ displayId: e.target.value ? Number(e.target.value) : null }); setTimeout(() => api.output.move(), 500); }}>
                  <option value="">Auto</option>
                  {displays.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </label>
              <label className="field"><span>{t('message')}</span>
                <input value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') setMessageOn(true); if (e.key === 'Escape') setMessageOn(false); }} />
              </label>
              <div className="row">
                <button type="button" className={messageOn ? 'warn' : 'primary'} onClick={() => setMessageOn((m) => !m)} disabled={!message}>{messageOn ? t('hide') : t('show')}</button>
                <span className="muted small">{t('messageHelp')}</span>
              </div>
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
          )}

          {rightTab === 'stage' && (
            <div className="panel">
              <p className="muted small" style={{ margin: 0 }}>{t('stageHelp')}</p>
              <label className="field"><span>{t('messageToPreacher')}</span>
                <input id="stage-msg" value={stageDraft} placeholder={t('stagePlaceholder')} onChange={(e) => setStageDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setStageMessage(stageDraft); if (e.key === 'Escape') setStageMessage(''); }} />
              </label>
              <div className="row">
                <button type="button" id="stage-msg-show" className="primary" disabled={!stageDraft} onClick={() => setStageMessage(stageDraft)}>{t('show')}</button>
                <button type="button" disabled={!stageMessage} onClick={() => setStageMessage('')}>{t('hide')}</button>
                {stageMessage && <span className="accent small">{t('showing')}</span>}
              </div>
              <div className="timer-box">
                <span className={'timer-big mono' + (timerView.over ? ' over' : timerView.warn ? ' warn' : '')}>{timerView.text}</span>
                <div className="row">
                  {timer.running
                    ? <button type="button" onClick={() => timerAction('pause')}>{t('pause')}</button>
                    : <button type="button" id="timer-start" className="primary" onClick={() => timerAction('start')}>{t('start')}</button>}
                  <button type="button" onClick={() => timerAction('reset')}>{t('reset')}</button>
                  <label className="swatch">{t('countdown')}
                    <input type="number" min="0" max="600" style={{ width: 70 }} value={timer.minutes || ''} placeholder="—" onChange={(e) => timerAction('minutes', +e.target.value)} /> min
                  </label>
                </div>
              </div>
              <div className="row between">
                <strong>{stageOpen ? t('stageOn') : t('stageOff')}</strong>
                <button type="button" className={stageOpen ? '' : 'primary'} onClick={toggleStage}>{stageOpen ? '■' : '▶'} {t('display')}</button>
              </div>
              <label className="field"><span>{t('display')}</span>
                <select value={settings.stageDisplayId ?? ''} onChange={(e) => { setSetting({ stageDisplayId: e.target.value ? Number(e.target.value) : null }); setTimeout(() => api.stage.move(), 500); }}>
                  <option value="">{t('previewWindow')}</option>
                  {displays.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </label>
              <p className="muted small" style={{ margin: 0 }}>{t('stageTablet')}</p>
            </div>
          )}

          {rightTab === 'listen' && (
            <div className="panel">
              <div className="row between">
                <strong>{listenOn ? t('listenOn') : t('listenOff')}</strong>
                <button type="button" id="listen-toggle" className={listenOn ? '' : 'primary'} onClick={toggleListen}>{listenOn ? t('turnOff') : t('turnOn')}</button>
              </div>
              <p className="muted small" style={{ margin: 0 }}>{t('listenHelp')}</p>
              <label className="field"><span>{t('preacherLanguage')}</span>
                <select value={settings.listenLang || 'auto'} onChange={(e) => setSetting({ listenLang: e.target.value })}>
                  <option value="sw">Kiswahili</option>
                  <option value="en">English</option>
                  <option value="auto">{t('autoDetect')}</option>
                </select>
              </label>
              <label className="field"><span>{t('microphone')}</span>
                <select value={settings.micId || ''} onChange={(e) => setSetting({ micId: e.target.value })}>
                  <option value="">{t('defaultMic')}</option>
                  {mics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </label>
              {listenOn && listenStatus.state === 'ready' && <div className="meter" aria-label={t('microphone')}><span style={{ width: `${Math.round(micLevel * 100)}%` }} /></div>}
              {micError && <p className="accent small" style={{ margin: 0 }}>{micError}</p>}
              <label className="field"><span>{t('accuracy')}</span>
                <select value={settings.listenQuality || 'fast'} disabled={listenOn} onChange={(e) => setSetting({ listenQuality: e.target.value })}>
                  <option value="fast">{t('qualityFast')}</option>
                  <option value="better">{t('qualityBetter')}</option>
                </select>
              </label>
              {(settings.listenLang || 'auto') !== 'en' && (settings.listenQuality || 'fast') === 'fast' && <p className="accent small" style={{ margin: 0 }}>{t('swahiliTip')}</p>}
              {listenStatus.state === 'downloading' && <div className="meter"><span style={{ width: `${listenStatus.percent || 0}%` }} /></div>}
              {listenStatus.state === 'error' && <p className="accent small" style={{ margin: 0 }}>{listenStatus.message}</p>}
              <p className="muted small" style={{ margin: 0 }}>{t('listenPrivacy')}</p>
            </div>
          )}

          {rightTab === 'phone' && (
            <div className="panel">
              <div className="row between">
                <strong>{remote.on ? t('remoteOn') : t('remoteOff')}</strong>
                <button type="button" id="remote-toggle" className={remote.on ? '' : 'primary'} onClick={toggleRemote}>{remote.on ? t('turnOff') : t('turnOn')}</button>
              </div>
              {!remote.on && <p className="muted small" style={{ margin: 0 }}>{t('remoteHelp')}</p>}
              {remote.on && (
                <>
                  {qr ? <img className="qr" src={qr} alt={t('scanMe')} /> : null}
                  <p className="small" style={{ margin: 0 }}>{t('scanMe')}</p>
                  <div className="field"><span>{t('orOpen')}</span>
                    {remote.urls.length ? remote.urls.map((u) => <code key={u} className="url">{u}</code>) : <span className="muted small">{t('noNetwork')}</span>}
                  </div>
                  <div className="row between">
                    <span>PIN <strong className="mono pin">{remote.pin}</strong></span>
                    <span className="muted small">{remote.clients || 0} {t('phonesConnected')}</span>
                  </div>
                  <p className="muted small" style={{ margin: 0 }}>{t('firewallHelp')}</p>
                </>
              )}
            </div>
          )}
        </section>
      </main>

      <footer className="op-foot mono">
        <span>{t('shortcuts')}</span>
        <span className="foot-right">
          {toast && <span className="toast">{toast}</span>}
          {update.state === 'available' && <button type="button" className="sm primary" onClick={() => api.update.download()}>{t('updateAvailable')} {update.version}{update.size ? ` · ${Math.round(update.size / 1e6)} MB` : ''} — {t('download')}</button>}
          {update.state === 'downloading' && <span>{t('downloading')} {update.percent || 0}%</span>}
          {update.state === 'ready' && <button type="button" className="sm primary" onClick={() => api.update.install()}>{t('updateReady')} {update.version} — {t('restartNow')}</button>}
          <span>{inElectron ? 'MWANGA ' + version : 'BROWSER PREVIEW'}</span>
        </span>
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
