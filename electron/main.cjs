// Mwanga — Electron main process.
// Windows: the operator screen, the projector output, and the preacher's (stage) screen.
// Also: file storage, Bible files, the phone-remote server on the church Wi-Fi, and updates.
const { app, BrowserWindow, ipcMain, screen, dialog, shell, session, utilityProcess, protocol, safeStorage, net } = require('electron');
const { Readable } = require('node:stream');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');

const DEV = !!process.env.MWANGA_DEV;
const DEV_URL = 'http://localhost:5173';
const DIST = path.join(__dirname, '..', 'dist');
const userDir = () => app.getPath('userData');
const bundledBibles = path.join(__dirname, '..', 'data', 'bibles');
const userBibles = () => path.join(userDir(), 'bibles');

// Pictures and videos the church adds are copied into Mwanga's own folder and served to the windows
// as mwanga-media://m/<file>, so they keep working if the original is moved or the USB stick is taken out.
protocol.registerSchemesAsPrivileged([{ scheme: 'mwanga-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);
const mediaDir = () => path.join(app.getPath('userData'), 'media');
const MEDIA_TYPES = {
  '.jpg': ['image', 'image/jpeg'], '.jpeg': ['image', 'image/jpeg'], '.png': ['image', 'image/png'], '.gif': ['image', 'image/gif'],
  '.webp': ['image', 'image/webp'], '.bmp': ['image', 'image/bmp'],
  '.mp4': ['video', 'video/mp4'], '.m4v': ['video', 'video/mp4'], '.mov': ['video', 'video/quicktime'], '.webm': ['video', 'video/webm'], '.mkv': ['video', 'video/x-matroska']
};

let operator = null;
let output = null;
let stage = null;
let streamWin = null;
let lastLive = { slide: null, black: false, message: '' };

// ---------- storage: plain JSON files, written atomically so a power cut never corrupts them ----------
function readJSON(name, fallback) {
  const file = path.join(userDir(), name);
  for (const f of [file, file + '.bak']) {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { /* try the backup */ }
  }
  return fallback;
}

function writeJSON(name, data) {
  const file = path.join(userDir(), name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak');
  fs.renameSync(tmp, file);
}

const safeName = (s) => String(s).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);

function listBibles() {
  const out = [];
  for (const dir of [bundledBibles, userBibles()]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const head = fs.readFileSync(path.join(dir, f), 'utf8').slice(0, 400);
        const id = (head.match(/"id":"([^"]+)"/) || [])[1] || f.replace(/\.json$/, '');
        const name = (head.match(/"name":"([^"]+)"/) || [])[1] || id;
        const short = (head.match(/"short":"([^"]+)"/) || [])[1] || '';
        const lang = (head.match(/"lang":"([^"]+)"/) || [])[1] || '';
        const license = (head.match(/"license":"([^"]+)"/) || [])[1] || '';
        out.push({ id, name, short, lang, license, file: path.join(dir, f), bundled: dir === bundledBibles });
      } catch (_) { /* skip unreadable */ }
    }
  }
  return out;
}

// ---------- windows ----------
function load(win, hash) {
  if (DEV) win.loadURL(`${DEV_URL}/#${hash}`);
  else win.loadFile(path.join(DIST, 'index.html'), { hash });
}

const ICON = path.join(__dirname, '..', 'build', 'icon.png');
const iconOpt = () => (fs.existsSync(ICON) ? { icon: ICON } : {});

const webPrefs = {
  preload: path.join(__dirname, 'preload.cjs'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true
};

const send = (win, channel, data) => { if (win && !win.isDestroyed()) win.webContents.send(channel, data); };

function createOperator() {
  operator = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 640,
    title: 'Mwanga', backgroundColor: '#171615', show: false, webPreferences: webPrefs, ...iconOpt()
  });
  operator.removeMenu();
  operator.once('ready-to-show', () => {
    operator.maximize(); operator.show();
    // a projector or TV is already connected: open the output on it straight away
    if (pickDisplay('displayId')) setTimeout(openOutput, 800);
    const s = readJSON('settings.json', {});
    if (s.stageOpen && pickDisplay('stageDisplayId', true)) setTimeout(openStage, 1200);
  });
  operator.on('closed', () => { operator = null; if (output) output.close(); if (stage) stage.close(); if (streamWin) streamWin.close(); });
  // links open in the normal browser, never inside Mwanga
  operator.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  load(operator, '/operator');
}

// key: which setting holds the chosen screen. strict: only use the chosen screen, never guess.
function pickDisplay(key, strict = false) {
  const settings = readJSON('settings.json', {});
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const chosen = displays.find((d) => d.id === settings[key]);
  if (chosen || strict) return chosen || null;
  return displays.find((d) => d.id !== primary.id && d.id !== settings.stageDisplayId)
    || displays.find((d) => d.id !== primary.id)
    || null; // no second screen
}

function makeScreenWindow(display, title, hash) {
  // videos on the projector start with sound without anyone clicking in that window
  const opts = { backgroundColor: '#000000', frame: false, show: false, title, webPreferences: { ...webPrefs, autoplayPolicy: 'no-user-gesture-required' }, ...iconOpt() };
  if (display) Object.assign(opts, { x: display.bounds.x, y: display.bounds.y, width: display.bounds.width, height: display.bounds.height, fullscreen: true });
  else Object.assign(opts, { width: 960, height: 540, frame: true }); // no extra screen: a preview window to test with
  const win = new BrowserWindow(opts);
  win.removeMenu();
  win.setMenuBarVisibility(false);
  win.once('ready-to-show', () => win.showInactive());
  win.webContents.on('did-finish-load', () => send(win, 'live:update', lastLive));
  load(win, hash);
  return win;
}

function openOutput() {
  if (output) { output.show(); return; }
  output = makeScreenWindow(pickDisplay('displayId'), 'Mwanga output', '/output');
  output.on('closed', () => { output = null; send(operator, 'output:state', false); });
  send(operator, 'output:state', true);
}
function closeOutput() { if (output) output.close(); }

function openStage() {
  if (stage) { stage.show(); return; }
  stage = makeScreenWindow(pickDisplay('stageDisplayId', true), 'Mwanga preacher screen', '/stage');
  stage.on('closed', () => { stage = null; send(operator, 'stage:state', false); });
  send(operator, 'stage:state', true);
}
function closeStage() { if (stage) stage.close(); }

// Livestream view on a screen output (for a capture card into the OBS computer).
function streamHash() {
  const s = readJSON('settings.json', {});
  const q = new URLSearchParams({ style: s.streamStyle === 'full' ? 'full' : 'lower', key: ['green', 'black', 'blue'].includes(s.streamKey) ? s.streamKey : 'green', scale: String(s.streamScale || 1) });
  return `/stream?${q}`;
}
function openStream() {
  if (streamWin) { streamWin.show(); return; }
  streamWin = makeScreenWindow(pickDisplay('streamDisplayId', true), 'Mwanga livestream', streamHash());
  streamWin.on('closed', () => { streamWin = null; send(operator, 'stream:state', false); });
  send(operator, 'stream:state', true);
}
function closeStream() { if (streamWin) streamWin.close(); }

// ---------- phone remote: a small web server on the church Wi-Fi ----------
// Phones open http://<this PC>:<port>/?pin=1234 and get the same React app (remote and preacher views).
// Every request must carry the PIN. Nothing is reachable from the internet unless the church's router forwards it.
// pin: full control (phones). view: watch only (the livestream page in OBS).
const remote = { server: null, server80: null, port: 0, pin: '', view: '', tv: '', clients: new Set(), failures: new Map() };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.json': 'application/json' };

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  // Wi-Fi and Ethernet ranges first; virtual adapters (VirtualBox, VPN) last
  return out.sort((a, b) => (/^192\.168\./.test(b) - /^192\.168\./.test(a)));
}

function remoteInfo() {
  const ips = lanAddresses();
  return {
    on: !!remote.server, port: remote.port, pin: remote.pin, clients: remote.clients.size,
    urls: ips.map((ip) => `http://${ip}:${remote.port}/?pin=${remote.pin}`),
    view: remote.view,
    streamUrls: ips.map((ip) => `http://${ip}:${remote.port}/?view=${remote.view}#/stream`),
    // short enough to type with a TV remote: opens the preacher's screen, watch only
    tvCode: remote.tv,
    // on port 80 too when the computer allows it, so the TV address needs no ":8765" (hard to type on a TV remote)
    tvUrls: ips.map((ip) => (remote.server80 ? `http://${ip}/tv/${remote.tv}` : `http://${ip}:${remote.port}/tv/${remote.tv}`))
  };
}

const same = (a, b) => a.length === b.length && a.length > 0 && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
// 'control' with the PIN, 'view' with the watch-only link, otherwise null
function access(req, url) {
  const ip = req.socket.remoteAddress;
  const fails = remote.failures.get(ip) || 0;
  if (fails >= 20) return null; // too many wrong tries from one device
  const pin = url.searchParams.get('pin') || req.headers['x-mwanga-pin'] || '';
  const view = url.searchParams.get('view') || '';
  const level = pin && same(pin, remote.pin) ? 'control' : view && same(view, remote.view) ? 'view' : null;
  if (!level) remote.failures.set(ip, fails + 1);
  else remote.failures.delete(ip);
  return level;
}

function broadcast() {
  const msg = `data: ${JSON.stringify(lastLive)}\n\n`;
  for (const res of remote.clients) res.write(msg);
}

function handleRemote(req, res) {
  const url = new URL(req.url, 'http://x');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  if (url.pathname.startsWith('/api/')) {
    const level = access(req, url);
    if (!level) { res.writeHead(401); res.end('Wrong PIN'); return; }
    if (url.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify(lastLive)}\n\n`);
      remote.clients.add(res);
      send(operator, 'remote:info', remoteInfo());
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { clearInterval(ping); remote.clients.delete(res); send(operator, 'remote:info', remoteInfo()); });
      return;
    }
    if (url.pathname.startsWith('/api/media/')) {
      const file = mediaPath(url.pathname.slice('/api/media/'.length));
      const ext = file ? path.extname(file).toLowerCase() : '';
      if (!file || (MEDIA_TYPES[ext] || [])[0] !== 'image') { res.writeHead(404); res.end(); return; } // pictures only: videos would flood the Wi-Fi
      res.writeHead(200, { 'Content-Type': MEDIA_TYPES[ext][1] });
      fs.createReadStream(file).pipe(res);
      return;
    }
    if (url.pathname === '/api/command' && level !== 'control') { res.writeHead(403); res.end('This link can only watch'); return; }
    if (url.pathname === '/api/command' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 10000) req.destroy(); });
      req.on('end', () => {
        try {
          const cmd = JSON.parse(body);
          if (!cmd || typeof cmd.type !== 'string') throw new Error('bad');
          send(operator, 'remote:command', cmd);
          res.writeHead(204); res.end();
        } catch (_) { res.writeHead(400); res.end(); }
      });
      return;
    }
    res.writeHead(404); res.end(); return;
  }
  // a TV's browser: /tv/<code> opens the preacher's screen, watch only; without the right code, a page that asks for it
  // "/tv/7709", and also "/8765/tv/7709" (the colon before the port typed as a slash on a TV keyboard)
  const tv = /^(?:\/\d{2,5})?\/tv(?:\/(\d{0,8}))?\/?$/.exec(url.pathname);
  if (tv) {
    const ip = req.socket.remoteAddress;
    const fails = remote.failures.get(ip) || 0;
    if (tv[1] && fails < 20 && same(tv[1], remote.tv)) {
      remote.failures.delete(ip);
      res.writeHead(302, { Location: `/?view=${remote.view}#/stage` }); res.end(); return;
    }
    if (tv[1]) remote.failures.set(ip, fails + 1);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>Mwanga</title><body style="margin:0;height:100vh;display:grid;place-items:center;background:#171615;color:#F3F0EA;font:24px system-ui"><form onsubmit="location.href='/tv/'+document.getElementById('c').value.replace(/\\D/g,'');return false" style="display:flex;flex-direction:column;gap:16px;align-items:center"><div style="font-weight:700;font-size:34px">Mwanga · Preacher screen</div><div>${tv[1] ? 'That code is not right. ' : ''}Type the TV code shown in Mwanga → Preacher</div><input id="c" inputmode="numeric" autofocus style="font:40px monospace;width:200px;text-align:center;padding:10px"><button style="font:24px system-ui;padding:10px 30px">Open</button></form></body>`);
    return;
  }
  // static files from the built app
  let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

function startRemote() {
  if (remote.server) return Promise.resolve(remoteInfo());
  const s = readJSON('settings.json', {});
  remote.pin = s.remotePin && /^\d{4,6}$/.test(s.remotePin) ? s.remotePin : String(crypto.randomInt(1000, 9999));
  // the OBS link stays the same week after week, so the livestream computer is set up once
  remote.view = s.streamToken && /^[a-f0-9]{12}$/.test(s.streamToken) ? s.streamToken : crypto.randomBytes(6).toString('hex');
  // the TV's address stays the same too, so a bookmark on the TV works every Sunday
  remote.tv = s.tvCode && /^\d{4}$/.test(s.tvCode) ? s.tvCode : String(crypto.randomInt(1000, 9999));
  return new Promise((resolve) => {
    const server = http.createServer(handleRemote);
    // the same port every week, so phones that saved the link keep working; another port if it's taken
    const tryPort = (p, left) => {
      const onError = (e) => {
        if (e.code === 'EADDRINUSE' && left) tryPort(p + 1, left - 1);
        else { remote.server = null; resolve(remoteInfo()); }
      };
      server.once('error', onError);
      server.listen(p, '0.0.0.0', () => {
        server.off('error', onError); remote.server = server; remote.port = p;
        // the same pages on port 80 if it is free: then "http://192.168.x.x/tv/1234" works without a port number
        const s80 = http.createServer(handleRemote);
        s80.once('error', () => { remote.server80 = null; resolve(remoteInfo()); });
        s80.listen(80, '0.0.0.0', () => { remote.server80 = s80; resolve(remoteInfo()); });
      });
    };
    tryPort(8765, 10);
  });
}

function stopRemote() {
  for (const res of remote.clients) res.end();
  remote.clients.clear();
  if (remote.server) remote.server.close();
  if (remote.server80) remote.server80.close();
  remote.server = null;
  remote.server80 = null;
  return remoteInfo();
}

// ---------- automatic updates ----------
// Mwanga checks GitHub Releases. It asks before downloading (many churches pay for mobile data)
// and installs when Mwanga is closed, never in the middle of a service.
let updater = null;
let updateState = { state: 'idle' };
function setUpdate(s) { updateState = s; send(operator, 'update:status', s); }
function setupUpdates() {
  if (DEV || !app.isPackaged || process.env.MWANGA_SCREENSHOT) return;
  try { updater = require('electron-updater').autoUpdater; } catch (_) { return; }
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;
  updater.on('update-available', (i) => setUpdate({ state: 'available', version: i.version, size: (i.files || []).reduce((n, f) => n + (f.size || 0), 0) }));
  updater.on('update-not-available', () => setUpdate({ state: 'current', version: app.getVersion() }));
  updater.on('download-progress', (p) => setUpdate({ ...updateState, state: 'downloading', percent: Math.round(p.percent) }));
  updater.on('update-downloaded', (i) => setUpdate({ state: 'ready', version: i.version }));
  updater.on('error', () => setUpdate({ state: 'idle' })); // offline: try again later, quietly
  const check = () => updater.checkForUpdates().catch(() => {});
  setTimeout(check, 15000);
  setInterval(check, 4 * 60 * 60 * 1000);
}

// ---------- listening to the preacher ----------
// Whisper runs in a separate utility process on this PC. Audio never leaves the computer;
// the internet is only used once, to download the speech model.
let listener = null;
let listenerReady = false;
function startListener(quality) {
  stopListener();
  if (process.env.MWANGA_SCREENSHOT && !process.env.MWANGA_LISTEN_REAL) return true; // the check below feeds pretend speech
  listenerReady = false;
  listener = utilityProcess.fork(path.join(__dirname, 'listener.mjs'), [], { serviceName: 'Mwanga listener' });
  listener.on('message', (m) => { if (m.type === 'ready') listenerReady = true; send(operator, 'listen:event', m); });
  listener.on('exit', (code) => { listener = null; listenerReady = false; send(operator, 'listen:event', { type: 'stopped', code }); });
  listener.postMessage({ type: 'init', quality, cacheDir: path.join(userDir(), 'models') });
  return true;
}
function stopListener() { if (listener) { listener.kill(); listener = null; listenerReady = false; } }

ipcMain.handle('listen:start', (_e, quality) => startListener(quality === 'better' ? 'better' : 'fast'));
ipcMain.handle('listen:stop', () => { stopListener(); return true; });
ipcMain.on('listen:audio', (_e, samples, language) => {
  if (listener && listenerReady && samples && samples.length <= 16000 * 12) listener.postMessage({ type: 'audio', samples, language });
});

// ---------- media ----------
function serveMediaFile(file, rangeHeader) {
  const ext = path.extname(file).toLowerCase();
  const type = (MEDIA_TYPES[ext] || [null, 'application/octet-stream'])[1];
  const size = fs.statSync(file).size;
  const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader || '');
  if (m) { // videos ask for pieces so the operator can jump around
    const start = m[1] ? parseInt(m[1], 10) : Math.max(0, size - parseInt(m[2], 10));
    const end = m[1] && m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
    if (start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), {
      status: 206,
      headers: { 'Content-Type': type, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' }
    });
  }
  // Allow-Origin: Mwanga's own pages may read the pixels (to make small previews)
  return new Response(Readable.toWeb(fs.createReadStream(file)), { headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' } });
}

function mediaPath(name) {
  const base = path.basename(decodeURIComponent(name || '')); // never outside the media folder
  const file = path.join(mediaDir(), base);
  return base && fs.existsSync(file) ? file : null;
}

function importMediaPaths(paths) {
  fs.mkdirSync(mediaDir(), { recursive: true });
  const out = [];
  for (const p of paths) {
    const ext = path.extname(p).toLowerCase();
    if (!MEDIA_TYPES[ext]) continue;
    const id = crypto.randomBytes(6).toString('hex');
    const file = id + ext;
    fs.copyFileSync(p, path.join(mediaDir(), file));
    out.push({ id, file, kind: MEDIA_TYPES[ext][0], name: path.basename(p, path.extname(p)), size: fs.statSync(p).size, addedAt: Date.now() });
  }
  return out;
}

ipcMain.handle('media:import', async () => {
  // the automatic check passes its own files instead of opening the file picker
  if (process.env.MWANGA_TEST_MEDIA) return importMediaPaths(process.env.MWANGA_TEST_MEDIA.split(';'));
  const r = await dialog.showOpenDialog(operator, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Pictures and videos', extensions: Object.keys(MEDIA_TYPES).map((e) => e.slice(1)) }]
  });
  return r.canceled ? [] : importMediaPaths(r.filePaths.slice(0, 100));
});
const thumbDir = () => path.join(mediaDir(), 'thumbs');
ipcMain.handle('media:remove', (_e, m) => {
  const entry = typeof m === 'string' ? { file: m } : (m || {});
  const f = mediaPath(entry.file);
  if (f) fs.unlinkSync(f);
  if (entry.thumb) { const t = path.join(thumbDir(), path.basename(entry.thumb)); if (fs.existsSync(t)) fs.unlinkSync(t); }
  return true;
});
// small preview pictures, made by the operator screen when media is added, so long lists scroll smoothly
ipcMain.handle('media:saveThumb', (_e, id, dataUrl) => {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m || !/^[a-f0-9]{6,24}$/.test(String(id))) return null;
  fs.mkdirSync(thumbDir(), { recursive: true });
  const name = `${id}.jpg`;
  fs.writeFileSync(path.join(thumbDir(), name), Buffer.from(m[1], 'base64'));
  return name;
});

// the projector reports how far a video has played; the operator screen shows it
ipcMain.on('video:progress', (_e, p) => send(operator, 'video:progress', p));

// ---------- Ask AI: find a verse from what someone remembers of its meaning ----------
// Works with Claude, ChatGPT, Gemini or any OpenAI-compatible service (see ai.cjs).
// Keys are kept encrypted with Windows' own protection (safeStorage), and only this process uses them.
// Only the words the operator typed are sent. The AI returns references; Mwanga shows its own Bible text.
const AI = require('./ai.cjs');
const aiKeysFile = () => path.join(userDir(), 'ai-keys.bin');
const oldAiKeyFile = () => path.join(userDir(), 'ai-key.bin'); // 0.8.0 kept one Anthropic key here
function readAiKeys() {
  try {
    const buf = fs.readFileSync(aiKeysFile());
    return JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8')) || {};
  } catch (_) { /* none yet */ }
  try {
    const buf = fs.readFileSync(oldAiKeyFile());
    const k = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
    return k ? { anthropic: k } : {};
  } catch (_) { return {}; }
}
function writeAiKeys(keys) {
  fs.mkdirSync(userDir(), { recursive: true });
  const text = JSON.stringify(keys);
  fs.writeFileSync(aiKeysFile(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text, 'utf8'));
  try { fs.unlinkSync(oldAiKeyFile()); } catch (_) { /* already gone */ }
}
function aiStatus() {
  const keys = readAiKeys();
  return { keys: Object.fromEntries(Object.keys(AI.PROVIDERS).map((id) => [id, !!keys[id]])), providers: AI.providerList(), encrypted: safeStorage.isEncryptionAvailable() };
}
ipcMain.handle('ai:status', () => aiStatus());
ipcMain.handle('ai:setKey', (_e, provider, key) => {
  if (!AI.PROVIDERS[provider]) return aiStatus();
  const keys = readAiKeys();
  const k = String(key || '').trim();
  if (k) keys[provider] = k; else delete keys[provider];
  writeAiKeys(keys);
  return aiStatus();
});

async function aiCall(cfg, build, seconds) {
  const { id, p, base } = AI.resolve(cfg);
  const key = readAiKeys()[id] || '';
  if (!base) return { error: 'nourl' };
  if (!key && !p.keyOptional) return { error: 'nokey' };
  const { url, init } = build(key);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), seconds * 1000);
  try {
    const res = await net.fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { error: AI.errorKind(res.status, body), status: res.status };
    }
    return { data: await res.json() };
  } catch (e) {
    return { error: controller.signal.aborted ? 'timeout' : 'offline' };
  } finally { clearTimeout(timer); }
}

ipcMain.handle('ai:findVerses', async (_e, query, cfg) => {
  // 0.8.0 passed only a model name
  const c = typeof cfg === 'string' || !cfg ? { provider: 'anthropic', model: cfg || '' } : cfg;
  const started = Date.now();
  const r = await aiCall(c, (key) => AI.verseRequest(c, key, query), 45);
  const info = { model: AI.resolve(c).model, seconds: Math.round((Date.now() - started) / 100) / 10 };
  if (r.error) return { ...r, ...info };
  return { refs: AI.parseRefs(AI.answerText(r.data)), ...info };
});
// the page where each service hands out keys; only these fixed addresses are opened
ipcMain.handle('ai:openKeyPage', (_e, provider) => {
  const p = AI.PROVIDERS[provider];
  if (!p || !p.keyUrl) return false;
  shell.openExternal(p.keyUrl);
  return true;
});
ipcMain.handle('ai:models', async (_e, cfg) => {
  const r = await aiCall(cfg || {}, (key) => AI.modelsRequest(cfg || {}, key), 15);
  if (r.error) return r;
  return AI.modelList(AI.resolve(cfg).id, r.data);
});

// ---------- IPC ----------
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('store:load', () => ({
  library: readJSON('library.json', null),
  settings: readJSON('settings.json', null),
  session: readJSON('session.json', null)
}));
ipcMain.handle('store:save', (_e, name, data) => {
  if (!['library.json', 'settings.json', 'session.json'].includes(name)) throw new Error('bad file');
  writeJSON(name, data);
  return true;
});

ipcMain.handle('bible:list', () => listBibles().map(({ file, ...b }) => b));
ipcMain.handle('bible:load', (_e, id) => {
  const b = listBibles().find((x) => x.id === id);
  if (!b) return null;
  return fs.readFileSync(b.file, 'utf8');
});
ipcMain.handle('bible:save', (_e, bible) => {
  if (!bible || !bible.books || !bible.id) throw new Error('bad bible');
  fs.mkdirSync(userBibles(), { recursive: true });
  const id = safeName(bible.id) || 'bible';
  fs.writeFileSync(path.join(userBibles(), id + '.json'), JSON.stringify({ ...bible, id }));
  return id;
});
// ---------- Get more Bibles: open-licensed versions from eBible.org ----------
// Only the versions in bibleCatalog.json, only from eBible.org. The operator screen unzips and reads them.
const BIBLE_CATALOG = require('./bibleCatalog.json');
ipcMain.handle('bibles:catalog', () => BIBLE_CATALOG);
ipcMain.handle('bibles:download', async (_e, id) => {
  const entry = BIBLE_CATALOG.find((c) => c.id === id);
  if (!entry) return { error: 'unknown' };
  // MWANGA_CATALOG_BASE lets the automatic check use a stand-in server
  const url = (process.env.MWANGA_CATALOG_BASE || 'https://eBible.org/Scriptures/') + entry.file;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10 * 60 * 1000);
  try {
    const res = await net.fetch(url, { signal: controller.signal });
    if (!res.ok) return { error: 'http', status: res.status };
    const total = Number(res.headers.get('content-length')) || 0;
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    let last = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      received += value.length;
      if (Date.now() - last > 250) { last = Date.now(); send(operator, 'bibles:progress', { id, received, total }); }
    }
    send(operator, 'bibles:progress', { id, received, total: total || received });
    return { data: Buffer.concat(chunks) };
  } catch (e) {
    return { error: controller.signal.aborted ? 'timeout' : 'offline' };
  } finally { clearTimeout(timer); }
});
ipcMain.handle('bible:remove', (_e, id) => {
  const b = listBibles().find((x) => x.id === id && !x.bundled);
  if (b) fs.unlinkSync(b.file);
  return true;
});

ipcMain.handle('displays:list', () => {
  const primary = screen.getPrimaryDisplay();
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id, label: `${d.label || 'Screen ' + (i + 1)} · ${d.size.width}×${d.size.height}${d.id === primary.id ? ' (main)' : ''}`
  }));
});
ipcMain.handle('output:isOpen', () => !!output);
ipcMain.handle('output:open', () => { openOutput(); return true; });
ipcMain.handle('output:close', () => { closeOutput(); return true; });
ipcMain.handle('output:move', () => { closeOutput(); setTimeout(openOutput, 300); return true; });
ipcMain.handle('stage:isOpen', () => !!stage);
ipcMain.handle('stage:open', () => { openStage(); return true; });
ipcMain.handle('stage:close', () => { closeStage(); return true; });
ipcMain.handle('stage:move', () => { const was = !!stage; closeStage(); if (was) setTimeout(openStage, 300); return true; });

ipcMain.handle('stream:isOpen', () => !!streamWin);
ipcMain.handle('stream:open', () => { openStream(); return true; });
ipcMain.handle('stream:close', () => { closeStream(); return true; });
ipcMain.handle('stream:move', () => { const was = !!streamWin; closeStream(); if (was) setTimeout(openStream, 300); return true; });
ipcMain.handle('remote:start', () => startRemote());
ipcMain.handle('remote:stop', () => stopRemote());
ipcMain.handle('remote:info', () => remoteInfo());
ipcMain.handle('remote:qr', async (_e, text) => require('qrcode').toDataURL(String(text).slice(0, 300), { margin: 1, width: 360, color: { dark: '#1A0A00', light: '#FFFFFF' } }));

ipcMain.handle('update:status', () => updateState);
ipcMain.handle('update:download', () => { if (updater) { setUpdate({ ...updateState, state: 'downloading', percent: 0 }); updater.downloadUpdate().catch(() => setUpdate({ state: 'idle' })); } return true; });
ipcMain.handle('update:install', () => { if (updater) setImmediate(() => updater.quitAndInstall(false, true)); return true; });

ipcMain.on('live:set', (_e, live) => {
  lastLive = live;
  send(output, 'live:update', live);
  send(stage, 'live:update', live);
  send(streamWin, 'live:update', live);
  broadcast();
});

ipcMain.handle('file:open', async (_e, filters, binary) => {
  const r = await dialog.showOpenDialog(operator, { properties: ['openFile', 'multiSelections'], filters });
  if (r.canceled) return [];
  return r.filePaths.slice(0, 200).map((p) => ({ name: path.basename(p), text: binary ? undefined : fs.readFileSync(p, 'utf8'), data: binary ? fs.readFileSync(p) : undefined }));
});

// EasyWorship keeps its song database in a known place. Find it so churches can import with one click.
ipcMain.handle('easyworship:find', () => {
  const roots = [
    path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Documents', 'Softouch', 'EasyWorship'),
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Softouch', 'EasyWorship')
  ];
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 5 || !fs.existsSync(dir)) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    const names = entries.map((e) => e.name.toLowerCase());
    if (names.includes('songs.db') && names.includes('songwords.db')) {
      const st = fs.statSync(path.join(dir, entries[names.indexOf('songs.db')].name));
      found.push({ dir, modified: st.mtimeMs });
    }
    for (const e of entries) if (e.isDirectory()) walk(path.join(dir, e.name), depth + 1);
  };
  roots.forEach((r) => walk(r, 0));
  found.sort((a, b) => b.modified - a.modified); // the most recently used profile first
  if (!found.length) return null;
  const dir = found[0].dir;
  const read = (n) => fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => f.toLowerCase() === n)));
  return { dir, songs: read('songs.db'), words: read('songwords.db') };
});

// VideoPsalm keeps its song books (.vpc) in the public Documents folder.
ipcMain.handle('videopsalm:find', () => {
  const dir = path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Documents', 'VideoPsalm', 'SongBooks');
  if (!fs.existsSync(dir)) return null;
  return fs.readdirSync(dir).filter((f) => /\.vpc$/i.test(f)).slice(0, 100)
    .map((f) => ({ name: f, data: fs.readFileSync(path.join(dir, f)) }));
});

// ---------- app ----------
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (operator) { operator.restore(); operator.focus(); } });

// Developer check: MWANGA_SCREENSHOT=folder saves pictures of the windows and quits.
async function screenshotRun(dir) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const snap = async (win, name) => fs.writeFileSync(path.join(dir, name), (await win.webContents.capturePage()).toPNG());
  const js = (code) => operator.webContents.executeJavaScript(code);
  fs.mkdirSync(dir, { recursive: true });
  await wait(2500);
  openOutput(); openStage();
  await wait(1500);
  const press = (key) => js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)} }))`);
  await press('ArrowRight'); await wait(300);
  await press('ArrowRight'); await press('ArrowRight'); await wait(800);
  await snap(operator, 'operator.png'); await snap(output, 'output.png');
  await js(`(() => { const i = document.querySelector('.search input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'yh 3:16'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await wait(600);
  await snap(operator, 'search.png');
  await js(`document.querySelector('.result .primary').click()`);
  await wait(900);
  await snap(output, 'output-verse.png'); await snap(operator, 'operator-verse.png');
  // preacher tab: message and timer
  await js(`document.querySelector('[data-tab="stage"]').click()`); await wait(300);
  await js(`(() => { const i = document.querySelector('#stage-msg'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '5 minutes left'); i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#stage-msg-show').click(); document.querySelector('#timer-start').click(); })()`);
  await wait(2200);
  await snap(operator, 'operator-stage.png'); await snap(stage, 'stage.png');
  // verse finder: pretend the preacher said a verse in Swahili
  await js(`document.querySelector('[data-tab="listen"]').click()`); await wait(300);
  await js(`document.querySelector('#listen-toggle').click()`); await wait(500);
  send(operator, 'listen:event', { type: 'ready', model: 'test' });
  send(operator, 'listen:event', { type: 'text', text: 'Ndugu zangu, tusome Yohana sura ya tatu mstari wa kumi na sita', ms: 900 });
  await wait(800);
  await snap(operator, 'operator-listen.png');
  // first a different slide, so the check proves the suggestion changes the screen
  await press('Home'); await js(`document.querySelectorAll('.svc-main')[1].click()`); await wait(200);
  await js(`document.querySelectorAll('.slide')[0].click()`); await wait(500);
  const before = await output.webContents.executeJavaScript('document.body.innerText');
  await js(`document.querySelector('#suggest-show').click()`); await wait(900);
  const after = await output.webContents.executeJavaScript('document.body.innerText');
  fs.writeFileSync(path.join(dir, 'listen-check.json'), JSON.stringify({ before, after }));
  await snap(output, 'output-from-listen.png');
  // song follower: recognise a song from sung words, then follow along
  const outText = () => output.webContents.executeJavaScript('document.body.innerText');
  send(operator, 'listen:event', { type: 'text', text: 'how precious did that grace appear the hour I first believed', ms: 900 });
  await wait(700);
  await snap(operator, 'operator-song-suggest.png');
  await js(`document.querySelector('#song-suggest-show').click()`); await wait(800);
  const songShown = await outText();
  await js(`document.querySelectorAll('.svc-main')[1].click()`); await wait(200);
  await js(`document.querySelectorAll('.slide')[0].click()`); await wait(3500); // the follower waits after the operator moves
  const followBefore = await outText();
  send(operator, 'listen:event', { type: 'text', text: 'asante bwana kwa siku hii umetulinda usiku wote', ms: 900 });
  await wait(800);
  const followAfter = await outText();
  await snap(operator, 'operator-following.png');
  fs.writeFileSync(path.join(dir, 'song-check.json'), JSON.stringify({ songShown, followBefore, followAfter }, null, 1));
  // pictures and videos: import, browse, background, poster, video with controls
  if (process.env.MWANGA_TEST_MEDIA) {
    const outHas = (sel) => output.webContents.executeJavaScript(`!!document.querySelector(${JSON.stringify(sel)})`);
    const card = (name) => `[...document.querySelectorAll('.media-card')].find((c) => c.querySelector('.media-name').textContent === ${JSON.stringify(name)})`;
    const count = () => js(`document.querySelectorAll('.media-card').length`);
    await js(`[...document.querySelectorAll('.tabs button')].find((b) => b.textContent === 'Media').click()`); await wait(300);
    await js(`document.querySelector('#media-import').click()`); await wait(1500);
    // previews are made once, in the background
    let thumbs = 0;
    for (let i = 0; i < 40 && thumbs < 9; i++) { await wait(500); thumbs = await js(`[...document.querySelectorAll('.media-thumb img')].filter((i) => i.src.includes('/m/t/') && i.complete && i.naturalWidth > 0).length`); }
    const all = await count();
    await js(`document.querySelector('[data-kind="video"]').click()`); await wait(300);
    const videos = await count();
    await snap(operator, 'operator-media-videos.png');
    await js(`document.querySelector('[data-kind="image"]').click()`); await wait(300);
    const pictures = await count();
    await js(`document.querySelector('[data-kind="all"]').click()`); await wait(200);
    await js(`(() => { const i = document.querySelector('#media-search'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'poster'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`); await wait(300);
    const searchPoster = await js(`[...document.querySelectorAll('.media-name')].map((n) => n.textContent)`);
    await js(`(() => { const i = document.querySelector('#media-search'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); })()`); await wait(300);
    // preview a video, put it in a collection
    await js(`${card('christmas-carols')}.querySelector('.thumb-btn').click()`); await wait(1500);
    const previewPlaying = await js(`(() => { const v = document.querySelector('#preview-video'); return v ? { t: v.currentTime, muted: v.muted } : null; })()`);
    await js(`(() => { const i = document.querySelector('#preview-collection'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'Christmas'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await snap(operator, 'operator-media-preview.png');
    await js(`[...document.querySelectorAll('.preview-side button')].find((b) => b.textContent === 'Close').click()`); await wait(400);
    const collectionShown = await js(`${card('christmas-carols')}.querySelector('.media-coll')?.textContent || ''`);
    await js(`(() => { const s = document.querySelector('[aria-label="Collection"]'); s.value = 'Christmas'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await wait(300);
    const inChristmas = await js(`[...document.querySelectorAll('.media-name')].map((n) => n.textContent)`);
    await js(`(() => { const s = document.querySelector('[aria-label="Collection"]'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await wait(200);
    // the large view
    await js(`document.querySelector('#media-large').click()`); await wait(800);
    await snap(operator, 'operator-media-large.png');
    const tiles = await js(`document.querySelectorAll('.media-tiles .media-card').length`);
    await js(`[...document.querySelectorAll('.media-modal button')].find((b) => b.textContent === 'Close').click()`); await wait(300);
    // background, poster and video still work
    await js(`${card('worship-background')}.querySelectorAll('.row button')[2].click()`); await wait(300);
    await js(`document.querySelectorAll('.svc-main')[1].click()`); await wait(200);
    await js(`document.querySelectorAll('.slide')[0].click()`); await wait(1200);
    const bgLoaded = await output.webContents.executeJavaScript(`(() => { const i = document.querySelector('img.bg-fill'); return !!(i && i.complete && i.naturalWidth > 0); })()`);
    await js(`${card('building-fund-poster')}.querySelector('.primary').click()`); await wait(1200);
    const posterLoaded = await output.webContents.executeJavaScript(`(() => { const i = document.querySelector('img.media-fit'); return !!(i && i.complete && i.naturalWidth > 0); })()`);
    await js(`${card('church-clip')}.querySelector('.primary').click()`); await wait(3000);
    const videoPlaying = await output.webContents.executeJavaScript(`(() => { const v = document.querySelector('video.media-fit'); return v ? { t: v.currentTime, paused: v.paused, muted: v.muted } : null; })()`);
    fs.writeFileSync(path.join(dir, 'media-check.json'), JSON.stringify({ thumbs, all, videos, pictures, searchPoster, previewPlaying, collectionShown, inChristmas, tiles, bgLoaded, posterLoaded, videoPlaying }, null, 1));
  }
  // start the real speech engine once and record its first message (proves it loads in this build)
  process.env.MWANGA_LISTEN_REAL = '1';
  const probe = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ type: 'timeout' }), 20000);
    const p = utilityProcess.fork(path.join(__dirname, 'listener.mjs'), [], { serviceName: 'Mwanga listener probe' });
    p.on('message', (m) => { clearTimeout(timer); p.kill(); resolve(m); });
    p.on('exit', (code) => { clearTimeout(timer); resolve({ type: 'exit', code }); });
    p.postMessage({ type: 'init', quality: 'fast', cacheDir: path.join(userDir(), 'models') });
  });
  fs.writeFileSync(path.join(dir, 'listener-probe.json'), JSON.stringify(probe));
  // phone tab and the remote page as a phone would load it
  await js(`document.querySelector('[data-tab="phone"]').click()`); await wait(300);
  await js(`document.querySelector('#remote-toggle').click()`); await wait(1500);
  await snap(operator, 'operator-phone.png');
  const info = remoteInfo();
  const phone = new BrowserWindow({ width: 390, height: 844, show: false });
  await phone.loadURL(`http://127.0.0.1:${info.port}/?pin=${info.pin}#/remote`);
  await wait(2000);
  await snap(phone, 'phone-remote.png');
  await phone.webContents.executeJavaScript(`document.querySelectorAll('.rm-item')[1].click()`);
  await wait(800);
  await phone.webContents.executeJavaScript(`document.querySelector('#rm-next').click()`);
  await wait(1200);
  await snap(phone, 'phone-after-next.png'); await snap(output, 'output-after-phone.png');
  fs.writeFileSync(path.join(dir, 'phone-check.json'), JSON.stringify({ output: await output.webContents.executeJavaScript('document.body.innerText') }));
  // livestream: an OBS-like browser loads the watch-only link over the network
  {
    const info2 = remoteInfo();
    const base = `http://127.0.0.1:${info2.port}/?view=${info2.view}#/stream`;
    await js(`document.querySelectorAll('.svc-main')[1].click()`); await wait(200);
    await js(`document.querySelectorAll('.slide')[1].click()`); await wait(600);
    const obs = new BrowserWindow({ width: 1920, height: 1080, show: false });
    await obs.loadURL(`${base}?style=lower&key=transparent&scale=1`);
    await wait(2000);
    const lower = await obs.webContents.executeJavaScript(`({ text: (document.querySelector('.lower-text') || {}).innerText || '', bg: getComputedStyle(document.body).backgroundColor })`);
    await snap(obs, 'obs-lower.png');
    await obs.loadURL(`${base}?style=full&key=transparent&scale=1`);
    await wait(2000);
    const full = await obs.webContents.executeJavaScript(`(document.querySelector('.out-text') || {}).innerText || ''`);
    await snap(obs, 'obs-full.png');
    // the watch-only link must not be able to change slides
    const tryCommand = (q) => new Promise((resolve) => {
      const r = http.request({ host: '127.0.0.1', port: info2.port, path: `/api/command?${q}`, method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => resolve(res.statusCode));
      r.on('error', () => resolve(-1)); r.end(JSON.stringify({ type: 'next' }));
    });
    const viewCommand = await tryCommand(`view=${info2.view}`);
    const wrongPin = await tryCommand('pin=0000');
    // the cable option: a window with a green background
    await js(`document.querySelector('[data-tab="stream"]').click()`); await wait(300);
    await snap(operator, 'operator-stream.png');
    await js(`document.querySelector('#stream-window').click()`); await wait(1800);
    const cable = streamWin ? await streamWin.webContents.executeJavaScript(`({ text: (document.querySelector('.lower-text') || {}).innerText || '', bg: getComputedStyle(document.body).backgroundColor })`) : null;
    if (streamWin) await snap(streamWin, 'stream-window.png');
    fs.writeFileSync(path.join(dir, 'stream-check.json'), JSON.stringify({ lower, full, viewCommand, wrongPin, cable, links: info2.streamUrls }, null, 1));
    obs.destroy();
  }
  // finding verses by their words, and Ask AI (with a stand-in AI server)
  {
    const seen = [];
    const fake = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const reply = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
        const b = body ? JSON.parse(body) : {};
        seen.push({ path: req.url, model: b.model, key: req.headers['x-api-key'] || req.headers.authorization || '', maxCompletion: b.max_completion_tokens || null });
        if (req.url.startsWith('/v1/messages')) {
          if (req.headers['x-api-key'] !== 'test-key-123') return reply(401, { error: 'bad key' });
          return reply(200, { content: [{ type: 'text', text: 'Here you go: ["Jeremiah 29:11", "Romans 8:28", "Hezekiah 4:2"]' }] });
        }
        const local = b.model === 'llama3.2' || req.method === 'GET' && !req.headers.authorization;
        if (!local && req.headers.authorization !== 'Bearer sk-openai-1') return reply(401, { error: 'bad key' });
        if (req.url.startsWith('/v1/models')) return reply(200, { data: [{ id: 'gpt-6.2-astra' }, { id: 'gpt-6-luna' }, { id: 'whisper-1' }, { id: 'llama3.2' }] });
        const user = (b.messages || []).find((m) => m.role === 'user') || {};
        const refs = /gave his only son/.test(user.content || '') ? '["John 3:16"]' : '["Jeremiah 29:11", "Psalm 23:1"]';
        return reply(200, { choices: [{ message: { role: 'assistant', content: `<think>maybe [1]</think>${refs}` } }] });
      });
    });
    await new Promise((r) => fake.listen(0, '127.0.0.1', r));
    process.env.MWANGA_AI_BASE = `http://127.0.0.1:${fake.address().port}/v1`;
    const typeIn = (sel, text) => js(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(text)}); i.dispatchEvent(new Event('input', { bubbles: true })); i.focus(); })()`);
    const outText = () => output.webContents.executeJavaScript('(document.querySelector(".out-text") || {}).innerText || ""');
    // save a key in Library → Bible
    await js(`[...document.querySelectorAll('.tabs button')].find((b) => b.textContent === 'Bible').click()`); await wait(300);
    await typeIn('#ai-key', 'test-key-123'); await wait(100);
    await js(`document.querySelector('#ai-save').click()`); await wait(500);
    // modern words + Enter
    await typeIn('.search input', 'God loved the world so much that he gave his one and only son'); await wait(500);
    const wordResults = await js(`[...document.querySelectorAll('.results .result strong')].map((s) => s.textContent)`);
    await js(`document.querySelector('.search input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`); await wait(900);
    const afterEnter = await outText();
    // meaning only: words search can't find it, Ask AI can
    await typeIn('.search input', 'plans to prosper you and not to harm you'); await wait(500);
    const before = await js(`[...document.querySelectorAll('.results .result strong')].map((s) => s.textContent)`);
    await js(`document.querySelector('#ask-ai').click()`); await wait(1500);
    await snap(operator, 'operator-ask-ai.png');
    const aiTitles = await js(`(() => { const h = [...document.querySelectorAll('.result-head')].find((x) => x.textContent.includes('AI')); const out = []; let n = h && h.nextElementSibling; while (n && !n.classList.contains('result-head')) { const s = n.querySelector('strong'); if (s) out.push(s.textContent); n = n.nextElementSibling; } return out; })()`);
    await js(`[...document.querySelectorAll('.results .result')].find((r) => (r.querySelector('strong') || {}).textContent === 'Jeremiah 29:11').querySelector('.primary').click()`); await wait(900);
    const afterAi = await outText();
    // ChatGPT: choose it, save its key, press Test (which also picks the recommended model)
    const pickService = (id) => js(`(() => { const s = document.querySelector('#ai-provider'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, ${JSON.stringify(id)}); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    const testResult = async () => { await js(`document.querySelector('#ai-test').click()`); await wait(1500); return js(`({ text: (document.querySelector('#ai-test-result') || {}).textContent || '', model: document.querySelector('#ai-model').value, options: [...document.querySelectorAll('datalist option')].map((o) => o.value) })`); };
    await pickService('openai'); await wait(300);
    const services = await js(`[...document.querySelectorAll('#ai-provider option')].map((o) => o.textContent)`);
    await typeIn('#ai-key', 'sk-openai-1'); await wait(100);
    await js(`document.querySelector('#ai-save').click()`); await wait(500);
    const openaiTest = await testResult();
    await snap(operator, 'operator-ai-setup.png');
    await typeIn('.search input', 'plans to prosper you and not harm you'); await wait(500);
    await js(`document.querySelector('#ask-ai').click()`); await wait(1500);
    const openaiTitles = await js(`[...document.querySelectorAll('.results .result strong')].map((s) => s.textContent)`);
    // a model on this computer (Ollama): an address and a model name, no key
    await pickService('custom'); await wait(300);
    await typeIn('#ai-base', 'localhost:11434/v1'); await wait(100);
    await typeIn('#ai-model', 'llama3.2'); await wait(100);
    const customTest = await testResult();
    await snap(operator, 'operator-ai-custom.png');
    const keys = (await js(`window.mwanga.ai.status()`)).keys;
    fs.writeFileSync(path.join(dir, 'verse-search-check.json'), JSON.stringify({ wordResults, afterEnter, before, aiTitles, afterAi, services, openaiTest, openaiTitles, customTest, keys, keysFileExists: fs.existsSync(aiKeysFile()), oldKeyFileGone: !fs.existsSync(oldAiKeyFile()), seen }, null, 1));
    fake.close();
  }
  // Get more Bibles, from a stand-in eBible.org
  {
    const { zipSync, strToU8 } = require('fflate');
    const zip = Buffer.from(zipSync({
      'swhonen_usfm/00-FRTswhonen.usfm': strToU8('\\id FRT\n\\mt1 Biblia\n'),
      'swhonen_usfm/02-GENswhonen.usfm': strToU8('\\id GEN\n\\h Mwanzo\n\\c 1\n\\s1 Uumbaji\n\\p\n\\v 1 Hapo mwanzo Mungu aliumba mbingu na dunia.\\f + \\ft maelezo\\f*\n'),
      'swhonen_usfm/44-JHNswhonen.usfm': strToU8('\\id JHN\n\\c 3\n\\p\n\\v 16 “Kwa maana jinsi hii Mungu aliupenda ulimwengu hata akamtoa Mwanawe wa pekee.\n')
    }));
    const store = http.createServer((req, res) => {
      if (req.url.endsWith('/swhonen_usfm.zip')) { res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': zip.length }); res.end(zip); return; }
      res.writeHead(404); res.end();
    });
    await new Promise((r) => store.listen(0, '127.0.0.1', r));
    process.env.MWANGA_CATALOG_BASE = `http://127.0.0.1:${store.address().port}/Scriptures/`;
    await js(`[...document.querySelectorAll('.tabs button')].find((b) => b.textContent === 'Bible').click()`); await wait(300);
    await js(`document.querySelector('#more-bibles').click()`); await wait(400);
    const listed = await js(`[...document.querySelectorAll('.store-row strong')].map((s) => s.textContent)`);
    await js(`document.querySelector('[data-bible="swhonen"] .primary').click()`); await wait(2000);
    await js(`document.querySelector('[data-bible="engbsb"] .primary').click()`); await wait(1500);
    await js(`document.querySelector('#more-bibles').scrollIntoView()`); await wait(200);
    await snap(operator, 'operator-more-bibles.png');
    const rowState = await js(`[...document.querySelectorAll('.store-row')].map((r) => r.dataset.bible + ': ' + r.querySelector('.store-actions').innerText.replace(/\\s+/g, ' ') + ((r.querySelector('.store-main .accent') || {}).innerText ? ' | ' + r.querySelector('.store-main .accent').innerText : ''))`);
    await js(`[...document.querySelectorAll('[data-bible="swhonen"] button')].find((b) => b.textContent === 'Use as main').click()`); await wait(1200);
    const copyright = await js(`(document.querySelector('.bible-copyright') || {}).innerText || ''`);
    const typeIn2 = (sel, text) => js(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(text)}); i.dispatchEvent(new Event('input', { bubbles: true })); i.focus(); })()`);
    await typeIn2('.search input', 'yh 3:16'); await wait(500);
    await js(`document.querySelector('.search input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`); await wait(1200);
    const shown = await output.webContents.executeJavaScript(`({ text: (document.querySelector('.out-text') || {}).innerText || '', ref: (document.querySelector('.out-ref') || {}).innerText || '', credit: (document.querySelector('.out-credit') || {}).innerText || '' })`);
    await snap(output, 'output-neno.png');
    const list = (await js(`window.mwanga.bible.list()`)).map((b) => `${b.id} ${b.short} ${b.lang} ${b.license}`);
    fs.writeFileSync(path.join(dir, 'bibles-check.json'), JSON.stringify({ listed, rowState, copyright, shown, list }, null, 1));
    store.close();
  }
  // looks, two translations, transitions
  {
    const setSelect = (sel, value) => js(`(() => { const s = document.querySelector(${JSON.stringify(sel)}); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, ${JSON.stringify(value)}); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await js(`document.querySelector('[data-tab="projector"]').click()`); await wait(300);
    const looks = await js(`[...document.querySelectorAll('.look')].map((b) => b.dataset.look)`);
    await js(`document.querySelector('[data-look="royal"]').click()`); await wait(300);
    await setSelect('#second-bible', 'kjv'); await wait(600);
    const typeIn3 = (sel, text) => js(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(text)}); i.dispatchEvent(new Event('input', { bubbles: true })); i.focus(); })()`);
    await typeIn3('.search input', 'yh 3:16'); await wait(500);
    await js(`document.querySelector('.search input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`); await wait(1500);
    const outState = () => output.webContents.executeJavaScript(`(() => { const o = document.querySelector('.out'); const inner = document.querySelector('.out-layer:not(.leaving) .out-inner'); return {
      layers: document.querySelectorAll('.out-layer').length, dual: inner ? inner.className : '', main: (document.querySelector('.out-layer:not(.leaving) .out-text') || {}).innerText || '',
      second: (document.querySelector('.out-layer:not(.leaving) .out-sub') || {}).innerText || '', tags: [...document.querySelectorAll('.out-layer:not(.leaving) .out-tag')].map((x) => x.textContent),
      mainSize: inner ? getComputedStyle(document.querySelector('.out-layer:not(.leaving) .out-text')).fontSize : '', secondSize: document.querySelector('.out-layer:not(.leaving) .out-sub') ? getComputedStyle(document.querySelector('.out-layer:not(.leaving) .out-sub')).fontSize : '',
      font: getComputedStyle(o).fontFamily, backdrop: !!document.querySelector('.backdrop'), fades: o.classList.contains('fades') }; })()`);
    const stacked = await outState();
    const front = async (w) => { w.show(); w.moveTop(); w.focus(); await wait(900); };
    await front(output);
    await snap(output, 'output-royal-stacked.png');
    await js(`document.querySelector('[data-dual="side"]').click()`); await wait(900);
    const side = await outState();
    await front(output);
    await snap(output, 'output-royal-side.png');
    if (!stage) openStage();
    await wait(1800);
    if (stage) { await front(stage); await snap(stage, 'stage-verse.png'); }
    await front(operator);
    await js(`document.querySelector('[data-dual="stacked"]').click()`); await wait(300);
    await js(`document.querySelector('[data-look="royal"]').scrollIntoView({ block: 'center' })`); await wait(300);
    await snap(operator, 'operator-looks.png');
    await js(`document.querySelector('.col-right').scrollTop = 0`);
    await js(`document.querySelector('[data-look="parchment"]').click()`); await wait(900);
    await front(output);
    await snap(output, 'output-parchment.png');
    await front(operator);
    await js(`document.querySelector('[data-look="royal"]').click()`); await wait(300);
    // black screen fades over everything
    await js(`[...document.querySelectorAll('.top-actions button')].find((b) => b.textContent.includes('Black')).click()`); await wait(700);
    const black = await output.webContents.executeJavaScript(`document.querySelector('.out-black').className`);
    await js(`[...document.querySelectorAll('.top-actions button')].find((b) => b.textContent.includes('Restore')).click()`); await wait(300);
    fs.writeFileSync(path.join(dir, 'looks-check.json'), JSON.stringify({ looks, stacked, side, black }, null, 1));
  }
  // → after the last verse of a passage reads on; ← before the first reads back
  {
    const key = (k) => js(`document.activeElement && document.activeElement.blur(); window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true }))`);
    const setSel = (sel, value) => js(`(() => { const s = document.querySelector(${JSON.stringify(sel)}); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, ${JSON.stringify(value)}); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await js(`document.querySelector('[data-tab="projector"]').click()`); await wait(300);
    await setSel('#main-bible', 'kjv'); await wait(300);
    await setSel('#second-bible', ''); await wait(600);
    const typeIn4 = (sel, text) => js(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(text)}); i.dispatchEvent(new Event('input', { bubbles: true })); i.focus(); })()`);
    await typeIn4('.search input', 'Romans 8:28'); await wait(500);
    await js(`document.querySelector('.search input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`); await wait(1000);
    const outT = () => output.webContents.executeJavaScript(`((document.querySelector('.out-layer:not(.leaving) .out-text') || {}).innerText || '').slice(0, 40)`);
    const nextPreview = () => js(`(() => { const heads = [...document.querySelectorAll('.mon-head')]; const h = heads[1]; const m = h && h.nextElementSibling; return m ? (m.querySelector('.mini-text') || {}).innerText || '' : ''; })()`);
    const title = () => js(`(document.querySelector('.svc-item.is-live .svc-text > span') || document.querySelector('.svc-item.on .svc-text > span') || {}).textContent || ''`);
    const r = { start: await outT(), startTitle: await title(), nextShown: (await nextPreview()).slice(0, 40) };
    { const w = output; w.show(); w.moveTop(); w.focus(); await wait(900); await snap(output, 'output-single.png'); operator.show(); operator.moveTop(); operator.focus(); await wait(400); }
    await key('ArrowRight'); await wait(900);
    r.after1 = await outT(); r.title1 = await title();
    await key('ArrowRight'); await wait(900);
    r.after2 = await outT(); r.title2 = await title();
    await key('ArrowLeft'); await key('ArrowLeft'); await key('ArrowLeft'); await wait(900);
    r.back = await outT(); r.titleBack = await title();
    fs.writeFileSync(path.join(dir, 'next-verse-check.json'), JSON.stringify(r, null, 1));
  }
  // the preacher's screen on a TV, over Wi-Fi: /tv/<code>
  {
    const info = await startRemote();
    const get = (p) => new Promise((resolve) => { http.get({ host: '127.0.0.1', port: info.port, path: p }, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location || '', asks: b.includes('TV code') })); }).on('error', () => resolve({ status: -1 })); });
    const right = await get(`/tv/${info.tvCode}`);
    const wrong = await get('/tv/0000');
    const bare = await get('/tv');
    const slashPort = await get(`/${info.port}/tv/${info.tvCode}`);
    const on80 = await new Promise((resolve) => { http.get({ host: '127.0.0.1', port: 80, path: `/tv/${info.tvCode}` }, (res) => { res.resume(); resolve({ status: res.statusCode, location: res.headers.location || '' }); }).on('error', (e) => resolve({ error: e.code })); });
    const tvWin = new BrowserWindow({ width: 1280, height: 720, show: true, useContentSize: true });
    await tvWin.loadURL(`http://127.0.0.1:${info.port}/tv/${info.tvCode}`);
    await wait(2500);
    const page = await tvWin.webContents.executeJavaScript(`({ hash: location.hash, ref: (document.querySelector('.stage-ref') || {}).innerText || '', text: ((document.querySelector('.stage-verse .stage-now-text') || {}).innerText || '').slice(0, 40), backLink: !!document.querySelector('.stage-back'), nextShown: !!document.querySelector('.stage-next'), hint: (document.querySelector('.stage-hint') || {}).innerText || '' })`);
    tvWin.show(); tvWin.moveTop(); tvWin.focus(); await wait(800);
    await snap(tvWin, 'tv-stage.png');
    // a TV browser often opens the page small and then goes full screen: the text must grow with it
    const measure = () => tvWin.webContents.executeJavaScript(`(() => { const t = document.querySelector('.stage-verse .stage-now-text') || document.querySelector('.stage-text'); return t ? Math.round(parseFloat(getComputedStyle(t).fontSize) / innerHeight * 1000) / 10 : 0; })()`);
    page.resize = {};
    for (const [w, h] of [[480, 300], [1920, 1080], [960, 540]]) { tvWin.setContentSize(w, h); await wait(900); page.resize[w + 'x' + h] = await measure(); }
    tvWin.setContentSize(1280, 720); await wait(600);
    // a song on the TV: lines fill the screen
    await js(`[...document.querySelectorAll('.svc-main')].find((b) => b.textContent.includes('Asante Bwana')).click()`); await wait(400);
    await js(`document.querySelector('.slides .slide').click()`); await wait(1500);
    page.song = await tvWin.webContents.executeJavaScript(`(() => { const t = document.querySelector('.stage-text'); return t ? { text: t.innerText.slice(0, 30), size: getComputedStyle(t).fontSize, align: getComputedStyle(t).textAlign } : null; })()`);
    tvWin.show(); tvWin.moveTop(); tvWin.focus(); await wait(800);
    await snap(tvWin, 'tv-song.png');
    tvWin.destroy();
    fs.writeFileSync(path.join(dir, 'tv-check.json'), JSON.stringify({ urls: info.tvUrls, right, wrong, bare, slashPort, on80, page }, null, 1));
  }
  // on a small laptop screen every tab must still be there and clickable
  {
    const sizes = {};
    for (const [w, h] of [[1280, 680], [1366, 728]]) {
      operator.setContentSize(w, h); await wait(700);
      sizes[w + 'x' + h] = await js(`[...document.querySelectorAll('.right-tabs button, .lib .tabs button')].map((b) => { const r = b.getBoundingClientRect(); return b.textContent + ':' + Math.round(r.height); })`);
      await js(`document.querySelector('[data-tab="projector"]').click()`); await wait(300);
      sizes[w + 'x' + h + ' bibles'] = await js(`(() => { const col = document.querySelector('.col-right').getBoundingClientRect(); return ['#main-bible', '#second-bible'].map((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return sel + ':' + (r.left >= col.left - 1 && r.right <= col.right + 1 && r.width > 100 ? 'inside' : 'OUTSIDE ' + Math.round(r.left) + '-' + Math.round(r.right) + ' of ' + Math.round(col.left) + '-' + Math.round(col.right)); }); })()`);
      await snap(operator, `operator-${w}.png`);
    }
    fs.writeFileSync(path.join(dir, 'small-screen-check.json'), JSON.stringify(sizes, null, 1));
  }
  app.quit();
}

app.whenReady().then(() => {
  // mwanga-media://m/<file> · mwanga-media://m/t/<thumbnail>
  protocol.handle('mwanga-media', (req) => {
    const parts = new URL(req.url).pathname.slice(1).split('/');
    const file = parts[0] === 't'
      ? (() => { const t = path.join(thumbDir(), path.basename(decodeURIComponent(parts[1] || ''))); return fs.existsSync(t) ? t : null; })()
      : mediaPath(parts[0]);
    if (!file) return new Response('Not found', { status: 404 });
    return serveMediaFile(file, req.headers.get('range'));
  });
  // only the operator screen may use the microphone (for the verse finder)
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(permission === 'media' && !!operator && wc === operator.webContents));
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'media' && !!operator && wc === operator.webContents);
  createOperator();
  setupUpdates();
  if (readJSON('settings.json', {}).remoteOn) startRemote();
  if (process.env.MWANGA_SCREENSHOT) screenshotRun(process.env.MWANGA_SCREENSHOT);
  // a projector plugged in during the service: put the output on it
  screen.on('display-added', () => {
    closeOutput(); setTimeout(openOutput, 800);
    if (stage) { closeStage(); setTimeout(openStage, 1000); }
    send(operator, 'displays:changed');
  });
  screen.on('display-removed', () => {
    if (output) { closeOutput(); setTimeout(openOutput, 500); }
    if (stage) { closeStage(); setTimeout(openStage, 700); }
    send(operator, 'displays:changed');
  });
});

app.on('window-all-closed', () => { stopRemote(); stopListener(); app.quit(); });
