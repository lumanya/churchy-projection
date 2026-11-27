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
// A song book is a .json file, sometimes with unquoted keys: { Songs: [ { Text: "title", Verses: [ { Text: "…" } ] } ], Text: "book name" }
export function parseVideoPsalm(text) {
  let src = String(text).replace(/^﻿/, '');
  let data;
  try { data = JSON.parse(src); } catch (_) {
    src = src.replace(/\r?\n/g, ' ').replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
    data = JSON.parse(src);
  }
  const book = typeof data.Text === 'string' ? data.Text.trim() : 'VideoPsalm';
  const songs = Array.isArray(data.Songs) ? data.Songs : Array.isArray(data) ? data : [];
  if (!songs.length) throw new Error('No songs found in this VideoPsalm file.');
  const out = [];
  songs.forEach((s, idx) => {
    const title = String(s.Text || s.Title || '').trim();
    const verses = Array.isArray(s.Verses) ? s.Verses : [];
    let vn = 0;
    const parts = verses.map((v) => {
      const body = String(v.Text || '').replace(/\\n/g, '\n').replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
      if (!body) return null;
      const chorus = v.Tag === 1 || v.Tag === '1' || v.IsChorus === true || /chorus|refrain|kiitikio/i.test(String(v.Tag || ''));
      const label = chorus ? 'Chorus' : `Verse ${++vn}`;
      return `[${label}]\n${body}`;
    }).filter(Boolean);
    if (!title || !parts.length) return;
    const number = s.Reference ?? s.Number ?? s.ID ?? idx + 1;
    out.push({ title, book, number: String(number), lyrics: parts.join('\n\n') });
  });
  return out;
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
