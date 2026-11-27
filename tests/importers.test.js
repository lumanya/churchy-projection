import { describe, it, expect } from 'vitest';
import initSqlJs from 'sql.js';
import { zipSync } from 'fflate';
import { unzipSync } from 'fflate';
import { rtfToText } from '../src/lib/rtf.js';
import { normaliseLabelledLyrics, easyWorshipSongs, parseVideoPsalm, parseVideoPsalmFile, LockedBookError, pickEasyWorshipFiles } from '../src/lib/importers.js';
import { parseLyrics } from '../src/lib/songs.js';
import { formatTimer } from '../src/stage/timer.js';

describe('RTF', () => {
  it('keeps lines and decodes characters', () => {
    const rtf = String.raw`{\rtf1\ansi\deff0{\fonttbl{\f0 Arial;}}{\colortbl;\red0\green0\blue0;}\f0\fs24 Verse 1\par Amazing grace\line how sweet\par Caf\'e9 ` + '\\' + 'u8217?s\\par}';
    expect(rtfToText(rtf)).toBe('Verse 1\nAmazing grace\nhow sweet\nCafé ’s');
  });
  it('returns plain text unchanged', () => {
    expect(rtfToText('Just words')).toBe('Just words');
  });
});

describe('labelled lyrics', () => {
  it('turns label lines into Mwanga sections', () => {
    const out = normaliseLabelledLyrics('Verse 1\nA\nB\nChorus\nC\nVerse 2\nD');
    expect(parseLyrics(out).map((s) => s.label)).toEqual(['Verse 1', 'Chorus', 'Verse 2']);
  });
});

describe('EasyWorship', async () => {
  const SQL = await initSqlJs();
  const songsDb = new SQL.Database();
  songsDb.run('CREATE TABLE song (title TEXT, author TEXT, reference_number TEXT)');
  songsDb.run("INSERT INTO song (rowid, title, author, reference_number) VALUES (1, 'Yesu kwetu ni rafiki', 'X', '12'), (2, 'No words', '', '')");
  const wordsDb = new SQL.Database();
  wordsDb.run('CREATE TABLE word (song_id INTEGER, words TEXT)');
  wordsDb.run('INSERT INTO word (song_id, words) VALUES (?, ?)', [1, String.raw`{\rtf1\ansi{\fonttbl{\f0 Tahoma;}}Verse 1\par Yesu kwetu ni rafiki\par\par Chorus\par Haleluya\par}`]);
  const songsBytes = songsDb.export();
  const wordsBytes = wordsDb.export();
  const open = (b) => new SQL.Database(b);

  it('reads songs and lyrics from Songs.db and SongWords.db', () => {
    const songs = easyWorshipSongs(open, songsBytes, wordsBytes);
    expect(songs).toHaveLength(1);
    expect(songs[0]).toMatchObject({ title: 'Yesu kwetu ni rafiki', number: '12', book: 'EasyWorship' });
    expect(parseLyrics(songs[0].lyrics).map((s) => s.label)).toEqual(['Verse 1', 'Chorus']);
  });

  it('finds the databases inside an .ewsx export', () => {
    const zip = zipSync({ 'Data/Songs.db': songsBytes, 'Data/SongWords.db': wordsBytes });
    const pair = pickEasyWorshipFiles([{ name: 'backup.ewsx', data: zip }], unzipSync);
    expect(pair).not.toBeNull();
    expect(easyWorshipSongs(open, pair.songs, pair.words)).toHaveLength(1);
  });
});

describe('VideoPsalm', () => {
  // The real format: unquoted field names, real line breaks inside lyrics, no chorus marks.
  const book = '{Songs:[{Guid:"a1",Verses:[{\nText:"Bwana ni mchungaji wangu\nsitapungukiwa"},{ID:2,\nText:"Haleluya haleluya\nYesu ni Bwana"},{ID:3,\nText:"Ananiongoza njiani\nkwa upendo"},{ID:4,\nText:"Haleluya haleluya\nYesu ni Bwana"}],Style:{},Text:"Bwana ni mchungaji"},{Guid:"a2",Verses:[],Text:"New song"}],Guid:"b",Style:{Body:{FontSize:200}},Text:"Nyimbo za Kanisa"}';

  it('reads relaxed JSON with line breaks and finds the chorus', () => {
    const songs = parseVideoPsalm(book);
    expect(songs).toHaveLength(1); // the empty "New song" is skipped
    expect(songs[0]).toMatchObject({ title: 'Bwana ni mchungaji', book: 'Nyimbo za Kanisa', number: '1' });
    const parts = parseLyrics(songs[0].lyrics);
    expect(parts.map((p) => p.label)).toEqual(['Verse 1', 'Chorus', 'Verse 2', 'Chorus']);
    expect(parts[0].text).toBe('Bwana ni mchungaji wangu\nsitapungukiwa');
  });

  it('opens .vpc song books (a zip with one JSON file)', () => {
    const vpc = zipSync({ 'Nyimbo.json': new TextEncoder().encode(book) });
    expect(parseVideoPsalmFile('Nyimbo.vpc', vpc, unzipSync)).toHaveLength(1);
  });

  it('refuses books locked by their publisher', () => {
    const vpc = zipSync({ 'Locked.json': new TextEncoder().encode(book) });
    vpc[6] |= 1; // the zip's "encrypted" flag, as in published VideoPsalm books
    expect(() => parseVideoPsalmFile('Locked.vpc', vpc, unzipSync)).toThrow(LockedBookError);
  });
});

describe('timer', () => {
  it('counts up and down', () => {
    const now = Date.now();
    expect(formatTimer({ running: true, startedAt: now - 65000, base: 0 }).text).toBe('1:05');
    const down = formatTimer({ running: false, base: 29 * 60000, minutes: 30 });
    expect(down).toMatchObject({ text: '1:00', warn: true, over: false });
    expect(formatTimer({ running: false, base: 31 * 60000, minutes: 30 })).toMatchObject({ text: '+1:00', over: true });
  });
});
