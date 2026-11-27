// Interface text. English is the default; Swahili is one click away.
const T = {
  en: {
    service: 'Order of service', songs: 'Songs', bible: 'Bible', notices: 'Notices',
    search: 'Search songs or verses — try jn 3:16 or a hymn number',
    black: 'Black screen', restore: 'Restore screen', clear: 'Clear', live: 'Live', next: 'Next', onAir: 'ON AIR',
    projector: 'Projector', noSecond: 'No projector or TV found. Connect it, press Windows key + P and choose Extend. Until then the output opens as a preview window.', projectorOn: 'Projector on', projectorOff: 'Projector off', display: 'Screen',
    addToService: 'Add to service', showNow: 'Show now', newSong: 'New song', newNotice: 'New notice',
    importSongs: 'Import songs', importBible: 'Import a Bible', edit: 'Edit', remove: 'Remove', save: 'Save', cancel: 'Cancel',
    title: 'Title', lyrics: 'Lyrics', book: 'Song book', number: 'Number', body: 'Text',
    lyricsHelp: 'Leave a blank line between verses. Start a verse with [Chorus] or [Verse 2] to name it.',
    noticeHelp: 'Put --- on its own line to start a new slide.',
    emptyService: 'Nothing here yet. Add songs, verses and notices from the library below.',
    emptySlides: 'Choose an item in the order of service.',
    clickToSend: 'Click a slide or press its number to send it live',
    secondBible: 'Second translation', none: 'None', settings: 'Settings',
    newService: 'New service', serviceName: 'Service name', text: 'Text slide',
    notFound: 'No match. Try a book and chapter, such as ps 23 or yh 3:16.',
    shortcuts: '← → SLIDES · B BLACK · C CLEAR · CTRL K SEARCH',
    message: 'Message', messageHelp: 'Shown over the slide on the projector. Press Enter to show, Esc to hide.',
    hide: 'Hide', show: 'Show', theme: 'Look', background: 'Background', textColour: 'Text colour',
    saved: 'Saved', language: 'EN', moveUp: 'Move up', moveDown: 'Move down',
    importedBible: 'Bible added', importFailed: 'Could not import', minutes: 'items'
  },
  sw: {
    service: 'Ratiba ya ibada', songs: 'Nyimbo', bible: 'Biblia', notices: 'Matangazo',
    search: 'Tafuta wimbo au mstari — mf. yh 3:16 au namba ya wimbo',
    black: 'Skrini nyeusi', restore: 'Rudisha skrini', clear: 'Futa', live: 'Hewani', next: 'Inayofuata', onAir: 'HEWANI',
    projector: 'Projekta', noSecond: 'Projekta au TV haijapatikana. Iunganishe, bonyeza Windows + P na uchague Extend. Hadi hapo, matokeo yatafunguka kama dirisha dogo.', projectorOn: 'Projekta imewashwa', projectorOff: 'Projekta imezimwa', display: 'Skrini',
    addToService: 'Ongeza kwenye ratiba', showNow: 'Onyesha sasa', newSong: 'Wimbo mpya', newNotice: 'Tangazo jipya',
    importSongs: 'Ingiza nyimbo', importBible: 'Ingiza Biblia', edit: 'Hariri', remove: 'Ondoa', save: 'Hifadhi', cancel: 'Ghairi',
    title: 'Jina', lyrics: 'Maneno', book: 'Kitabu cha nyimbo', number: 'Namba', body: 'Maandishi',
    lyricsHelp: 'Acha mstari mtupu kati ya beti. Anza ubeti kwa [Kiitikio] au [Ubeti 2] kuupa jina.',
    noticeHelp: 'Andika --- peke yake kwenye mstari kuanza slaidi mpya.',
    emptyService: 'Bado hakuna kitu. Ongeza nyimbo, mistari na matangazo kutoka maktaba hapa chini.',
    emptySlides: 'Chagua kipengele kwenye ratiba ya ibada.',
    clickToSend: 'Bonyeza slaidi au namba yake ili ionekane hewani',
    secondBible: 'Tafsiri ya pili', none: 'Hakuna', settings: 'Mipangilio',
    newService: 'Ibada mpya', serviceName: 'Jina la ibada', text: 'Slaidi ya maandishi',
    notFound: 'Haikupatikana. Jaribu kitabu na sura, mf. zab 23 au yh 3:16.',
    shortcuts: '← → SLAIDI · B NYEUSI · C FUTA · CTRL K TAFUTA',
    message: 'Ujumbe', messageHelp: 'Unaonekana juu ya slaidi. Bonyeza Enter kuonyesha, Esc kuficha.',
    hide: 'Ficha', show: 'Onyesha', theme: 'Mwonekano', background: 'Rangi ya nyuma', textColour: 'Rangi ya maandishi',
    saved: 'Imehifadhiwa', language: 'SW', moveUp: 'Juu', moveDown: 'Chini',
    importedBible: 'Biblia imeongezwa', importFailed: 'Imeshindikana kuingiza', minutes: 'vipengele'
  }
};

export function makeT(lang) {
  const d = T[lang] || T.en;
  return (key) => d[key] ?? T.en[key] ?? key;
}
