// Mwanga — Electron main process.
// Two windows: the operator screen, and the output that goes full screen on the projector.
const { app, BrowserWindow, ipcMain, screen, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const DEV = !!process.env.MWANGA_DEV;
const DEV_URL = 'http://localhost:5173';
const userDir = () => app.getPath('userData');
const bundledBibles = path.join(__dirname, '..', 'data', 'bibles');
const userBibles = () => path.join(userDir(), 'bibles');

let operator = null;
let output = null;
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
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash });
}

const webPrefs = {
  preload: path.join(__dirname, 'preload.cjs'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true
};

function createOperator() {
  operator = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 640,
    title: 'Mwanga', backgroundColor: '#171615', show: false, webPreferences: webPrefs
  });
  operator.removeMenu();
  operator.once('ready-to-show', () => { operator.maximize(); operator.show(); });
  operator.on('closed', () => { operator = null; if (output) output.close(); });
  // links open in the normal browser, never inside Mwanga
  operator.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  load(operator, '/operator');
}

function pickDisplay() {
  const settings = readJSON('settings.json', {});
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  return displays.find((d) => d.id === settings.displayId)
    || displays.find((d) => d.id !== primary.id)
    || null; // no second screen
}

function openOutput() {
  if (output) { output.show(); return; }
  const d = pickDisplay();
  const opts = {
    backgroundColor: '#000000', frame: false, show: false, title: 'Mwanga output',
    webPreferences: webPrefs
  };
  if (d) Object.assign(opts, { x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height, fullscreen: true });
  else Object.assign(opts, { width: 960, height: 540, frame: true }); // one screen only: a preview window to test with
  output = new BrowserWindow(opts);
  output.removeMenu();
  output.setMenuBarVisibility(false);
  output.once('ready-to-show', () => output.showInactive());
  output.webContents.on('did-finish-load', () => output && output.webContents.send('live:update', lastLive));
  output.on('closed', () => { output = null; operator && operator.webContents.send('output:state', false); });
  load(output, '/output');
  operator && operator.webContents.send('output:state', true);
}

function closeOutput() { if (output) output.close(); }

// ---------- IPC ----------
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
ipcMain.handle('output:open', () => { openOutput(); return true; });
ipcMain.handle('output:close', () => { closeOutput(); return true; });
ipcMain.handle('output:move', () => { closeOutput(); setTimeout(openOutput, 300); return true; });

ipcMain.on('live:set', (_e, live) => {
  lastLive = live;
  if (output) output.webContents.send('live:update', live);
});

ipcMain.handle('file:open', async (_e, filters) => {
  const r = await dialog.showOpenDialog(operator, { properties: ['openFile', 'multiSelections'], filters });
  if (r.canceled) return [];
  return r.filePaths.slice(0, 200).map((p) => ({ name: path.basename(p), text: fs.readFileSync(p, 'utf8') }));
});

// ---------- app ----------
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (operator) { operator.restore(); operator.focus(); } });

// Developer check: MWANGA_SCREENSHOT=folder saves pictures of both windows and quits.
async function screenshotRun(dir) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  fs.mkdirSync(dir, { recursive: true });
  await wait(2500);
  openOutput();
  await wait(1500);
  const press = (key) => operator.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)} }))`);
  await press('ArrowRight'); await wait(300);
  await press('ArrowRight'); await press('ArrowRight'); await wait(800);
  fs.writeFileSync(path.join(dir, 'operator.png'), (await operator.webContents.capturePage()).toPNG());
  fs.writeFileSync(path.join(dir, 'output.png'), (await output.webContents.capturePage()).toPNG());
  // a Bible verse with search
  await operator.webContents.executeJavaScript(`(() => { const i = document.querySelector('.search input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'yh 3:16'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await wait(600);
  fs.writeFileSync(path.join(dir, 'search.png'), (await operator.webContents.capturePage()).toPNG());
  await operator.webContents.executeJavaScript(`document.querySelector('.result .primary').click()`);
  await wait(900);
  fs.writeFileSync(path.join(dir, 'output-verse.png'), (await output.webContents.capturePage()).toPNG());
  fs.writeFileSync(path.join(dir, 'operator-verse.png'), (await operator.webContents.capturePage()).toPNG());
  app.quit();
}

app.whenReady().then(() => {
  createOperator();
  if (process.env.MWANGA_SCREENSHOT) screenshotRun(process.env.MWANGA_SCREENSHOT);
  // when a projector is plugged in or removed, move the output to the right place
  screen.on('display-added', () => { if (output) { closeOutput(); setTimeout(openOutput, 500); } operator && operator.webContents.send('displays:changed'); });
  screen.on('display-removed', () => { if (output) { closeOutput(); setTimeout(openOutput, 500); } operator && operator.webContents.send('displays:changed'); });
});

app.on('window-all-closed', () => app.quit());
