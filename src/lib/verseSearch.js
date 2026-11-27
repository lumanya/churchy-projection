// Find Bible verses from the words people remember, offline.
// "for God loved the world so much he gave his son", "the lord is my shepard", "Mungu aliupenda ulimwengu"
// Ranking: BM25 over all verses, with
//  · old KJV words read as modern ones (thee → you, hath → has, unto → to),
//  · English word endings ignored (loveth, loved, loves → love),
//  · spelling mistakes forgiven (shepard → shepherd, erath → earth, beggining → beginning),
//  · a bonus when words appear in the same order as typed.
const ARCHAIC = {
  thee: 'you', thou: 'you', ye: 'you', thy: 'your', thine: 'your', hath: 'has', hast: 'have', doth: 'does', dost: 'do',
  art: 'are', shalt: 'shall', wilt: 'will', unto: 'to', saith: 'says', spake: 'spoke', wherefore: 'why', whosoever: 'whoever',
  shew: 'show', sheweth: 'show', yea: 'yes', nay: 'no', hither: 'here', thither: 'there', ere: 'before', wast: 'was'
};
const STOP = new Set(('a an the and or but of to in on at by for with from as is are was were be been am it its this that these those ' +
  'i me my we us our you your he him his she her they them their who whom which what not no so do does did has have had will shall ' +
  'na ya wa za la kwa katika ni kama huo hiyo hii yule wale yeye wao sisi ninyi mimi wewe pia lakini tena hata ili kwamba').split(' '));

const clean = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '').replace(/[^a-z0-9\s]/g, ' ');

function stemEn(w) {
  if (w.length > 5 && /(eth|est)$/.test(w)) w = w.slice(0, -3);
  else if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith('es')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  if (w.length > 3 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}

export function tokens(text, english = true) {
  return clean(text).split(/\s+/).filter(Boolean).map((w) => {
    const m = ARCHAIC[w] || w;
    return english ? stemEn(m) : m;
  });
}

// Damerau (optimal string alignment) distance: a swapped pair of letters ("erath" → "earth") counts as one mistake
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

// Build once per Bible (about a second for a whole Bible on an older PC; kept in memory).
export function buildVerseIndex(bible) {
  const english = (bible.lang || 'en') === 'en';
  const refs = [];       // [book, chapter, verse]
  const texts = [];      // normalised token string, for phrase checks
  const lengths = [];
  const postings = new Map(); // token → Map(verseIndex → count)
  const words = new Map();    // each word as written in this Bible → its search token (for spelling fixes)
  for (const [book, chapters] of Object.entries(bible.books)) {
    chapters.forEach((verses, ci) => (verses || []).forEach((v, vi) => {
      if (!v) return;
      const id = refs.length;
      const toks = tokens(v, english);
      for (const w of clean(v).split(/\s+/)) {
        if (w.length > 3 && !words.has(w)) { const tk = tokens(w, english)[0]; if (tk && !STOP.has(tk)) words.set(w, tk); }
      }
      refs.push([book, ci + 1, vi + 1]);
      texts.push(' ' + toks.join(' ') + ' ');
      lengths.push(toks.length);
      for (const t of toks) {
        if (STOP.has(t)) continue;
        let p = postings.get(t);
        if (!p) { p = new Map(); postings.set(t, p); }
        p.set(id, (p.get(id) || 0) + 1);
      }
    }));
  }
  const avg = lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length);
  return { english, refs, texts, lengths, postings, avg, words: [...words.entries()] };
}

// Returns [{ book, chapter, verse, score }] best first.
export function searchVerses(index, query, { limit = 8 } = {}) {
  // each typed word with its search token
  const typed = clean(query).split(/\s+/).filter(Boolean).map((raw) => ({ raw, t: tokens(raw, index.english)[0] }))
    .filter(({ t }) => t && !STOP.has(t) && t.length > 1);
  const q = typed.map((x) => x.t);
  if (!q.length) return [];
  const N = index.refs.length;
  const scores = new Map();
  const k1 = 1.2;
  const b = 0.75;
  const add = (term, weight) => {
    const p = index.postings.get(term);
    if (!p) return;
    const idf = Math.log(1 + (N - p.size + 0.5) / (p.size + 0.5));
    for (const [id, tf] of p) {
      const len = index.lengths[id];
      const s = idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * len) / index.avg))) * weight;
      scores.set(id, (scores.get(id) || 0) + s);
    }
  };
  const fixed = new Map(); // typed word → the Bible's spelling, for the in-order check
  const done = new Set();
  for (const { raw, t } of typed) {
    if (done.has(t)) continue;
    done.add(t);
    if (index.postings.has(t)) { add(t, 1); continue; }
    // not a word in this Bible: compare the word as typed with the Bible's words as written ("beggining" → "beginning")
    if (raw.length < 4) continue;
    const max = raw.length >= 7 ? 2 : 1;
    // closest spelling first, then the more common word
    const best = new Map(); // token → distance
    for (const [w, tk] of index.words) {
      if (w[0] !== raw[0] || !index.postings.has(tk)) continue;
      const d = editDistance(raw, w, max);
      if (d <= max && d < (best.get(tk) ?? 9)) best.set(tk, d);
    }
    const near = [...best.entries()].sort((x, y) => x[1] - y[1] || index.postings.get(y[0]).size - index.postings.get(x[0]).size).slice(0, 3);
    for (const [v, d] of near) add(v, d === 1 ? 0.95 : 0.8);
    if (near[0]) fixed.set(t, near[0][0]);
  }
  const qq = q.map((t) => fixed.get(t) || t);
  if (!scores.size) return [];
  // words in the same order as typed: a strong sign of the right verse
  const top = [...scores.entries()].sort((x, y) => y[1] - x[1]).slice(0, 200);
  const qJoined = qq.join(' ');
  // how many of the typed words the verse really contains (0–1): below about half, it's a weak match
  const distinct = [...new Set(qq)];
  const coverageOf = (text) => distinct.filter((w) => text.includes(` ${w} `)).length / distinct.length;
  const rescored = top.map(([id, s0]) => {
    const text = index.texts[id];
    // a verse with all the typed words beats one that repeats a few of them
    const s = s0 * (0.5 + 0.5 * coverageOf(text));
    let bonus = 0;
    for (let i = 0; i + 1 < qq.length; i++) {
      // the two words in this order, allowing up to two small words between ("lord is my shepherd")
      const re = new RegExp(` ${qq[i]} (\\S+ ){0,2}${qq[i + 1]} `);
      if (re.test(text)) bonus += 1.2;
    }
    if (text.includes(' ' + qJoined + ' ')) bonus += 3;
    return [id, s + bonus];
  }).sort((x, y) => y[1] - x[1]);
  return rescored.slice(0, limit).map(([id, score]) => {
    const [book, chapter, verse] = index.refs[id];
    const coverage = coverageOf(index.texts[id]);
    return { book, chapter, verse, score, coverage };
  });
}

// Whether a query looks like words from a verse (and not a song title or a reference).
export function looksLikeVerseWords(q) {
  const words = clean(q).split(/\s+/).filter((w) => w.length > 1);
  return words.length >= 3;
}
