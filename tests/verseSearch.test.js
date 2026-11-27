import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { buildVerseIndex, searchVerses } from '../src/lib/verseSearch.js';

const kjv = JSON.parse(fs.readFileSync('data/bibles/kjv.json', 'utf8'));
const t0 = Date.now();
const index = buildVerseIndex(kjv);
const buildMs = Date.now() - t0;
const top = (q, n = 1) => searchVerses(index, q, { limit: n }).map((r) => `${r.book} ${r.chapter}:${r.verse}`);

describe('finding verses from remembered words (KJV)', () => {
  it.each([
    ['for god so loved the world that he gave his only son', 'JHN 3:16'],
    ['the lord is my shepherd i shall not want', 'PSA 23:1'],
    ['the lord is my shepard', 'PSA 23:1'],                                    // spelling mistake
    ['I can do all things through Christ who strengthens me', 'PHP 4:13'],     // modern wording
    ['trust in the lord with all your heart', 'PRO 3:5'],                      // "thine" in the KJV
    ['be still and know that i am god', 'PSA 46:10'],
    ['all have sinned and fall short of the glory of god', 'ROM 3:23'],       // KJV says "come short"
    ['in the beginning was the word', 'JHN 1:1'],
    ['jesus wept', 'JHN 11:35'],
    ['the wages of sin is death', 'ROM 6:23'],
    ['ask and it shall be given you seek and ye shall find', 'MAT 7:7'],
    ['all things work together for good to them that love god', 'ROM 8:28'],
    ['your word is a lamp to my feet', 'PSA 119:105'],
    ['they that wait upon the lord shall renew their strength', 'ISA 40:31']
  ])('%s', (q, want) => {
    expect(top(q, 3)).toContain(want);
    expect(top(q, 1)[0]).toBe(want);
  });

  it('is quick', () => {
    const t = Date.now();
    for (let i = 0; i < 20; i++) searchVerses(index, 'god so loved the world gave his son');
    expect((Date.now() - t) / 20).toBeLessThan(150);
    expect(buildMs).toBeLessThan(8000);
  });

  it('returns nothing for empty or meaningless input', () => {
    expect(searchVerses(index, 'the and of')).toEqual([]);
    expect(searchVerses(index, '')).toEqual([]);
  });
});

describe('Swahili Bibles', () => {
  const sw = { lang: 'sw', books: {
    JHN: [[], [], Array.from({ length: 16 }, (_, i) => (i === 15 ? 'Kwa maana jinsi hii Mungu aliupenda ulimwengu, hata akamtoa Mwanawe pekee' : 'maneno mengine ya mfano ' + i))],
    PSA: Array.from({ length: 23 }, (_, c) => (c === 22 ? ['Bwana ndiye mchungaji wangu, sitapungukiwa na kitu'] : ['zaburi ya mfano']))
  } };
  const swIndex = buildVerseIndex(sw);
  it('finds verses from Swahili words', () => {
    expect(searchVerses(swIndex, 'Mungu aliupenda ulimwengu', { limit: 1 })[0]).toMatchObject({ book: 'JHN', chapter: 3, verse: 16 });
    expect(searchVerses(swIndex, 'bwana mchungaji wangu', { limit: 1 })[0]).toMatchObject({ book: 'PSA', chapter: 23, verse: 1 });
    expect(searchVerses(swIndex, 'mchungaj wangu sitapungukiwa', { limit: 1 })[0]).toMatchObject({ book: 'PSA', chapter: 23 }); // typo
  });
});
