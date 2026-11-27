// Mwanga — Electron main process.
// Windows: the operator screen, the projector output, and the preacher's (stage) screen.
// Also: file storage, Bible files, the phone-remote server on the church Wi-Fi, and updates.
const { app, BrowserWindow, ipcMain, screen, dialog, shell } = require('electron');
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

let operator = null;
let output = null;
let stage = null;
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
        out.push({ id, name, short, lang, file: path.join(dir, f), bundled: dir === bundledBibles });
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
  operator.on('closed', () => { operator = null; if (output) output.close(); if (stage) stage.close(); });
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
  const opts = { backgroundColor: '#000000', frame: false, show: false, title, webPreferences: webPrefs, ...iconOpt() };
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

// ---------- phone remote: a small web server on the church Wi-Fi ----------
// Phones open http://<this PC>:<port>/?pin=1234 and get the same React app (remote and preacher views).
// Every request must carry the PIN. Nothing is reachable from the internet unless the church's router forwards it.
const remote = { server: null, port: 0, pin: '', clients: new Set(), failures: new Map() };
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
    urls: ips.map((ip) => `http://${ip}:${remote.port}/?pin=${remote.pin}`)
  };
}

function pinOk(req, url) {
  const ip = req.socket.remoteAddress;
  const fails = remote.failures.get(ip) || 0;
  if (fails >= 20) return false; // too many wrong PINs from one phone
  const given = url.searchParams.get('pin') || req.headers['x-mwanga-pin'] || '';
  const ok = given.length === remote.pin.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(remote.pin));
  if (!ok) remote.failures.set(ip, fails + 1);
  else remote.failures.delete(ip);
  return ok;
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
    if (!pinOk(req, url)) { res.writeHead(401); res.end('Wrong PIN'); return; }
    if (url.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify(lastLive)}\n\n`);
      remote.clients.add(res);
      send(operator, 'remote:info', remoteInfo());
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { clearInterval(ping); remote.clients.delete(res); send(operator, 'remote:info', remoteInfo()); });
      return;
    }
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
  return new Promise((resolve) => {
    const server = http.createServer(handleRemote);
    // the same port every week, so phones that saved the link keep working; another port if it's taken
    const tryPort = (p, left) => {
      const onError = (e) => {
        if (e.code === 'EADDRINUSE' && left) tryPort(p + 1, left - 1);
        else { remote.server = null; resolve(remoteInfo()); }
      };
      server.once('error', onError);
      server.listen(p, '0.0.0.0', () => { server.off('error', onError); remote.server = server; remote.port = p; resolve(remoteInfo()); });
    };
    tryPort(8765, 10);
  });
}

function stopRemote() {
  for (const res of remote.clients) res.end();
  remote.clients.clear();
  if (remote.server) remote.server.close();
  remote.server = null;
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
  app.quit();
}

app.whenReady().then(() => {
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

app.on('window-all-closed', () => { stopRemote(); app.quit(); });
