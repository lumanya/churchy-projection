// What a church sees the first time Mwanga opens.
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function defaultLibrary() {
  const songId = uid();
  const amazing = uid();
  const noticeId = uid();
  return {
    version: 1,
    songs: [
      {
        id: songId, title: 'Asante Bwana (example)', book: 'Choir', number: '',
        lyrics: '[Verse 1]\nAsante Bwana kwa siku hii\nUmetulinda usiku wote\n\n[Chorus]\nTunakusifu, tunakuabudu\nWewe ni mwema milele\n\n[Verse 2]\nAsante kwa familia yetu\nNa kwa rafiki tulio nao'
      },
      {
        id: amazing, title: 'Amazing Grace', book: 'Hymns', number: '1',
        lyrics: '[Verse 1]\nAmazing grace! How sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found;\nWas blind, but now I see.\n\n[Verse 2]\n’Twas grace that taught my heart to fear,\nAnd grace my fears relieved;\nHow precious did that grace appear\nThe hour I first believed!'
      }
    ],
    notices: [
      { id: noticeId, title: 'Welcome', body: 'Welcome to our service\nKaribu kwenye ibada yetu' }
    ],
    services: [
      {
        id: uid(), name: 'Sunday Service', date: new Date().toISOString().slice(0, 10),
        items: [
          { id: uid(), type: 'notice', refId: noticeId, title: 'Welcome' },
          { id: uid(), type: 'song', refId: songId, title: 'Asante Bwana (example)' },
          { id: uid(), type: 'bible', ref: { bibleId: 'kjv', book: 'JHN', chapter: 3, from: 16, to: 17 }, title: 'John 3:16-17' },
          { id: uid(), type: 'song', refId: amazing, title: 'Amazing Grace' }
        ]
      }
    ],
    currentServiceId: null
  };
}

export function defaultSettings() {
  return {
    lang: 'en',
    mainBible: 'kjv',
    secondBible: '',
    maxLines: 4,
    displayId: null,
    theme: { bg: '#000000', fg: '#FFFFFF', accent: '#FF6B2C' }
  };
}
