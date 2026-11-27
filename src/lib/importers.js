// Importers for songs from other church programs.
import { rtfToText } from './rtf.js';

const LABEL = /^(verse|chorus|refrain|bridge|pre-?chorus|tag|intro|ending|outro|misc|ubeti|kiitikio|kibwagizo|daraja)(\s*\d+)?[:.]?$/i;

// Turn a song written with labels on their own line ("Verse 1", "Chorus") into Mwanga's format:
// sections separated by a blank line, each starting with [Label].
export function normaliseLabelledLyrics(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim());
  const out = [];
  for (const line of lines) {
    if (LABEL.test(line)) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      out.push(`[${line.replace(/[:.]$/, '')}]`);
    } else out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------- EasyWorship 6 / 7 ----------
// Songs.db (table "song") and SongWords.db (table "word", lyrics as RTF), both SQLite.
// openDb(bytes) must return an sql.js Database.
export function easyWorshipSongs(openDb, songsBytes, wordsBytes) {
  const songsDb = openDb(songsBytes);
  const wordsDb = openDb(wordsBytes);
  try {
    const cols = songsDb.exec('PRAGMA table_info(song)')[0]?.values.map((r) => r[1]) || [];
    if (!cols.length) throw new Error('This is not an EasyWorship Songs.db file.');
    const pick = (...names) => names.find((n) => cols.includes(n));
    const titleCol = pick('title') || 'title';
    const numCol = pick('reference_number', 'song_number');
    const res = songsDb.exec(`SELECT rowid, ${titleCol}${numCol ? ', ' + numCol : ''} FROM song`)[0];
    if (!res) return [];
    const words = new Map();
    const w = wordsDb.exec('SELECT song_id, words FROM word')[0];
    if (w) for (const [id, rtf] of w.values) if (!words.has(id)) words.set(id, rtf);
    const out = [];
    for (const row of res.values) {
      const [id, title, number] = row;
      const text = rtfToText(words.get(id) || '');
      if (!title || !text) continue;
      out.push({ title: String(title).trim(), book: 'EasyWorship', number: number ? String(number) : '', lyrics: normaliseLabelledLyrics(text) });
    }
    return out;
  } finally {
    songsDb.close();
    wordsDb.close();
  }
}

// ---------- VideoPsalm ----------
// A song book is a .vpc file: a zip holding one .json file. The JSON is "relaxed": field names have no quotes
// and line breaks inside lyrics are real line breaks. Published books (Tenzi za Rohoni and others) are encrypted
// by their publishers; Mwanga does not open those.
//   { Songs: [ { Text: "title", Verses: [ { ID: 2, Text: "line\nline" } ], Guid, Style } ], Text: "book name" }

// Turns VideoPsalm's relaxed JSON into strict JSON.
export function relaxedJSON(text) {
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') { out += c + (text[i + 1] ?? ''); i++; continue; }
      if (c === '"') inStr = false;
      if (c === '\r') continue;
      if (c === '\n') { out += '\\n'; continue; }
      if (c === '\t') { out += '\\t'; continue; }
      out += c;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (/[A-Za-z_]/.test(c) && /[{,\s]$|^$/.test(out.slice(-1))) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*(?=\s*:)/.exec(text.slice(i, i + 64));
      if (m) { out += `"${m[0]}"`; i += m[0].length - 1; continue; }
    }
    out += c;
  }
  return out;
}

export function parseVideoPsalm(text) {
  const src = String(text).replace(/^\uFEFF/, '');
  let data;
  try { data = JSON.parse(src); } catch (_) { data = JSON.parse(relaxedJSON(src)); }
  const book = typeof data.Text === 'string' && data.Text.trim() ? data.Text.trim() : 'VideoPsalm';
  const songs = Array.isArray(data.Songs) ? data.Songs : Array.isArray(data) ? data : [];
  if (!songs.length) throw new Error('No songs found in this VideoPsalm file.');
  const out = [];
  songs.forEach((s, idx) => {
    const title = String(s.Text || s.Title || '').trim();
    const verses = (Array.isArray(s.Verses) ? s.Verses : [])
      .map((v) => String(v.Text || '').replace(/\\n/g, '\n').replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean).join('\n'))
      .filter(Boolean);
    if (!title || !verses.length) return;
    // VideoPsalm does not mark choruses; a part that comes back word for word is the chorus
    const counts = new Map();
    verses.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
    let vn = 0;
    const parts = verses.map((v) => `[${counts.get(v) > 1 ? 'Chorus' : `Verse ${++vn}`}]\n${v}`);
    out.push({ title, book, number: String(idx + 1), lyrics: parts.join('\n\n') });
  });
  return out;
}

export class LockedBookError extends Error {}

// bytes of a .vpc file → songs. unzip: fflate's unzipSync.
export function parseVideoPsalmFile(name, bytes, unzip) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const isZip = u8[0] === 0x50 && u8[1] === 0x4b;
  if (!isZip) return parseVideoPsalm(new TextDecoder().decode(u8));
  // bit 0 of the zip entry's flags means encrypted: a book locked by its publisher
  if (u8[6] & 1) throw new LockedBookError(`${name} is locked by its publisher, so it can't be imported.`);
  const files = unzip(u8);
  const json = Object.keys(files).find((f) => /\.json$/i.test(f)) || Object.keys(files)[0];
  if (!json) throw new Error(`${name} is empty.`);
  return parseVideoPsalm(new TextDecoder().decode(files[json]));
}

// Finds Songs.db / SongWords.db inside an EasyWorship .ewsx export (a zip) or in a list of chosen files.
export function pickEasyWorshipFiles(files, unzip) {
  const byName = (list, n) => list.find((f) => f.name.toLowerCase().split(/[\\/]/).pop() === n);
  let songs = byName(files, 'songs.db');
  let words = byName(files, 'songwords.db');
  if ((!songs || !words) && unzip) {
    for (const f of files.filter((x) => /\.(ewsx|zip)$/i.test(x.name))) {
      const entries = Object.entries(unzip(f.data)).map(([name, data]) => ({ name, data }));
      songs = songs || byName(entries, 'songs.db');
      words = words || byName(entries, 'songwords.db');
    }
  }
  return songs && words ? { songs: songs.data, words: words.data } : null;
}
