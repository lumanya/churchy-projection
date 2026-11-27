import { BOOKS, bookName } from './books.js';

// Turns "Matendo ya Mitume" into "matendoyamitume" so spaces and dots never matter.
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

// Exact keys (abbreviations and full names, both languages) → book id.
const EXACT = new Map();
// Full names only, used for prefix matching ("yoha" → Yohana).
const NAMES = [];
for (const b of BOOKS) {
  for (const a of [...b.abbr, b.en, b.sw, b.id]) {
    const k = norm(a);
    if (!EXACT.has(k)) EXACT.set(k, b.id);
  }
  NAMES.push([norm(b.en), b.id], [norm(b.sw), b.id]);
}

export function findBook(text) {
  const k = norm(text);
  if (!k) return null;
  if (EXACT.has(k)) return EXACT.get(k);
  // A prefix of a full name. Canon order decides ties, so "jo" means Joshua, as in most Bibles' indexes.
  for (const [name, id] of NAMES) if (name.startsWith(k)) return id;
  return null;
}

// Parses references such as:
//   "jn 3:16"  "John 3:16-18"  "yh 3:16"  "1 kor 13:4-7"  "zab 23"  "ps 23.1"  "Mwanzo 1 1"
// Returns { book, chapter, from, to } (from/to null for a whole chapter) or null.
export function parseReference(input) {
  if (!input) return null;
  const s = input.trim().replace(/\s+/g, ' ');
  // optional leading book number, book words, chapter, optional verse range
  const m = s.match(/^([1-3]\s*)?([^\d:.]+?)\s*(\d+)(?:\s*[:.\s]\s*(\d+)(?:\s*[-–]\s*(\d+))?)?\s*$/i);
  if (!m) return null;
  const num = m[1] ? m[1].trim() : '';
  const book = findBook(num + m[2]);
  if (!book) return null;
  const chapter = parseInt(m[3], 10);
  const from = m[4] ? parseInt(m[4], 10) : null;
  let to = m[5] ? parseInt(m[5], 10) : from;
  if (from && to < from) to = from;
  return { book, chapter, from, to };
}

export function formatReference(ref, lang = 'en') {
  if (!ref) return '';
  const name = bookName(ref.book, lang);
  if (!ref.from) return `${name} ${ref.chapter}`;
  if (ref.to && ref.to !== ref.from) return `${name} ${ref.chapter}:${ref.from}-${ref.to}`;
  return `${name} ${ref.chapter}:${ref.from}`;
}

// Looks up verses in a Bible in Mwanga's format: { books: { JHN: [[v1, v2…], …] } }.
export function getVerses(bible, ref) {
  if (!bible || !ref) return [];
  const chapters = bible.books[ref.book];
  if (!chapters) return [];
  const verses = chapters[ref.chapter - 1];
  if (!verses) return [];
  const from = ref.from || 1;
  const to = Math.min(ref.to || verses.length, verses.length);
  const out = [];
  for (let v = from; v <= to; v++) if (verses[v - 1] != null) out.push({ n: v, text: verses[v - 1] });
  return out;
}
