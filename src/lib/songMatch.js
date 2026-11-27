// Recognises which song from the church's library is being sung, from the words speech recognition hears,
// and decides when to move to the next slide while a song is live.
// Speech recognition is rough on singing, so everything works on overlapping word pairs and triples:
// a few correctly heard words in a row are enough.
import { songSlides } from './songs.js';

export const words = (text) => String(text || '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[’']/g, '').replace(/[^a-z0-9\s]/g, ' ')
  .split(/\s+/).filter(Boolean);

// word pairs and triples ("amazing grace", "amazing grace how"), the units we match on
function shingles(ws) {
  const out = new Set();
  for (let i = 0; i < ws.length; i++) {
    if (i + 1 < ws.length) out.add(ws[i] + ' ' + ws[i + 1]);
    if (i + 2 < ws.length) out.add(ws[i] + ' ' + ws[i + 1] + ' ' + ws[i + 2]);
  }
  return out;
}

// Letter patterns, ignoring spaces: catches Swahili heard as "tua ku sifu" for "tunakusifu".
const letters = (text) => String(text || '').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
export function letterGrams(text, n = 4) {
  const s = letters(text);
  const g = new Set();
  for (let i = 0; i + n <= s.length; i++) g.add(s.slice(i, i + n));
  return g;
}
const shareOf = (heardGrams, slideGrams) => {
  if (!heardGrams.size) return 0;
  let n = 0;
  for (const g of heardGrams) if (slideGrams.has(g)) n++;
  return n / heardGrams.size;
};

// Word pairs this common say nothing about which song it is ("of the", "ni wa").
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'to', 'in', 'is', 'my', 'me', 'i', 'you', 'we', 'he', 'it', 'oh', 'na', 'ni', 'wa', 'ya', 'kwa', 'za', 'la', 'katika', 'yetu', 'wangu']);
const informative = (sh) => sh.split(' ').some((w) => !STOP.has(w) && w.length > 2);

// ---------- recognising the song ----------
export function buildSongIndex(songs, maxLines = 4) {
  const map = new Map(); // shingle → Map(songId → Set(slideIndex))
  const meta = new Map();
  const grams = []; // [{ songId, slide, grams }]
  for (const song of songs) {
    const slides = songSlides(song, maxLines);
    meta.set(song.id, { title: song.title, slides: slides.length });
    slides.forEach((sl, si) => grams.push({ songId: song.id, slide: si, grams: letterGrams(sl.text) }));
    slides.forEach((sl, si) => {
      for (const sh of shingles(words(sl.text))) {
        if (!informative(sh)) continue;
        if (!map.has(sh)) map.set(sh, new Map());
        const bySong = map.get(sh);
        if (!bySong.has(song.id)) bySong.set(song.id, new Set());
        bySong.get(song.id).add(si);
      }
    });
  }
  return { map, meta, grams };
}

// Second chance when the words were heard too badly to match: compare letter patterns.
function identifyByLetters(transcript, index) {
  const hg = letterGrams(transcript);
  if (hg.size < 14) return null;
  const bestBySong = new Map();
  for (const e of index.grams) {
    const r = shareOf(hg, e.grams);
    const cur = bestBySong.get(e.songId);
    if (!cur || r > cur.r) bestBySong.set(e.songId, { r, slide: e.slide });
  }
  const ranked = [...bestBySong.entries()].sort((a, b) => b[1].r - a[1].r);
  if (!ranked.length) return null;
  const [songId, best] = ranked[0];
  const second = ranked[1] ? ranked[1][1].r : 0;
  if (best.r < 0.45 || best.r < second * 1.8) return null;
  return { songId, title: index.meta.get(songId).title, slide: best.slide, score: best.r, strength: best.r, by: 'letters' };
}

// Returns the best guess { songId, title, slide, score, strength } or null when nothing is convincing.
export function identifySong(transcript, index, { minScore = 4 } = {}) {
  const heard = [...shingles(words(transcript))].filter(informative);
  if (heard.length < 2) return identifyByLetters(transcript, index);
  const score = new Map();     // songId → points
  const slideHits = new Map(); // songId → Map(slide → points)
  for (const sh of heard) {
    const bySong = index.map.get(sh);
    if (!bySong) continue;
    const pts = sh.split(' ').length === 3 ? 2 : 1;      // a matching triple counts double
    const share = bySong.size > 3 ? 0.5 : 1;             // shared by many songs: worth less
    for (const [songId, slides] of bySong) {
      score.set(songId, (score.get(songId) || 0) + pts * share);
      const m = slideHits.get(songId) || new Map();
      for (const s of slides) m.set(s, (m.get(s) || 0) + pts);
      slideHits.set(songId, m);
    }
  }
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return identifyByLetters(transcript, index);
  const [bestId, best] = ranked[0];
  const second = ranked[1] ? ranked[1][1] : 0;
  if (best < minScore || best < second * 1.5) return identifyByLetters(transcript, index); // not sure enough from words
  const slides = [...slideHits.get(bestId).entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return { songId: bestId, title: index.meta.get(bestId).title, slide: slides[0][0], score: best, strength: Math.min(1, best / 12) };
}

// ---------- following along ----------
// slides: [{ text }]; current: index on screen. state: { lastMoveAt, left } kept by the caller.
// Returns { move: index|null, why }.
export function followSong(transcript, slides, current, state = {}, now = Date.now()) {
  if (!slides.length) return { move: null, why: 'no slides' };
  if (state.lastMoveAt && now - state.lastMoveAt < 3000) return { move: null, why: 'just moved' };
  const heardWords = words(transcript);
  if (heardWords.length < 3) return { move: null, why: 'too little' };
  const heard = new Set([...shingles(heardWords)].filter(informative));
  // what was sung most recently matters most: the last third of what was heard
  const tailWords = heardWords.slice(-Math.max(4, Math.ceil(heardWords.length / 3)));
  const tail = new Set([...shingles(tailWords)].filter(informative));

  const own = slides.map((sl) => [...shingles(words(sl.text))].filter(informative));
  const scoreOf = (i, set) => {
    let n = 0;
    for (const sh of own[i]) if (set.has(sh)) n += sh.split(' ').length === 3 ? 2 : 1;
    return n;
  };
  // how much of a slide was heard (0–1): a shared phrase like "kwa siku hii" is not enough to jump
  const coverage = (i) => (own[i].length ? own[i].filter((sh) => heard.has(sh)).length / own[i].length : 0);
  const scores = slides.map((_, i) => scoreOf(i, tail) * 2 + scoreOf(i, heard));
  const cur = scores[current] || 0;

  // 1. the singers are clearly on another slide: go there (the nearest one after this, for repeated choruses)
  const best = Math.max(...scores);
  if (best >= 6 && best >= cur + 4) {
    const candidates = scores.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0 && i !== current);
    const after = candidates.filter((i) => i > current);
    const target = after.length ? after[0] : candidates[0];
    const recentlyLeft = state.left === target && state.lastMoveAt && now - state.lastMoveAt < 12000;
    const enough = target !== undefined && coverage(target) >= (target < current ? 0.5 : 0.35);
    if (enough && !recentlyLeft) return { move: target, why: 'singing another slide' };
  }

  // 2. they have reached the last line of this slide: put the next one up now, so it is there when they start it
  const lines = String(slides[current].text).split('\n').filter((l) => l.trim());
  const last = words(lines[lines.length - 1] || '');
  if (current + 1 < slides.length && last.length >= 2) {
    const lastSh = [...shingles(last)].filter(informative);
    const hit = lastSh.filter((sh) => tail.has(sh)).length;
    if (lastSh.length && hit / lastSh.length >= 0.5 && hit >= 1) return { move: current + 1, why: 'end of slide' };
  }
  // 3. words too garbled to match: try letter patterns (only forwards, and only when clear)
  if (best < 3) {
    const tailText = tailWords.join(' ');
    const tg = letterGrams(heardWords.join(' '));
    if (tg.size >= 12) {
      const shares = slides.map((sl) => shareOf(tg, letterGrams(sl.text)));
      const curShare = shares[current] || 0;
      let target = -1;
      for (let i = current + 1; i < slides.length; i++) if (shares[i] >= 0.5 && shares[i] >= curShare * 1.8) { target = i; break; }
      if (target >= 0) return { move: target, why: 'singing another slide (letters)' };
      const lastLine = String(slides[current].text).split('\n').filter((l) => l.trim()).pop() || '';
      const lg = letterGrams(lastLine);
      if (current + 1 < slides.length && lg.size >= 6 && shareOf(lg, letterGrams(tailText)) >= 0.6) return { move: current + 1, why: 'end of slide (letters)' };
    }
  }
  return { move: null, why: 'stay' };
}
