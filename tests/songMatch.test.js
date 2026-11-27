import { describe, it, expect } from 'vitest';
import { buildSongIndex, identifySong, followSong } from '../src/lib/songMatch.js';
import { songSlides } from '../src/lib/songs.js';

// Public-domain hymns and short made-up choruses, enough to tell songs apart.
const songs = [
  { id: 'amazing', title: 'Amazing Grace', lyrics: '[Verse 1]\nAmazing grace how sweet the sound\nThat saved a wretch like me\nI once was lost but now am found\nWas blind but now I see\n\n[Verse 2]\nTwas grace that taught my heart to fear\nAnd grace my fears relieved\nHow precious did that grace appear\nThe hour I first believed' },
  { id: 'holy', title: 'Holy, Holy, Holy', lyrics: '[Verse 1]\nHoly holy holy Lord God Almighty\nEarly in the morning our song shall rise to thee\nHoly holy holy merciful and mighty\nGod in three persons blessed Trinity' },
  { id: 'friend', title: 'What a Friend We Have in Jesus', lyrics: '[Verse 1]\nWhat a friend we have in Jesus\nAll our sins and griefs to bear\nWhat a privilege to carry\nEverything to God in prayer' },
  { id: 'asante', title: 'Asante Bwana', lyrics: '[Verse 1]\nAsante Bwana kwa siku hii\nUmetulinda usiku wote\n\n[Chorus]\nTunakusifu tunakuabudu\nWewe ni mwema milele\n\n[Verse 2]\nAsante kwa familia yetu\nNa kwa rafiki tulio nao\n\n[Chorus]\nTunakusifu tunakuabudu\nWewe ni mwema milele' },
  { id: 'yesu', title: 'Yesu ni mwema (example)', lyrics: '[Verse 1]\nYesu ni mwema sana\nAnatupenda daima\n\n[Chorus]\nHaleluya haleluya\nYesu ni Bwana wetu' }
];
const index = buildSongIndex(songs);

describe('recognising the song being sung', () => {
  it('finds the song from a few words, even with mistakes', () => {
    expect(identifySong('amazing grace how sweet the sound that saved a wretch', index)).toMatchObject({ songId: 'amazing', slide: 0 });
    // mis-heard words: "wrench" for "wretch", "sound" missing
    expect(identifySong('amazing grace how sweet that saved a wrench like me', index)).toMatchObject({ songId: 'amazing' });
  });
  it('finds the right part of the song', () => {
    expect(identifySong('how precious did that grace appear the hour I first believed', index)).toMatchObject({ songId: 'amazing', slide: 1 });
  });
  it('recognises Swahili songs', () => {
    expect(identifySong('tunakusifu tunakuabudu wewe ni mwema milele', index)).toMatchObject({ songId: 'asante', slide: 1 });
    expect(identifySong('asante kwa familia yetu na kwa rafiki', index)).toMatchObject({ songId: 'asante', slide: 2 });
  });
  it('stays quiet for preaching and for unknown songs', () => {
    expect(identifySong('brothers and sisters let us open our bibles and pray together', index)).toBeNull();
    expect(identifySong('ndugu zangu tusimame tuombe pamoja', index)).toBeNull();
    expect(identifySong('', index)).toBeNull();
  });
  it('does not guess between two songs that share only common words', () => {
    expect(identifySong('yesu ni', index)).toBeNull();
  });
});

describe('following a song', () => {
  const slides = songSlides(songs.find((s) => s.id === 'asante'));
  const at = 100000;

  it('moves on when the singers reach the end of the slide', () => {
    expect(followSong('asante bwana kwa siku hii umetulinda usiku wote', slides, 0, {}, at)).toMatchObject({ move: 1, why: 'end of slide' });
  });
  it('stays while they are in the middle of the slide', () => {
    expect(followSong('asante bwana kwa siku hii', slides, 0, {}, at).move).toBeNull();
  });
  it('jumps to the slide they are actually singing', () => {
    expect(followSong('asante kwa familia yetu na kwa rafiki tulio', slides, 0, {}, at)).toMatchObject({ move: 2, why: 'singing another slide' });
  });
  it('goes to the next chorus, not back to the first one', () => {
    // on verse 2 (slide 2), singers start the chorus: the chorus after verse 2 is slide 3
    expect(followSong('tunakusifu tunakuabudu wewe ni mwema', slides, 2, {}, at).move).toBe(3);
  });
  it('does not jump straight back to the slide it just left', () => {
    // just moved 0 → 1; the window still holds the end of slide 0
    const state = { lastMoveAt: at - 5000, left: 0 };
    expect(followSong('asante bwana kwa siku hii umetulinda usiku wote', slides, 1, state, at).move).toBeNull();
  });
  it('waits a moment after each move', () => {
    expect(followSong('asante kwa familia yetu na kwa rafiki tulio', slides, 0, { lastMoveAt: at - 1000 }, at).move).toBeNull();
  });
  it('ignores talking between songs', () => {
    expect(followSong('karibuni wote tumshukuru mungu kwa siku hii', slides, 1, {}, at).move).toBeNull();
  });
});
