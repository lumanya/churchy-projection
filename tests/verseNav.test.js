import { describe, it, expect } from 'vitest';
import { nextVerseRef, prevVerseRef, nextVerseOnly } from '../src/lib/verseNav.js';

const bible = { books: { JHN: [['1a', '1b'], ['2a', '2b', '2c']], JUD: [['a', 'b']] } };
const ref = (chapter, from, to) => ({ bibleId: 'x', book: 'JHN', chapter, from, to });

describe('reading on through the Bible', () => {
  it('adds the next verse to the passage', () => {
    expect(nextVerseRef(bible, ref(2, 1, 1))).toEqual({ kind: 'extend', ref: ref(2, 1, 2) });
    expect(nextVerseOnly(bible, ref(2, 1, 2))).toEqual(ref(2, 3, 3));
  });
  it('moves to the next chapter when the chapter ends', () => {
    expect(nextVerseRef(bible, ref(1, 1, 2))).toEqual({ kind: 'chapter', ref: ref(2, 1, 1) });
    expect(nextVerseOnly(bible, ref(1, 2, 2))).toEqual(ref(2, 1, 1));
  });
  it('stops at the end of the book', () => {
    expect(nextVerseRef(bible, ref(2, 3, 3))).toBeNull();
    expect(nextVerseRef(bible, { book: 'JUD', chapter: 1, from: 1, to: 2 })).toBeNull();
  });
  it('treats a whole chapter as ending at its last verse', () => {
    expect(nextVerseRef(bible, { book: 'JHN', chapter: 1, from: 1 })).toEqual({ kind: 'chapter', ref: { book: 'JHN', chapter: 2, from: 1, to: 1 } });
  });
  it('adds the verse before, within the chapter', () => {
    expect(prevVerseRef(ref(2, 3, 3))).toEqual(ref(2, 2, 3));
    expect(prevVerseRef(ref(2, 1, 3))).toBeNull();
  });
  it('copes with no Bible or no passage', () => {
    expect(nextVerseRef(null, ref(1, 1, 1))).toBeNull();
    expect(nextVerseRef(bible, null)).toBeNull();
    expect(prevVerseRef(null)).toBeNull();
  });
});
