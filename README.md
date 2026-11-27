# Mwanga

**Let the Word be seen.** Church projection software by ChurchyCodes: songs, Bible verses and notices on the projector or TV, controlled from the church computer. Works fully offline.

## What V1 does

- **Order of service**: build each service from songs, Bible passages and notices, reorder items, keep several services.
- **Songs**: write or paste lyrics (blank line between verses, `[Chorus]` or `[Verse 2]` to name a section), song book and number, search by title, number or words. Import plain-text songs and OpenLyrics `.xml` (exported by OpenLP and others).
- **Bible**: King James Version included. Type a reference in English or Swahili — `jn 3:16`, `yh 3:16`, `zab 23`, `1 kor 13:4-7`, `Matendo 2:38` — and press Enter to show it. Show a second translation under each verse. Import more Bibles as Zefania XML, USFM (one or more book files) or JSON.
- **Projector window**: opens full screen on the second screen (projector or TV), text shrinks to fit, Atkinson Hyperlegible for reading from the back of the hall. With only one screen it opens as a preview window.
- **Live control**: click a slide or press its number; arrows, Space, Page Up / Page Down (presentation clickers work); **B** black screen, **C** clear, **Ctrl K** search. Live and Next previews.
- **Message**: show a short message over the slide (for example a parent called to the nursery).
- **Look**: background and text colours.
- **English first**, with the whole interface in Swahili one click away (EN / SW).
- **Safe saving**: everything saves automatically; files are written atomically with a backup, and after a crash or power cut Mwanga reopens on the slide that was live.

## New in 0.5: pictures and videos

Library → **Media**:
- **Add pictures and videos** (JPG, PNG, GIF, WebP; MP4, MOV, WebM, MKV). They are copied into Mwanga's folder, so they keep working if the original is moved or the USB stick is removed.
- **Backgrounds**: choose a default background (picture, or a silent looping video) for songs, verses and notices, and how much to darken it. Any item can have its own background or none (picker above the slides).
- **Posters and announcements**: show a picture on its own, full screen.
- **Videos**: play with sound on the projector. Under the Live preview: Pause/Play, Restart, Repeat, Volume and the time played. The phone remote can pause and restart too.

## New in 0.4: song follower

While listening is on, Mwanga also listens to the singing:
- **Recognises songs from the church's library** as they start, from a few sung words (even mis-heard ones, and Swahili heard with odd spacing), and offers **♪ Show <song>** at the right verse or chorus.
- **Follows the live song**: puts up the next slide as the singers reach the end of the current one, and jumps to the verse or chorus actually being sung. Any arrow key or click takes back control; it waits a few seconds after the operator moves.
- Only songs in the library: Mwanga never fetches lyrics from the internet (copyright, and churches are often offline).
- Right panel → **Listen**: switches for verses, songs and following.

## New in 0.3: verse finder

Mwanga listens to the sermon and suggests the Bible verses the preacher mentions — "John chapter three verse sixteen", "Yohana sura ya tatu mstari wa kumi na sita", "Zaburi ishirini na tatu". The operator presses **Show** (or **V**); nothing goes on screen by itself. Right panel → **Listen**.

- Speech recognition (Whisper) runs on the church PC in its own process. Audio never leaves the computer. The model downloads once: about 80 MB (Fast) or 250 MB (Better).
- English works well with Fast. For Swahili choose Better; it still needs testing with real preachers.
- The GitHub check `listen` speaks test sentences with a computer voice and runs the real model on them (`node scripts/listen-smoke.mjs fast|better`).

## New in 0.2

- **Preacher's screen**: a third screen (or a tablet) showing the slide now and next, the clock, a service timer (count up or count down with warnings) and messages from the operator ("5 minutes left"). Right panel → **Preacher**.
- **Phone remote**: any phone on the church Wi-Fi controls Mwanga — next/back, black, clear, any verse, jump to any item or slide, message the preacher. Right panel → **Phone** → scan the QR code. Protected by a PIN; nothing is reachable from the internet.
- **Import from EasyWorship** (6 and 7: finds the song database on the PC by itself, or choose Songs.db + SongWords.db or an .ewsx export) and **VideoPsalm** song books (.json). Songs already in Mwanga are skipped.
- **Automatic updates** from GitHub Releases. Mwanga asks before downloading (data costs money) and installs when it is closed, never during a service.
- **New icon**: the sun rising over the horizon.

## Releasing an update

1. Change `version` in package.json (for example 0.2.1) and commit.
2. Push to `main`.
3. GitHub Actions builds the installer and publishes release v0.2.1. Every installed Mwanga offers the update within a few hours.

## Run it

```bash
npm install
npm run dev        # Vite + Electron with hot reload
npm test           # unit tests (references, songs, Bible import, slides)
npm run dist:win   # Windows installer in release/ (run on Windows)
```

`npm run dev` also works in a plain browser at http://localhost:5173 for quick design work; the output then opens in a second tab.

Every push to `main` builds a Windows installer on GitHub Actions (**Actions → Build → Mwanga-Windows-installer**).

## Project layout

```
electron/main.cjs      windows, displays, file storage, Bible files
electron/preload.cjs   the only bridge the pages can use (contextIsolation on, sandboxed)
src/operator/          operator screen (React)
src/output/            projector screen
src/lib/               references, songs, slides, Bible import, interface text — plain JS, unit tested
data/bibles/kjv.json   King James Version (public domain)
```

Data lives in the user's app-data folder (`%APPDATA%/Mwanga` on Windows): `library.json`, `settings.json`, `session.json`, and `bibles/` for imported Bibles.

## Bibles and songs: licences

- The **KJV** is public domain and ships with the app.
- The **Swahili Union Version**, **Biblia Habari Njema** and other Bible Society of Tanzania texts are copyrighted. Do not bundle them until ChurchyCodes has written permission. Churches can import a Bible they are licensed to use.
- The **Swahili Unlocked Literal Bible** (Door43) is CC BY-SA 4.0 and can be imported from its USFM files today.
- Hymn books (Tenzi za Rohoni, Nyimbo za Kristo and others) and gospel songs need permission from their publishers before Mwanga ships them. Churches type in or import the songs they use.

## Next

Code signing or Microsoft Store, backup and restore, backgrounds (images and video), cloud sync between branches, mobile-money subscriptions.
