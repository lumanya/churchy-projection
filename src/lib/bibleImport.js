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

// USFM, the format Bible translators use (for example the Swahili ULB from Door43).
// Pass the text of one or more book files.
export function parseUSFM(texts, name = 'Imported Bible', lang = 'xx') {
  const books = {};
  for (const text of [].concat(texts)) {
    const idMatch = text.match(/\\id\s+([0-9A-Z]{3})/);
    if (!idMatch || !BOOK_BY_ID[idMatch[1]]) continue;
    const id = idMatch[1];
    let chapter = 0;
    // split on markers we care about; drop footnotes and cross references first
    const clean = text
      .replace(/\\f\s[\s\S]*?\\f\*/g, '')
      .replace(/\\x\s[\s\S]*?\\x\*/g, '')
      .replace(/\\(w)\s([^|\\]*)(\|[^\\]*)?\\w\*/g, '$2');
    const tokens = clean.split(/(\\c\s+\d+|\\v\s+\d+[\w-]*)/);
    let verse = 0;
    for (const t of tokens) {
      const c = t.match(/^\\c\s+(\d+)/);
      const v = t.match(/^\\v\s+(\d+)/);
      if (c) { chapter = parseInt(c[1], 10); verse = 0; continue; }
      if (v) { verse = parseInt(v[1], 10); continue; }
      if (chapter && verse) {
        const body = t
          .replace(/\\(s\d?|ms\d?|mr|r|d|cl|cp|toc\d|h|mt\d?|ide|rem)\b[^\n]*/g, '') // headings
          .replace(/\\[a-z0-9]+\*?/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (body) put(books, id, chapter, verse, body);
      }
    }
  }
  return finish(name, lang, books);
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

export function importBibleFiles(files) {
  // files: [{ name, text }]
  if (!files.length) throw new Error('No file chosen.');
  const first = files[0];
  const base = first.name.replace(/\.[^.]+$/, '');
  if (files.some((f) => /\.(usfm|sfm)$/i.test(f.name) || /\\id\s+[0-9A-Z]{3}/.test(f.text.slice(0, 200)))) {
    return parseUSFM(files.map((f) => f.text), base);
  }
  if (/\.json$/i.test(first.name)) return parseBibleJSON(first.text, base);
  return parseZefania(first.text, base);
}
