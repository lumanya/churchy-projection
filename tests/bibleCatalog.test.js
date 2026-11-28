import { describe, it, expect } from 'vitest';
import { zipSync, unzipSync, strToU8 } from 'fflate';
import { parseUSFM, filesFromZip, bibleFromCatalog, importBibleFiles, withMeta } from '../src/lib/bibleImport.js';
import catalog from '../electron/bibleCatalog.json';

// the way eBible.org writes its USFM files
const FRT = '\\id FRT\n\\h Front matter\n\\mt1 Biblia\n\\p This is not a book.\n';
const GEN = [
  '﻿\\id GEN 02-GEN-swhonen.usfm Neno',
  '\\h Mwanzo', '\\toc1 Kitabu cha Mwanzo', '\\mt1 MWANZO',
  '\\c 1', '\\s1 Uumbaji', '\\p',
  '\\v 1 Hapo mwanzo Mungu aliumba mbingu na dunia.\\f + \\fr 1:1 \\ft Au: \\fqa mwanzoni\\f*',
  '\\v 2 Dunia ilikuwa haina umbo, tena ilikuwa tupu.\\x - \\xo 1:2 \\xt Yer 4:23\\x*',
  '\\v 3 Mungu akasema, \\wj “Iwe nuru,”\\wj* nayo nuru ikawa.',
  '\\c 2', '\\p', '\\v 1 Hivyo mbingu na dunia zikakamilika.'
].join('\r\n');
const PSA = [
  '\\id PSA', '\\c 23', '\\d Zaburi ya Daudi.',
  '\\q1 \\v 1 \\w Bwana|strong="H3068"\\w* ndiye \\w mchungaji|strong="H7462"\\w* wangu,',
  '\\q2 sitapungukiwa na kitu.',
  '\\q1 \\v 2 Hunilaza \\+w malisho|lemma="x"\\+w* mabichi,\\va 3\\va*',
  '\\q2 huniongoza kando ya maji ya utulivu.'
].join('\n');
const JHN = '\\id JHN\n\\c 3\n\\p\n\\v 16 “Kwa maana jinsi hii Mungu aliupenda ulimwengu \\add hata\\add* akamtoa Mwanawe wa pekee.\n\\v 17-18 Kwa maana Mungu hakumtuma Mwana.\n';
const TOB = '\\id TOB\n\\c 1\n\\v 1 Not one of the 66.\n';

describe('USFM from eBible.org', () => {
  const b = parseUSFM([FRT, GEN, PSA, JHN, TOB], 'Neno', 'sw');

  it('keeps the 66 books only', () => {
    expect(Object.keys(b.books).sort()).toEqual(['GEN', 'JHN', 'PSA']);
  });
  it('leaves out footnotes, cross references and headings', () => {
    expect(b.books.GEN[0][0]).toBe('Hapo mwanzo Mungu aliumba mbingu na dunia.');
    expect(b.books.GEN[0][1]).toBe('Dunia ilikuwa haina umbo, tena ilikuwa tupu.');
    expect(b.books.GEN[1][0]).toBe('Hivyo mbingu na dunia zikakamilika.');
    expect(JSON.stringify(b.books)).not.toMatch(/Uumbaji|MWANZO|Kitabu|Yer 4|mwanzoni/);
  });
  it('keeps words of Jesus and added words, without markers', () => {
    expect(b.books.GEN[0][2]).toBe('Mungu akasema, “Iwe nuru,” nayo nuru ikawa.');
    expect(b.books.JHN[2][15]).toBe('“Kwa maana jinsi hii Mungu aliupenda ulimwengu hata akamtoa Mwanawe wa pekee.');
  });
  it('drops word attributes and alternate verse numbers, joins poetry lines', () => {
    expect(b.books.PSA[22][0]).toBe('Bwana ndiye mchungaji wangu, sitapungukiwa na kitu.');
    expect(b.books.PSA[22][1]).toBe('Hunilaza malisho mabichi, huniongoza kando ya maji ya utulivu.');
    expect(JSON.stringify(b.books)).not.toMatch(/strong|lemma|\\\\/);
  });
  it('puts a verse range under its first verse', () => {
    expect(b.books.JHN[2][16]).toBe('Kwa maana Mungu hakumtuma Mwana.');
  });
});

describe('Bible zips', () => {
  const zip = zipSync({
    'swhonen_usfm/00-FRTswhonen.usfm': strToU8(FRT),
    'swhonen_usfm/02-GENswhonen.usfm': strToU8(GEN),
    'swhonen_usfm/20-PSAswhonen.usfm': strToU8(PSA),
    'swhonen_usfm/44-JHNswhonen.usfm': strToU8(JHN),
    'swhonen_usfm/copr.htm': strToU8('<p>copyright</p>'),
    'swhonen_usfm/': new Uint8Array(0)
  });

  it('reads the Bible files inside a zip', () => {
    expect(filesFromZip(zip, unzipSync).map((f) => f.name)).toEqual(['00-FRTswhonen.usfm', '02-GENswhonen.usfm', '20-PSAswhonen.usfm', '44-JHNswhonen.usfm']);
  });

  it('makes a catalogue Bible with its name, language and copyright', () => {
    const entry = catalog.find((c) => c.id === 'swhonen');
    const b = bibleFromCatalog(entry, zip, unzipSync);
    expect(b).toMatchObject({ id: 'swhonen', name: 'Neno: Bibilia Takatifu', short: 'NENO', lang: 'sw', license: 'CC BY-SA 4.0' });
    expect(b.copyright).toMatch(/Biblica/);
    expect(b.credit).toBe('© Biblica, Inc. · CC BY-SA 4.0');
    // the app lists Bibles by reading only the start of each file
    expect(JSON.stringify(b).slice(0, 400)).toMatch(/"id":"swhonen","name":"[^"]+","short":"NENO","lang":"sw"/);
    expect(b.books.JHN[2][15]).toMatch(/aliupenda ulimwengu/);
  });

  it('imports a zip chosen with Import a Bible', () => {
    const b = importBibleFiles([{ name: 'swhulb_usfm.zip', data: zip }], unzipSync);
    expect(b.name).toBe('swhulb');
    expect(Object.keys(b.books)).toHaveLength(3);
  });

  it('still imports plain files given as bytes', () => {
    const b = importBibleFiles([{ name: '44-JHN.usfm', data: strToU8(JHN) }]);
    expect(b.books.JHN[2][15]).toMatch(/^“Kwa maana/);
  });

  it('keeps metadata ahead of the books', () => {
    const b = withMeta({ id: 'x', name: 'X', lang: 'en', books: { GEN: [['a']] } }, { short: 'X1' });
    expect(Object.keys(b).pop()).toBe('books');
  });
});

describe('the Bible catalogue', () => {
  it('lists only open-licensed versions with full copyright notes', () => {
    expect(catalog.length).toBeGreaterThanOrEqual(5);
    for (const c of catalog) {
      expect(c.id).toMatch(/^[a-z0-9-]+$/);
      expect(['sw', 'en']).toContain(c.lang);
      expect(c.file).toBe(`${c.id}_usfm.zip`);
      expect(['Public domain', 'CC BY-SA 4.0']).toContain(c.license);
      expect(c.copyright.length).toBeGreaterThan(20);
      // licences that need credit carry a short credit for the screen
      if (c.license !== 'Public domain') expect(c.credit).toMatch(/CC BY-SA/);
    }
    expect(catalog.filter((c) => c.lang === 'sw').length).toBeGreaterThanOrEqual(2);
  });
});
