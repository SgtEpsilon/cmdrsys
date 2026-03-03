const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

// ─── Paths ───────────────────────────────────────────────────────────────────
const USER_DATA = app.getPath('userData');
const DB_PATH   = path.join(USER_DATA, 'cmdrsys.db');

// ─── Database ─────────────────────────────────────────────────────────────────
let db;
let dbDirty = false;   // true when in-memory DB has unsaved changes
let saveTimer = null;  // debounce timer for saveDB

async function initDB() {
    const wasmPath   = path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    const initSqlJs  = require('sql.js');
    const SQL        = await initSqlJs({ locateFile: () => wasmPath });

    if (fs.existsSync(DB_PATH)) {
        db = new SQL.Database(fs.readFileSync(DB_PATH));
    } else {
        db = new SQL.Database();
    }

    db.run(`
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT
        );
        CREATE TABLE IF NOT EXISTS logs (
            id      TEXT PRIMARY KEY,
            ts      INTEGER NOT NULL,
            title   TEXT NOT NULL,
            system  TEXT,
            body    TEXT,
            content TEXT NOT NULL,
            tags    TEXT DEFAULT '[]'
        );
        CREATE TABLE IF NOT EXISTS bookmarks (
            id     TEXT PRIMARY KEY,
            ts     INTEGER NOT NULL,
            system TEXT NOT NULL,
            type   TEXT DEFAULT 'POI',
            x      REAL,
            y      REAL,
            z      REAL,
            notes  TEXT,
            tags   TEXT DEFAULT '[]'
        );
        CREATE TABLE IF NOT EXISTS visited (
            name TEXT PRIMARY KEY,
            ts   INTEGER NOT NULL
        );
    `);

    // Flush immediately on first init so the file exists
    flushDB();
}

// Write DB to disk — debounced so rapid writes collapse into one
function saveDB() {
    dbDirty = true;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushDB, 400);
}

function flushDB() {
    if (!db) return;
    dbDirty = false;
    const data = db.export();
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// Make sure we flush on quit even if timer hasn't fired
app.on('before-quit', () => { if (dbDirty) flushDB(); });

// ─── Query helpers ────────────────────────────────────────────────────────────
function queryAll(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
}
function queryGet(sql, params = []) { return queryAll(sql, params)[0] || null; }

// ─── Settings ─────────────────────────────────────────────────────────────────
function getSetting(key, def = '') {
    const row = queryGet('SELECT value FROM settings WHERE key = ?', [key]);
    return row ? row.value : def;
}
function setSetting(key, value) {
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
    // Don't call saveDB() here — callers batch-flush after bulk operations
}

// ─── Journal helpers ──────────────────────────────────────────────────────────
function parseLine(line) {
    try { return JSON.parse(line.trim()); } catch { return null; }
}

function getDefaultJournalDir() {
    if (process.platform === 'win32') {
        const base = process.env.USERPROFILE || os.homedir();
        return path.join(base, 'Saved Games', 'Frontier Developments', 'Elite Dangerous');
    }
    // Wine/Proton on Linux
    const proton = path.join(os.homedir(), '.steam', 'steam', 'steamapps', 'compatdata',
        '359320', 'pfx', 'drive_c', 'users', 'steamuser',
        'Saved Games', 'Frontier Developments', 'Elite Dangerous');
    return fs.existsSync(proton) ? proton : null;
}

function getAllJournalFiles(dir) {
    if (!dir || !fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter(f => /^Journal\.\d{4}-\d{2}-\d{2}T\d{6}\.\d{2}\.log$/.test(f))
        .sort()                          // lexicographic == chronological for this format
        .map(f => path.join(dir, f));
}

// ─── Journal loading — runs AFTER window opens ────────────────────────────────
let journalWatcher  = null;
let journalPath     = null;
let lastFileSize    = 0;

// In-memory journal events — NOT stored in SQLite (avoids huge DB writes)
// We re-parse from files on each startup; only visited/meta is persisted.
let memEvents = [];

function loadAllJournals(journalDir) {
    const files = getAllJournalFiles(journalDir);
    if (files.length === 0) return { ok: false, reason: 'No journal files found in ' + journalDir };

    memEvents = [];
    let cmdr = '', ship = '', system = '';

    // Use a single prepared statement for visited inserts
    const visitStmt = db.prepare('INSERT OR IGNORE INTO visited (name, ts) VALUES (?, ?)');

    for (const file of files) {
        let text;
        try { text = fs.readFileSync(file, 'utf8'); }
        catch (e) { console.warn('Cannot read', file, e.message); continue; }

        const lines = text.split('\n');
        for (const line of lines) {
            const ev = parseLine(line);
            if (!ev) continue;
            memEvents.push(ev);

            if (ev.event === 'Commander' && ev.Name)  cmdr   = ev.Name;
            if (ev.event === 'LoadGame'  && ev.Ship)  ship   = (ev.Ship_Localised || ev.Ship).toUpperCase();
            if (['FSDJump', 'CarrierJump', 'Location'].includes(ev.event) && ev.StarSystem) {
                system = ev.StarSystem;
                visitStmt.run([ev.StarSystem, ev.timestamp ? new Date(ev.timestamp).getTime() : Date.now()]);
            }
        }

        // Send progress update to renderer so the UI can show a loading bar
        if (win && !win.isDestroyed()) {
            win.webContents.send('journal:progress', {
                file:  path.basename(file),
                done:  files.indexOf(file) + 1,
                total: files.length,
            });
        }
    }

    visitStmt.free();

    // Persist derived metadata in one flush
    if (cmdr)   setSetting('cmdr',   cmdr);
    if (ship)   setSetting('ship',   ship);
    if (system) setSetting('system', system);
    flushDB();  // single flush for entire load

    // Watch the latest file live
    startWatcher(files[files.length - 1]);

    return {
        ok:        true,
        fileCount: files.length,
        latestFile: path.basename(files[files.length - 1]),
        count:     memEvents.length,
        cmdr, ship, system,
    };
}

function startWatcher(file) {
    if (journalWatcher) journalWatcher.close();
    journalPath  = file;
    lastFileSize = fs.statSync(file).size;

    journalWatcher = fs.watch(file, (eventType) => {
        if (eventType !== 'change') return;
        try {
            const newSize = fs.statSync(file).size;
            if (newSize <= lastFileSize) return;
            const fd  = fs.openSync(file, 'r');
            const buf = Buffer.alloc(newSize - lastFileSize);
            fs.readSync(fd, buf, 0, buf.length, lastFileSize);
            fs.closeSync(fd);
            lastFileSize = newSize;
            processLiveChunk(buf.toString('utf8'));
        } catch (e) { console.error('Journal watch error:', e); }
    });
}

function processLiveChunk(text) {
    const events = text.split('\n').map(parseLine).filter(Boolean);
    if (!events.length) return;

    memEvents.push(...events);

    const visitStmt = db.prepare('INSERT OR IGNORE INTO visited (name, ts) VALUES (?, ?)');
    let system = '';

    events.forEach(ev => {
        if (ev.event === 'Commander' && ev.Name)  setSetting('cmdr', ev.Name);
        if (ev.event === 'LoadGame'  && ev.Ship)  setSetting('ship', (ev.Ship_Localised || ev.Ship).toUpperCase());
        if (['FSDJump', 'CarrierJump', 'Location'].includes(ev.event) && ev.StarSystem) {
            system = ev.StarSystem;
            setSetting('system', ev.StarSystem);
            visitStmt.run([ev.StarSystem, ev.timestamp ? new Date(ev.timestamp).getTime() : Date.now()]);
        }
    });
    visitStmt.free();
    flushDB();

    if (win && !win.isDestroyed()) {
        win.webContents.send('journal:newEvents', events);
        if (system) {
            win.webContents.send('journal:metaUpdate', {
                cmdr:   getSetting('cmdr'),
                ship:   getSetting('ship'),
                system: getSetting('system'),
            });
        }
    }
}

// ─── Window ───────────────────────────────────────────────────────────────────
let win;
function createWindow() {
    win = new BrowserWindow({
        width:  1280,
        height: 820,
        minWidth:  900,
        minHeight: 600,
        frame: false,
        backgroundColor: '#020609',
        webPreferences: {
            preload:          path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration:  false,
        },
    });
    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    // win.webContents.openDevTools();
}

// Window opens FIRST, then journals load in response to renderer:ready
app.whenReady().then(async () => {
    await initDB();
    createWindow();   // ← opens immediately, no blocking work before this
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
    if (journalWatcher) journalWatcher.close();
    if (process.platform !== 'darwin') app.quit();
});

// ─── Window Controls ──────────────────────────────────────────────────────────
ipcMain.on('window:minimize', () => win.minimize());
ipcMain.on('window:maximize', () => win.isMaximized() ? win.unmaximize() : win.maximize());
ipcMain.on('window:close',    () => win.close());

// ─── renderer:ready — triggered by renderer on mount ─────────────────────────
// This is where the journal loading actually happens, safely after the window exists
ipcMain.handle('renderer:ready', () => {
    const savedDir   = getSetting('journal_dir', '');
    const journalDir = savedDir || getDefaultJournalDir();

    if (!journalDir || !fs.existsSync(journalDir)) {
        return { autoLoaded: false, reason: 'No journal directory found' };
    }

    // Run synchronously but NOW the window is open so it won't block startup
    // Progress events are pushed to the renderer during the loop above
    try {
        const result = loadAllJournals(journalDir);
        return { autoLoaded: true, ...result };
    } catch (e) {
        console.error('Auto-load failed:', e);
        return { autoLoaded: false, reason: e.message };
    }
});

// ─── Settings IPC ─────────────────────────────────────────────────────────────
ipcMain.handle('settings:get',    (_, key, def) => getSetting(key, def));
ipcMain.handle('settings:set',    (_, key, val) => { setSetting(key, val); saveDB(); return true; });
ipcMain.handle('settings:getAll', () => {
    const rows = queryAll('SELECT key, value FROM settings');
    const out  = {};
    rows.forEach(r => out[r.key] = r.value);
    return out;
});

// ─── Logs IPC ─────────────────────────────────────────────────────────────────
ipcMain.handle('logs:getAll', () =>
    queryAll('SELECT * FROM logs ORDER BY ts DESC')
        .map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') }))
);
ipcMain.handle('logs:save', (_, e) => {
    db.run(`INSERT OR REPLACE INTO logs (id,ts,title,system,body,content,tags) VALUES (?,?,?,?,?,?,?)`,
        [e.id, e.ts, e.title, e.system||'', e.body||'', e.content, JSON.stringify(e.tags||[])]);
    saveDB(); return true;
});
ipcMain.handle('logs:delete', (_, id) => {
    db.run('DELETE FROM logs WHERE id = ?', [id]);
    saveDB(); return true;
});

// ─── Bookmarks IPC ────────────────────────────────────────────────────────────
ipcMain.handle('bookmarks:getAll', () =>
    queryAll('SELECT * FROM bookmarks ORDER BY ts DESC')
        .map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') }))
);
ipcMain.handle('bookmarks:save', (_, b) => {
    db.run(`INSERT OR REPLACE INTO bookmarks (id,ts,system,type,x,y,z,notes,tags) VALUES (?,?,?,?,?,?,?,?,?)`,
        [b.id, b.ts, b.system, b.type||'POI', b.x??null, b.y??null, b.z??null, b.notes||'', JSON.stringify(b.tags||[])]);
    saveDB(); return true;
});
ipcMain.handle('bookmarks:delete', (_, id) => {
    db.run('DELETE FROM bookmarks WHERE id = ?', [id]);
    saveDB(); return true;
});

// ─── Visited IPC ──────────────────────────────────────────────────────────────
ipcMain.handle('visited:getAll', () => queryAll('SELECT * FROM visited ORDER BY ts DESC'));
ipcMain.handle('visited:add', (_, name, ts) => {
    db.run('INSERT OR IGNORE INTO visited (name, ts) VALUES (?, ?)', [name, ts || Date.now()]);
    saveDB(); return true;
});
ipcMain.handle('visited:clear', () => {
    db.run('DELETE FROM visited');
    saveDB(); return true;
});

// ─── Journal Events IPC ───────────────────────────────────────────────────────
// Events live in memory (memEvents), not SQLite — avoids huge DB growth
ipcMain.handle('journal:getEvents', () => memEvents);
ipcMain.handle('journal:clearEvents', () => { memEvents = []; return true; });

// ─── journal:open — user manually picks a journal file/folder ─────────────────
ipcMain.handle('journal:open', async () => {
    const { filePaths } = await dialog.showOpenDialog(win, {
        title:      'Select any Elite Dangerous Journal File',
        filters:    [{ name: 'ED Journal', extensions: ['log', 'txt'] }],
        properties: ['openFile'],
    });
    if (!filePaths || filePaths.length === 0) return { ok: false };

    const chosenDir = path.dirname(filePaths[0]);
    setSetting('journal_dir', chosenDir);
    saveDB();

    try {
        const result = loadAllJournals(chosenDir);
        return { ok: true, ...result };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
});

ipcMain.handle('journal:stopWatch', () => {
    if (journalWatcher) { journalWatcher.close(); journalWatcher = null; }
    return true;
});

// ─── Export / Import ──────────────────────────────────────────────────────────
ipcMain.handle('export:json', async () => {
    const { filePath } = await dialog.showSaveDialog(win, {
        title:       'Export CMDRSYS Data',
        defaultPath: `cmdrsys-backup-${Date.now()}.json`,
        filters:     [{ name: 'JSON', extensions: ['json'] }],
    });
    if (!filePath) return { ok: false };

    const data = {
        version:   '1.0',
        exported:  new Date().toISOString(),
        settings:  queryAll('SELECT * FROM settings'),
        logs:      queryAll('SELECT * FROM logs'),
        bookmarks: queryAll('SELECT * FROM bookmarks'),
        visited:   queryAll('SELECT * FROM visited'),
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return { ok: true, path: filePath };
});

ipcMain.handle('import:json', async () => {
    const { filePaths } = await dialog.showOpenDialog(win, {
        title:      'Import CMDRSYS Backup',
        filters:    [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile'],
    });
    if (!filePaths || filePaths.length === 0) return { ok: false };

    try {
        const data = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
        if (data.settings)  data.settings.forEach(r  => db.run('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)', [r.key, r.value]));
        if (data.logs)      data.logs.forEach(r       => db.run('INSERT OR REPLACE INTO logs (id,ts,title,system,body,content,tags) VALUES (?,?,?,?,?,?,?)', [r.id,r.ts,r.title,r.system,r.body,r.content,r.tags]));
        if (data.bookmarks) data.bookmarks.forEach(r  => db.run('INSERT OR REPLACE INTO bookmarks (id,ts,system,type,x,y,z,notes,tags) VALUES (?,?,?,?,?,?,?,?,?)', [r.id,r.ts,r.system,r.type,r.x,r.y,r.z,r.notes,r.tags]));
        if (data.visited)   data.visited.forEach(r    => db.run('INSERT OR IGNORE INTO visited (name,ts) VALUES (?,?)', [r.name, r.ts]));
        flushDB();
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message };
    }
});
