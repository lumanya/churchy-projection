import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { findSpokenReferences, validReferences, readNumber, tokenize } from '../src/lib/spokenRefs.js';

const kjv = JSON.parse(fs.readFileSync('data/bibles/kjv.json', 'utf8'));
const first = (t) => { const r = findSpokenReferences(t)[0]; return r ? { book: r.book, chapter: r.chapter, from: r.from, to: r.to } : null; };

describe('numbers said as words', () => {
  it.each([
    ['sixteen', 16], ['twenty three', 23], ['one hundred and nineteen', 119], ['a hundred and five', 105],
    ['kumi na sita', 16], ['ishirini na tatu', 23], ['mia moja na kumi na tisa', 119], ['tatu', 3], ['42', 42]
  ])('%s', (words, n) => { expect(readNumber(tokenize(words), 0).value).toBe(n); });
});

describe('references in English sermons', () => {
  it.each([
    ['Turn with me to John chapter three verse sixteen.', { book: 'JHN', chapter: 3, from: 16, to: 16 }],
    ['John 3:16 says', { book: 'JHN', chapter: 3, from: 16, to: 16 }],
    ['as John three sixteen tells us', { book: 'JHN', chapter: 3, from: 16, to: 16 }],
    ['Psalm twenty three', { book: 'PSA', chapter: 23, from: null, to: null }],
    ['First Corinthians thirteen four to seven', { book: '1CO', chapter: 13, from: 4, to: 7 }],
    ['1 John 4:8', { book: '1JN', chapter: 4, from: 8, to: 8 }],
    ['the book of Romans chapter 8 verse 28', { book: 'ROM', chapter: 8, from: 28, to: 28 }],
    ['Psalm one hundred and nineteen verse one hundred and five', { book: 'PSA', chapter: 119, from: 105, to: 105 }],
    ['Second Timothy three sixteen', { book: '2TI', chapter: 3, from: 16, to: 16 }],
    ['Acts chapter 2 verses 38 through 41', { book: 'ACT', chapter: 2, from: 38, to: 41 }],
    ['Revelation 21:4', { book: 'REV', chapter: 21, from: 4, to: 4 }]
  ])('%s', (text, ref) => { expect(first(text)).toEqual(ref); });
});

describe('references in Swahili sermons', () => {
  it.each([
    ['Tusome Yohana sura ya tatu mstari wa kumi na sita', { book: 'JHN', chapter: 3, from: 16, to: 16 }],
    ['Yohana tatu kumi na sita', { book: 'JHN', chapter: 3, from: 16, to: 16 }],
    ['Zaburi ishirini na tatu', { book: 'PSA', chapter: 23, from: null, to: null }],
    ['Warumi sura ya nane mstari wa ishirini na nane', { book: 'ROM', chapter: 8, from: 28, to: 28 }],
    ['Waraka wa kwanza wa Yohana sura ya nne', { book: '1JN', chapter: 4, from: null, to: null }],
    ['Wakorintho wa kwanza sura ya kumi na tatu', { book: '1CO', chapter: 13, from: null, to: null }],
    ['Mathayo sura ya tano mstari wa tatu hadi kumi', { book: 'MAT', chapter: 5, from: 3, to: 10 }],
    ['Mwanzo 1:1', { book: 'GEN', chapter: 1, from: 1, to: 1 }],
    ['Matendo ya Mitume mbili thelathini na nane', { book: 'ACT', chapter: 2, from: 38, to: 38 }]
  ])('%s', (text, ref) => { expect(first(text)).toEqual(ref); });
});

describe('not references', () => {
  it.each([
    'John said that we should pray',
    'mark my words, church',
    'Yohana alikuwa mtu wa Mungu',
    'I have a job to do',
    'Corinthians teaches love'
  ])('%s', (text) => { expect(findSpokenReferences(text)).toEqual([]); });

  it('drops chapters and verses that do not exist', () => {
    expect(validReferences(findSpokenReferences('Jude chapter five'), kjv)).toEqual([]);
    expect(validReferences(findSpokenReferences('Psalm 23 verse 40'), kjv)).toEqual([]);
    expect(validReferences(findSpokenReferences('John 3:16'), kjv)).toHaveLength(1);
  });

  it('finds several references in one sentence', () => {
    const r = findSpokenReferences('compare John 3:16 with Romans five eight');
    expect(r.map((x) => `${x.book} ${x.chapter}:${x.from}`)).toEqual(['JHN 3:16', 'ROM 5:8']);
  });
});
