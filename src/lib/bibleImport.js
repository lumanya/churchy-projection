import { BOOKS, BOOK_BY_ID } from './books.js';

// Mwanga keeps every Bible as:
// { id, name, lang, books: { GEN: [ [verse1, verse2, …], …chapters ], … } }

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'bible';

function finish(name, lang, books) {
  const count = Object.keys(books).length;
  if (!count) throw new Error('No books found in this file.');
  // fill holes left by missing verse numbers so indexes stay correct
  for (const id of Object.keys(books)) {
    books[id] = books[id].map((ch) => Array.from({ length: (ch || []).length }, (_, i) => (ch[i] ?? '').trim()));
  }
  return { id: slug(name), name, lang, books };
}

function put(books, bookId, chapter, verse, text) {
  if (!books[bookId]) books[bookId] = [];
  const chs = books[bookId];
  if (!chs[chapter - 1]) chs[chapter - 1] = [];
  chs[chapter - 1][verse - 1] = (chs[chapter - 1][verse - 1] ? chs[chapter - 1][verse - 1] + ' ' : '') + text;
}

// Zefania XML, a common free format: <XMLBIBLE><BIBLEBOOK bnumber="1"><CHAPTER cnumber="1"><VERS vnumber="1">…
export function parseZefania(xml, fallbackName = 'Imported Bible') {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('This XML file could not be read.');
  const root = doc.documentElement;
  const name = root.getAttribute('biblename') || fallbackName;
  const langEl = doc.getElementsByTagName('language')[0];
  const lang = (langEl && langEl.textContent.trim().slice(0, 2).toLowerCase()) || 'xx';
  const books = {};
  for (const b of Array.from(doc.getElementsByTagName('BIBLEBOOK'))) {
    const n = parseInt(b.getAttribute('bnumber'), 10);
    const book = BOOKS[n - 1];
    if (!book) continue; // apocrypha and other extras are skipped
    for (const c of Array.from(b.getElementsByTagName('CHAPTER'))) {
      const cn = parseInt(c.getAttribute('cnumber'), 10);
      for (const v of Array.from(c.getElementsByTagName('VERS'))) {
        put(books, book.id, cn, parseInt(v.getAttribute('vnumber'), 10), v.textContent.replace(/\s+/g, ' '));
      }
    }
  }
  return finish(name, lang, books);
}

// USFM, the format Bible translators use (eBible.org, Door43, the Digital Bible Library).
// Pass the text of one or more book files. Front matter, glossaries and books outside the 66 are skipped.
export function parseUSFM(texts, name = 'Imported Bible', lang = 'xx') {
  const books = {};
  for (const raw of [].concat(texts)) {
    const text = String(raw || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const idMatch = text.match(/\\id\s+([0-9A-Z]{3})/);
    if (!idMatch || !BOOK_BY_ID[idMatch[1]]) continue;
    const id = idMatch[1];
    let chapter = 0;
    const clean = text
      // notes, cross references, pictures: not read aloud, not shown
      .replace(/\\(f|fe|ef|x|ex)\s[\s\S]*?\\\1\*/g, '')
      .replace(/\\fig\s?[\s\S]*?\\fig\*/g, '')
      .replace(/\\rq\s[\s\S]*?\\rq\*/g, '')
      // alternate and published verse numbers ("\va 2\va*")
      .replace(/\\(va|vp|ca)\s[^\\]*\\\1\*/g, '')
      // word attributes: \w grace|strong="G5485"\w*, \+w …|lemma="…"\+w*
      .replace(/\|[^\\|]*?(?=\\\+?[a-z0-9]+\*)/gi, '')
      // headings and book titles: the whole line
      .replace(/\\(s\d?|ms\d?|mr|r|sr|sp|d|cl|cd|toc\d|toca\d|h|mt\d?|mte\d?|imt\d?|is\d?|ip|ide|rem|sts|restore|periph|usfm)(\s[^\n]*)?(?=\n|$)/g, '');
    const tokens = clean.split(/(\\c\s+\d+|\\v\s+\d+[\w-]*)/);
    let verse = 0;
    for (const t of tokens) {
      const c = t.match(/^\\c\s+(\d+)/);
      const v = t.match(/^\\v\s+(\d+)/);
      if (c) { chapter = parseInt(c[1], 10); verse = 0; continue; }
      if (v) { verse = parseInt(v[1], 10); continue; }
      if (chapter && verse) {
        const body = t
          .replace(/\\\+?[a-z0-9]+\*?/gi, ' ')
          .replace(/\s+([,.;:!?’”)])/g, '$1')
          .replace(/\s+/g, ' ')
          .trim();
        if (body) put(books, id, chapter, verse, body);
      }
    }
  }
  return finish(name, lang, books);
}

// the text inside a .zip of Bible files (eBible.org, Door43…): [{ name, text }]
// unzip: fflate's unzipSync
export function filesFromZip(bytes, unzip) {
  const entries = unzip(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const dec = new TextDecoder('utf-8');
  return Object.entries(entries)
    .filter(([n, d]) => d && d.length && !n.endsWith('/') && /\.(usfm|sfm|ptx|xml|json)$/i.test(n))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([n, d]) => ({ name: n.split('/').pop(), text: dec.decode(d) }));
}

// a Bible from the catalogue: the zip's books plus the catalogue's name, language and copyright
export function bibleFromCatalog(entry, bytes, unzip) {
  const files = filesFromZip(bytes, unzip).filter((f) => /\.(usfm|sfm|ptx)$/i.test(f.name) || /\\id\s+[0-9A-Z]{3}/.test(f.text.slice(0, 300)));
  const b = parseUSFM(files.map((f) => f.text), entry.name, entry.lang);
  return withMeta(b, entry);
}

// keep the short fields first: the app reads them from the start of the file to list Bibles quickly
export function withMeta(bible, meta) {
  const { books, ...rest } = bible;
  return {
    id: meta.id || rest.id,
    name: meta.name || rest.name,
    short: meta.short || rest.short || '',
    lang: meta.lang || rest.lang,
    license: meta.license || rest.license || '',
    credit: meta.credit ?? rest.credit ?? '',
    copyright: meta.copyright || rest.copyright || '',
    ...Object.fromEntries(Object.entries(rest).filter(([k]) => !['id', 'name', 'short', 'lang', 'license', 'credit', 'copyright'].includes(k))),
    books
  };
}

// JSON: Mwanga's own format, or the common array format [{ abbrev, name, chapters: [[…]] }] in canon order.
export function parseBibleJSON(text, name = 'Imported Bible', lang = 'xx') {
  const data = JSON.parse(text.replace(/^﻿/, ''));
  if (data && data.books && !Array.isArray(data.books)) {
    return finish(data.name || name, data.lang || lang, data.books);
  }
  if (Array.isArray(data) && data.length && data[0].chapters) {
    const books = {};
    data.slice(0, 66).forEach((b, i) => { books[BOOKS[i].id] = b.chapters; });
    return finish(name, lang, books);
  }
  throw new Error('This JSON file is not a Bible Mwanga understands.');
}

export function importBibleFiles(files, unzip) {
  // files: [{ name, text }] or [{ name, data }] (bytes; .zip files are opened with unzip)
  if (!files.length) throw new Error('No file chosen.');
  const dec = new TextDecoder('utf-8');
  const all = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name) && f.data && unzip) all.push(...filesFromZip(f.data, unzip));
    else all.push({ name: f.name, text: f.text != null ? f.text : dec.decode(f.data) });
  }
  if (!all.length) throw new Error('No Bible files found in the zip.');
  const first = all[0];
  const base = files[0].name.replace(/\.[^.]+$/, '').replace(/_usfm$/i, '');
  if (all.some((f) => /\.(usfm|sfm|ptx)$/i.test(f.name) || /\\id\s+[0-9A-Z]{3}/.test(f.text.slice(0, 300)))) {
    return parseUSFM(all.map((f) => f.text), base);
  }
  if (/\.json$/i.test(first.name)) return parseBibleJSON(first.text, base);
  return parseZefania(first.text, base);
}
