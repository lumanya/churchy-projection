// Finds Bible references in what the preacher says, after speech has been turned into text.
// Handles English and Swahili, digits and numbers said as words:
//   "turn with me to John chapter three verse sixteen"   → John 3:16
//   "tusome Yohana sura ya tatu mstari wa kumi na sita"   → John 3:16
//   "Zaburi ishirini na tatu"                             → Psalm 23
//   "first Corinthians thirteen four to seven"            → 1 Corinthians 13:4-7
//   "Waraka wa kwanza wa Yohana sura ya nne"              → 1 John 4
import { BOOKS } from './books.js';

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '');

// ---------- numbers ----------
const EN_UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const EN_TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SW_UNITS = { sifuri: 0, moja: 1, mbili: 2, tatu: 3, nne: 4, tano: 5, sita: 6, saba: 7, nane: 8, tisa: 9 };
const SW_TENS = { kumi: 10, ishirini: 20, thelathini: 30, arobaini: 40, hamsini: 50, sitini: 60, sabini: 70, themanini: 80, tisini: 90 };

// Reads a number starting at tokens[i]. Returns { value, next } or null.
export function readNumber(tokens, i) {
  const t = tokens[i];
  if (t === undefined) return null;
  if (/^\d{1,3}$/.test(t)) return { value: parseInt(t, 10), next: i + 1 };
  let value = 0;
  let j = i;
  let any = false;
  // hundreds: "one hundred (and) …", "a hundred …", "mia (moja) (na) …"
  if ((t === 'hundred') || ((EN_UNITS[t] || t === 'a') && tokens[i + 1] === 'hundred')) {
    value = 100 * (t === 'hundred' || t === 'a' ? 1 : EN_UNITS[t]);
    j = t === 'hundred' ? i + 1 : i + 2;
    any = true;
    if (tokens[j] === 'and') j++;
  } else if (t === 'mia') {
    value = 100; j = i + 1; any = true;
    if (SW_UNITS[tokens[j]] === 1) j++; // "mia moja"
    if (tokens[j] === 'na') j++;
  }
  const u = tokens[j];
  if (EN_TENS[u] !== undefined) {
    value += EN_TENS[u]; j++; any = true;
    if (EN_UNITS[tokens[j]] !== undefined && EN_UNITS[tokens[j]] < 10) { value += EN_UNITS[tokens[j]]; j++; }
  } else if (EN_UNITS[u] !== undefined) {
    value += EN_UNITS[u]; j++; any = true;
  } else if (SW_TENS[u] !== undefined) {
    value += SW_TENS[u]; j++; any = true;
    if (tokens[j] === 'na' && SW_UNITS[tokens[j + 1]] !== undefined && SW_UNITS[tokens[j + 1]] > 0) { value += SW_UNITS[tokens[j + 1]]; j += 2; }
  } else if (SW_UNITS[u] !== undefined) {
    value += SW_UNITS[u]; j++; any = true;
  } else if (/^\d{1,3}$/.test(u || '') && any) {
    value += parseInt(u, 10); j++;
  }
  return any && value > 0 ? { value, next: j } : null;
}

// ---------- book names as people say them ----------
const ORDINALS = { first: 1, second: 2, third: 3, '1st': 1, '2nd': 2, '3rd': 3, i: 1, ii: 2, iii: 3, one: 1, two: 2, three: 3, '1': 1, '2': 2, '3': 3, kwanza: 1, pili: 2, tatu: 3 };
const SPOKEN = {
  PSA: ['psalm', 'psalms', 'the psalms', 'zaburi'],
  SNG: ['song of songs', 'song of solomon', 'songs of solomon', 'wimbo ulio bora'],
  ACT: ['acts', 'acts of the apostles', 'the acts', 'matendo', 'matendo ya mitume'],
  REV: ['revelation', 'revelations', 'the revelation', 'ufunuo', 'ufunuo wa yohana'],
  ECC: ['ecclesiastes', 'mhubiri'],
  JHN: ['john', 'gospel of john', 'the gospel of john', 'yohana', 'injili ya yohana'],
  MAT: ['matthew', 'gospel of matthew', 'mathayo', 'injili ya mathayo'],
  MRK: ['mark', 'gospel of mark', 'marko', 'injili ya marko'],
  LUK: ['luke', 'gospel of luke', 'luka', 'injili ya luka']
};

// Each entry: { words: [...], id, numbered } — numbered books ("1 John") are matched with their ordinal separately.
const NAMES = [];
for (const b of BOOKS) {
  const numbered = /^[123]/.test(b.id);
  const strip = (s) => norm(s).replace(/^[123]\s+/, '');
  const forms = new Set([strip(b.en), strip(b.sw), ...(SPOKEN[b.id] || []).map(norm)]);
  for (const f of forms) NAMES.push({ words: f.split(/\s+/), id: b.id, numbered, n: numbered ? parseInt(b.id[0], 10) : 0 });
}
NAMES.sort((a, b) => b.words.length - a.words.length); // longest names first

function matchName(tokens, i, wantNumbered = false) {
  for (const nm of NAMES) {
    if (wantNumbered && !nm.numbered) continue;
    let ok = true;
    for (let k = 0; k < nm.words.length; k++) if (tokens[i + k] !== nm.words[k]) { ok = false; break; }
    if (ok) return { ...nm, next: i + nm.words.length };
  }
  return null;
}

const CHAPTER_WORDS = new Set(['chapter', 'chapters', 'sura', 'mlango', 'ch']);
const VERSE_WORDS = new Set(['verse', 'verses', 'vs', 'v', 'mstari', 'mistari', 'aya', 'kifungu']);
const FILLER = new Set(['ya', 'wa', 'the', 'of', 'at', 'and', 'from', 'kuanzia', 'number', 'namba']);
const RANGE_WORDS = new Set(['to', 'through', 'thru', 'till', 'until', 'hadi', 'mpaka', 'na', 'and']);

export function tokenize(text) {
  return norm(text)
    .replace(/(\d+)\s*[:.]\s*(\d+)/g, '$1 : $2')
    .replace(/(\d+)\s*[-–]\s*(\d+)/g, '$1 - $2')
    .replace(/[^a-z0-9:\-\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// Returns [{ book, chapter, from, to, at }] in the order they were said.
export function findSpokenReferences(text) {
  const tokens = tokenize(text);
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    // ordinal before the name: "first John", "1 John", "2 Wakorintho"
    let ord = 0;
    let start = i;
    if (ORDINALS[tokens[i]] && ['first', 'second', 'third', '1st', '2nd', '3rd', '1', '2', '3', 'i', 'ii', 'iii'].includes(tokens[i])) {
      if (matchName(tokens, i + 1, true)) { ord = ORDINALS[tokens[i]]; start = i + 1; }
    }
    // Swahili: "Waraka wa kwanza wa Yohana", "Barua ya pili kwa Wakorintho"
    if (['waraka', 'barua'].includes(tokens[i]) && ['wa', 'ya'].includes(tokens[i + 1]) && ORDINALS[tokens[i + 2]] && ['wa', 'kwa', 'ya'].includes(tokens[i + 3])) {
      if (matchName(tokens, i + 4, true)) { ord = ORDINALS[tokens[i + 2]]; start = i + 4; }
    }
    const nm = matchName(tokens, start);
    if (!nm) continue;
    let j = nm.next;
    // ordinal after the name: "Yohana wa kwanza", "Wakorintho wa pili", "John one"? (no: "John one" is chapter 1)
    if (!ord && nm.numbered && tokens[j] === 'wa' && ['kwanza', 'pili', 'tatu'].includes(tokens[j + 1])) { ord = ORDINALS[tokens[j + 1]]; j += 2; }
    let id = nm.id;
    if (nm.numbered) {
      if (!ord) {
        // "John" alone is the Gospel; "Corinthians" alone is ambiguous: skip
        const plain = NAMES.find((x) => !x.numbered && x.words.join(' ') === nm.words.join(' '));
        if (!plain) continue;
        id = plain.id;
      } else {
        const want = BOOKS.find((x) => x.id[0] === String(ord) && x.id.slice(1) === nm.id.slice(1));
        if (!want) continue;
        id = want.id;
      }
    } else if (ord) {
      // "1 John" where "john" matched the Gospel entry first
      const want = BOOKS.find((x) => /^[123]/.test(x.id) && x.id[0] === String(ord) && (norm(x.en).endsWith(nm.words.join(' ')) || norm(x.sw).endsWith(nm.words.join(' '))));
      if (want) id = want.id;
    }
    // chapter: optional "chapter"/"sura (ya)", then a number
    while (FILLER.has(tokens[j])) j++;
    if (CHAPTER_WORDS.has(tokens[j])) { j++; while (FILLER.has(tokens[j])) j++; }
    const ch = readNumber(tokens, j);
    if (!ch) continue; // a book name with no number is just a word ("John said…")
    j = ch.next;
    let from = null;
    let to = null;
    // verse: ":" or "verse"/"mstari (wa)", or a bare second number right after the chapter ("John three sixteen")
    let k = j;
    let verseCue = false;
    if (tokens[k] === ':') { k++; verseCue = true; }
    while (FILLER.has(tokens[k]) && tokens[k] !== 'na') k++;
    if (VERSE_WORDS.has(tokens[k])) { k++; verseCue = true; while (FILLER.has(tokens[k])) k++; }
    const v = readNumber(tokens, k);
    if (v && (verseCue || k === j)) {
      from = v.value; to = v.value; j = v.next;
      // range: "to seven", "- 7", "hadi saba", "na kumi na saba"? ("na" only if followed by a number word that isn't part of the first number)
      let r = j;
      if (tokens[r] === '-' || RANGE_WORDS.has(tokens[r])) {
        r++;
        if (VERSE_WORDS.has(tokens[r])) r++;
        const v2 = readNumber(tokens, r);
        if (v2 && v2.value > from && v2.value - from <= 60) { to = v2.value; j = v2.next; }
      }
    }
    if (ch.value > 150 || (from && from > 176)) continue;
    out.push({ book: id, chapter: ch.value, from, to, at: i });
    i = j - 1;
  }
  return out;
}

// Keeps only references that exist in the given Bible (drops "Mark 99" and other mishearings).
export function validReferences(refs, bible) {
  if (!bible) return refs;
  return refs.filter((r) => {
    const chs = bible.books[r.book];
    const vs = chs && chs[r.chapter - 1];
    if (!vs) return false;
    if (r.from && r.from > vs.length) return false;
    if (r.to && r.to > vs.length) r.to = vs.length;
    return true;
  });
}
