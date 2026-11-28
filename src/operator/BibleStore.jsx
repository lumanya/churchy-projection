import React, { useEffect, useState } from 'react';
import { api } from '../bridge.js';
import { bibleFromCatalog } from '../lib/bibleImport.js';

const mb = (n) => (n / 1048576).toFixed(1);

// Library → Bible → Get more Bibles: free and openly licensed versions, downloaded once, then offline
export default function BibleStore({ t, settings, setSettings, bibleList, setBibleList, setBibles, flash }) {
  const [catalog, setCatalog] = useState([]);
  const [busy, setBusy] = useState({}); // id → { received, total } while downloading
  const [errors, setErrors] = useState({});
  const [open, setOpen] = useState(false);

  useEffect(() => { api.bibles.catalog().then(setCatalog); }, []);
  useEffect(() => api.bibles.onProgress((p) => setBusy((b) => (b[p.id] ? { ...b, [p.id]: p } : b))), []);

  const installed = new Set(bibleList.map((b) => b.id));

  const get = async (entry) => {
    setErrors((e) => ({ ...e, [entry.id]: null }));
    setBusy((b) => ({ ...b, [entry.id]: { received: 0, total: 0 } }));
    try {
      const r = await api.bibles.download(entry.id);
      if (r.error) throw new Error(t('bibleError_' + r.error));
      const { unzipSync } = await import('fflate');
      const bible = bibleFromCatalog(entry, r.data, unzipSync);
      const id = await api.bible.save(bible);
      setBibles((m) => ({ ...m, [id]: { ...bible, id } }));
      setBibleList(await api.bible.list());
      flash(`${t('importedBible')}: ${entry.name}`);
    } catch (e) {
      setErrors((x) => ({ ...x, [entry.id]: e.message || String(e) }));
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[entry.id]; return n; });
    }
  };

  if (!catalog.length) return null;
  return (
    <div className="bible-store">
      <button type="button" id="more-bibles" className="wide" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? '▾' : '▸'} {t('moreBibles')}
      </button>
      {open && (
        <>
          <p className="muted small" style={{ margin: 0 }}>{t('moreBiblesHelp')}</p>
          {catalog.map((c) => {
            const have = installed.has(c.id);
            const p = busy[c.id];
            return (
              <div className="store-row" key={c.id} data-bible={c.id}>
                <div className="store-main">
                  <div><span className="mono accent num">{c.lang.toUpperCase()}</span> <strong>{c.name}</strong> <span className="muted small">{c.short}</span></div>
                  <div className="muted small">{c.about}</div>
                  <div className="small"><span className="chip">{c.license}</span></div>
                  {errors[c.id] && <div className="small accent">{errors[c.id]}</div>}
                </div>
                <div className="store-actions">
                  {p ? (
                    <span className="small mono">{p.total ? Math.round((p.received / p.total) * 100) + '%' : mb(p.received) + ' MB'}</span>
                  ) : have ? (
                    <>
                      <span className="small accent">✓ {t('installed')}</span>
                      {settings.mainBible !== c.id && <button type="button" className="sm" onClick={() => setSettings((s) => ({ ...s, mainBible: c.id }))}>{t('useAsMain')}</button>}
                      {settings.mainBible !== c.id && settings.secondBible !== c.id && <button type="button" className="sm" onClick={() => setSettings((s) => ({ ...s, secondBible: c.id }))}>{t('useAsSecond')}</button>}
                    </>
                  ) : (
                    <button type="button" className="sm primary" onClick={() => get(c)}>{t('download')}</button>
                  )}
                </div>
              </div>
            );
          })}
          <p className="muted small" style={{ margin: 0 }}>{t('licensedBiblesNote')}</p>
        </>
      )}
    </div>
  );
}
