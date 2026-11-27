import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { parseReference, formatReference, getVerses, findBook } from '../src/lib/bibleRef.js';
import { parseLyrics, songSlides, parseOpenLyrics, parsePlainSong } from '../src/lib/songs.js';
import { parseZefania, parseUSFM, parseBibleJSON } from '../src/lib/bibleImport.js';
import { slidesFor } from '../src/lib/slides.js';
import { BOOKS } from '../src/lib/books.js';

const kjv = JSON.parse(fs.readFileSync('data/bibles/kjv.json', 'utf8'));

describe('verse references', () => {
  it.each([
    ['jn 3:16', { book: 'JHN', chapter: 3, from: 16, to: 16 }],
    ['John 3:16-18', { book: 'JHN', chapter: 3, from: 16, to: 18 }],
    ['yh 3:16', { book: 'JHN', chapter: 3, from: 16, to: 16 }],
    ['Yohana 3 16', { book: 'JHN', chapter: 3, from: 16, to: 16 }],
    ['1 kor 13:4-7', { book: '1CO', chapter: 13, from: 4, to: 7 }],
    ['1yh 4:8', { book: '1JN', chapter: 4, from: 8, to: 8 }],
    ['zab 23', { book: 'PSA', chapter: 23, from: null, to: null }],
    ['ps 23.1', { book: 'PSA', chapter: 23, from: 1, to: 1 }],
    ['Mwanzo 1:1', { book: 'GEN', chapter: 1, from: 1, to: 1 }],
    ['Matendo ya Mitume 2:38', { book: 'ACT', chapter: 2, from: 38, to: 38 }],
    ['ufunuo 21:4', { book: 'REV', chapter: 21, from: 4, to: 4 }],
    ['rom 8:28', { book: 'ROM', chapter: 8, from: 28, to: 28 }],
    ['mt 5:3–10', { book: 'MAT', chapter: 5, from: 3, to: 10 }]
  ])('%s', (input, expected) => {
    expect(parseReference(input)).toEqual(expected);
  });

  it('rejects things that are not references', () => {
    expect(parseReference('amazing grace')).toBeNull();
    expect(parseReference('')).toBeNull();
    expect(parseReference('xyz 3:16')).toBeNull();
  });

  it('every book can be found by its English and Swahili names', () => {
    for (const b of BOOKS) {
      expect(findBook(b.en)).toBe(b.id);
      expect(findBook(b.sw)).toBe(b.id);
    }
  });

  it('formats references in both languages', () => {
    expect(formatReference({ book: 'JHN', chapter: 3, from: 16, to: 17 })).toBe('John 3:16-17');
    expect(formatReference({ book: 'JHN', chapter: 3, from: 16, to: 16 }, 'sw')).toBe('Yohana 3:16');
  });

  it('finds verses in the bundled KJV', () => {
    const v = getVerses(kjv, { book: 'JHN', chapter: 3, from: 16, to: 16 });
    expect(v[0].text).toMatch(/^For God so loved the world/);
    expect(Object.keys(kjv.books)).toHaveLength(66);
    expect(getVerses(kjv, { book: 'PSA', chapter: 23, from: null, to: null })).toHaveLength(6);
  });
});

describe('songs', () => {
  const lyrics = '[Verse 1]\nLine a\nLine b\n\nChorus\nC1\nC2\n\nLine c\nLine d';
  it('splits sections and names them', () => {
    const p = parseLyrics(lyrics);
    expect(p.map((s) => s.label)).toEqual(['Verse 1', 'Chorus', 'Verse 2']);
    expect(p[0].text).toBe('Line a\nLine b');
  });
  it('understands Swahili labels', () => {
    expect(parseLyrics('Kiitikio\nTunakusifu').map((s) => s.label)).toEqual(['Kiitikio']);
  });
  it('splits long sections across slides', () => {
    const s = songSlides({ lyrics: '1\n2\n3\n4\n5\n6' }, 4);
    expect(s).toHaveLength(2);
    expect(s[0].text.split('\n')).toHaveLength(3);
  });
  it('reads plain text songs', () => {
    expect(parsePlainSong('My Song\n\nA\nB')).toEqual({ title: 'My Song', lyrics: 'A\nB' });
  });
  it('reads OpenLyrics XML', () => {
    const xml = `<?xml version="1.0"?><song xmlns="http://openlyrics.info/namespace/2009/song"><properties><titles><title>Test Hymn</title></titles><songbooks><songbook name="Hymns" entry="12"/></songbooks></properties><lyrics><verse name="v1"><lines>One<br/>Two</lines></verse><verse name="c"><lines>Chorus line</lines></verse></lyrics></song>`;
    const s = parseOpenLyrics(xml);
    expect(s.title).toBe('Test Hymn');
    expect(s.number).toBe('12');
    expect(parseLyrics(s.lyrics).map((x) => x.label)).toEqual(['Verse 1', 'Chorus']);
  });
});

describe('importing Bibles', () => {
  it('reads Zefania XML', () => {
    const xml = '<XMLBIBLE biblename="Test Swahili"><INFORMATION><language>SWA</language></INFORMATION><BIBLEBOOK bnumber="43"><CHAPTER cnumber="3"><VERS vnumber="16">Kwa maana</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>';
    const b = parseZefania(xml);
    expect(b.name).toBe('Test Swahili');
    expect(b.books.JHN[2][15]).toBe('Kwa maana');
  });
  it('reads USFM', () => {
    const usfm = '\\id JHN\n\\h Yohana\n\\c 1\n\\p\n\\v 1 Hapo mwanzo kulikuwako Neno,\\f + \\ft note\\f* na Neno alikuwako kwa Mungu.\n\\v 2 Huyo mwanzo alikuwako.\n\\s1 Heading\n\\c 2\n\\v 1 Siku ya tatu.';
    const b = parseUSFM(usfm, 'ULB', 'sw');
    expect(b.books.JHN[0][0]).toBe('Hapo mwanzo kulikuwako Neno, na Neno alikuwako kwa Mungu.');
    expect(b.books.JHN[0][1]).toBe('Huyo mwanzo alikuwako.');
    expect(b.books.JHN[1][0]).toBe('Siku ya tatu.');
  });
  it('reads JSON in array format', () => {
    const b = parseBibleJSON(JSON.stringify([{ abbrev: 'gn', chapters: [['In the beginning']] }]), 'X', 'en');
    expect(b.books.GEN[0][0]).toBe('In the beginning');
  });
});

describe('slides', () => {
  it('builds Bible slides with a second translation', () => {
    const sw = { id: 'sw', name: 'Swahili test', short: 'SW', lang: 'sw', books: { JHN: [[], [], Array.from({ length: 16 }, (_, i) => (i === 15 ? 'Kwa maana jinsi hii' : ''))] } };
    const item = { type: 'bible', ref: { bibleId: 'kjv', book: 'JHN', chapter: 3, from: 16, to: 16 } };
    const s = slidesFor(item, { songs: [], notices: [], bibles: { kjv: { ...kjv, short: 'KJV' }, sw }, settings: { secondBible: 'sw' } });
    expect(s).toHaveLength(1);
    expect(s[0].sub).toBe('Kwa maana jinsi hii');
    expect(s[0].ref).toBe('John 3:16 · KJV · SW');
  });
  it('splits notices on ---', () => {
    const s = slidesFor({ type: 'notice', refId: 'n' }, { songs: [], notices: [{ id: 'n', title: 'T', body: 'A\n---\nB' }], bibles: {}, settings: {} });
    expect(s.map((x) => x.text)).toEqual(['A', 'B']);
  });
});
