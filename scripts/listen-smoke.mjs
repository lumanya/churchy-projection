// Real end-to-end check of the verse finder (run on GitHub Actions, which can download the model):
// computer-generated speech → Whisper → reference finder. Needs espeak-ng and ffmpeg.
//   node scripts/listen-smoke.mjs [fast|better]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTranscriber } from '../electron/listener-core.mjs';
import { findSpokenReferences } from '../src/lib/spokenRefs.js';
import { buildSongIndex, identifySong } from '../src/lib/songMatch.js';
import { defaultLibrary } from '../src/lib/defaults.js';

const quality = process.argv[2] || 'fast';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mwanga-listen-'));

const cases = [
  { lang: 'en', voice: 'en', text: 'Church, please turn with me to John chapter three verse sixteen.', expect: 'JHN 3:16', required: true },
  { lang: 'en', voice: 'en', text: 'Our reading today is from Romans chapter eight, verse twenty eight.', expect: 'ROM 8:28', required: true },
  { lang: 'sw', voice: 'sw', text: 'Ndugu zangu, tusome Yohana sura ya tatu mstari wa kumi na sita.', expect: 'JHN 3:16', required: false },
  { lang: 'sw', voice: 'sw', text: 'Tufungue Biblia zetu, Zaburi ishirini na tatu.', expect: 'PSA 23', required: false }
];

function speak(text, voice, name) {
  const wav = path.join(tmp, name + '.wav');
  const raw = path.join(tmp, name + '.f32');
  execFileSync('espeak-ng', ['-v', voice, '-s', '150', '-w', wav, text]);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', wav, '-ac', '1', '-ar', '16000', '-f', 'f32le', raw]);
  const buf = fs.readFileSync(raw);
  return new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
}

const t0 = Date.now();
const asr = await createTranscriber({ quality, cacheDir: path.resolve('.models') });
console.log(`model ${asr.model} ready in ${Date.now() - t0} ms`);

let failed = 0;
for (const [i, c] of cases.entries()) {
  const audio = speak(c.text, c.voice, `case${i}`);
  const t1 = Date.now();
  const heard = await asr.transcribe(audio, c.lang);
  const ms = Date.now() - t1;
  const refs = findSpokenReferences(heard).map((r) => `${r.book} ${r.chapter}${r.from ? ':' + r.from : ''}`);
  const ok = refs.includes(c.expect);
  console.log(`${ok ? 'PASS' : c.required ? 'FAIL' : 'MISS'} [${c.lang}] ${(audio.length / 16000).toFixed(1)} s audio in ${ms} ms`);
  console.log(`     said:  ${c.text}`);
  console.log(`     heard: ${heard}`);
  console.log(`     found: ${refs.join(', ') || '(none)'}  expected ${c.expect}`);
  if (!ok && c.required) failed++;
}
// Songs: the computer voice reads lines of a hymn; Mwanga must say which library song it is.
const library = defaultLibrary();
const extra = [
  { id: 'holy', title: 'Holy, Holy, Holy', lyrics: '[Verse 1]\nHoly holy holy Lord God Almighty\nEarly in the morning our song shall rise to thee' },
  { id: 'friend', title: 'What a Friend We Have in Jesus', lyrics: '[Verse 1]\nWhat a friend we have in Jesus\nAll our sins and griefs to bear' }
];
const index = buildSongIndex([...library.songs, ...extra]);
const songCases = [
  { lang: 'en', voice: 'en', text: 'How precious did that grace appear, the hour I first believed.', expect: 'Amazing Grace', required: true },
  { lang: 'en', voice: 'en', text: 'What a friend we have in Jesus, all our sins and griefs to bear.', expect: 'What a Friend We Have in Jesus', required: true },
  { lang: 'sw', voice: 'sw', text: 'Tunakusifu, tunakuabudu, wewe ni mwema milele.', expect: 'Asante Bwana (example)', required: false }
];
for (const [i, c] of songCases.entries()) {
  const audio = speak(c.text, c.voice, `song${i}`);
  const heard = await asr.transcribe(audio, c.lang);
  const g = identifySong(heard, index);
  const ok = g && g.title === c.expect;
  console.log(`${ok ? 'PASS' : c.required ? 'FAIL' : 'MISS'} [song ${c.lang}]`);
  console.log(`     said:  ${c.text}`);
  console.log(`     heard: ${heard}`);
  console.log(`     song:  ${g ? g.title + ' (slide ' + (g.slide + 1) + ')' : '(none)'}  expected ${c.expect}`);
  if (!ok && c.required) failed++;
}
// Computer-generated Swahili is much harder to understand than a real preacher; a miss there is reported, not fatal.
process.exit(failed ? 1 : 0);
