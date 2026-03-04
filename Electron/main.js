const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const http = require('http');

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
            lat    REAL,
            lon    REAL,
            z      REAL,
            notes  TEXT,
            tags   TEXT DEFAULT '[]'
        );
        CREATE TABLE IF NOT EXISTS visited (
            name TEXT PRIMARY KEY,
            ts   INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS body_notes (
            id          TEXT PRIMARY KEY,
            ts          INTEGER NOT NULL,
            system      TEXT NOT NULL,
            body_name   TEXT NOT NULL,
            body_type   TEXT,
            star_class  TEXT,
            atmo_type   TEXT,
            gravity     REAL,
            landable    INTEGER DEFAULT 0,
            bio_signals INTEGER DEFAULT 0,
            geo_signals INTEGER DEFAULT 0,
            terraform   TEXT,
            distance_ls REAL,
            value       INTEGER DEFAULT 0,
            notes       TEXT,
            tags        TEXT DEFAULT '[]',
            coords      TEXT DEFAULT '[]'
        );
        CREATE TABLE IF NOT EXISTS deleted_items (
            id         TEXT NOT NULL,
            type       TEXT NOT NULL,
            deleted_at INTEGER NOT NULL,
            PRIMARY KEY (id, type)
        );
    `);

    // Migration: rename x/y columns to lat/lon if they still exist from an older DB
    try {
        const cols = queryAll(`PRAGMA table_info(bookmarks)`).map(r => r.name);
        if (cols.includes('x') && !cols.includes('lat')) {
            db.run(`ALTER TABLE bookmarks RENAME COLUMN x TO lat`);
            db.run(`ALTER TABLE bookmarks RENAME COLUMN y TO lon`);
            console.log('Migrated bookmarks: x→lat, y→lon');
        }
    } catch(e) { console.warn('Migration check skipped:', e.message); }

    // Migration: add coords column to body_notes if missing
    try {
        const bnCols = queryAll(`PRAGMA table_info(body_notes)`).map(r => r.name);
        if (!bnCols.includes('coords')) {
            db.run(`ALTER TABLE body_notes ADD COLUMN coords TEXT DEFAULT '[]'`);
            console.log('Migrated body_notes: added coords column');
        }
    } catch(e) { console.warn('body_notes coords migration skipped:', e.message); }

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

// ─── Tombstone helpers ────────────────────────────────────────────────────────
function recordTombstone(id, type) {
    db.run(
        'INSERT OR REPLACE INTO deleted_items (id, type, deleted_at) VALUES (?, ?, ?)',
        [id, type, Date.now()]
    );
}

function getTombstones() {
    return queryAll('SELECT id, type, deleted_at FROM deleted_items');
}

// Apply a list of tombstones received from Android: delete matching live rows
function applyTombstones(tombstones) {
    if (!Array.isArray(tombstones)) return false;
    let changed = false;
    for (const { id, type, deleted_at } of tombstones) {
        // Record locally so we don't re-push the item later
        db.run(
            'INSERT OR REPLACE INTO deleted_items (id, type, deleted_at) VALUES (?, ?, ?)',
            [id, type, deleted_at ?? Date.now()]
        );
        if (type === 'bookmark') {
            const exists = queryGet('SELECT id FROM bookmarks WHERE id = ?', [id]);
            if (exists) { db.run('DELETE FROM bookmarks WHERE id = ?', [id]); changed = true; }
        } else if (type === 'log') {
            const exists = queryGet('SELECT id FROM logs WHERE id = ?', [id]);
            if (exists) { db.run('DELETE FROM logs WHERE id = ?', [id]); changed = true; }
        } else if (type === 'body_note') {
            const exists = queryGet('SELECT id FROM body_notes WHERE id = ?', [id]);
            if (exists) { db.run('DELETE FROM body_notes WHERE id = ?', [id]); changed = true; }
        }
    }
    return changed;
}

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

// ─── Sync Server ──────────────────────────────────────────────────────────────
// Runs a local HTTP server on the LAN so the Android app can pull/push data.
// Default port: 45678. Token is optional but recommended for security.

const SYNC_PORT = 45678;
let syncServer  = null;

function getLocalIP() {
    const saved = getSetting('syncServerIP', '');
    if (saved) return saved;
    const nets = os.networkInterfaces();
    for (const ifaces of Object.values(nets)) {
        for (const iface of ifaces) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
}

// Returns all non-loopback IPv4 interfaces so the user can pick the right one
function getAllNetworkInterfaces() {
    const nets = os.networkInterfaces();
    const results = [];
    for (const [name, ifaces] of Object.entries(nets)) {
        for (const iface of ifaces) {
            if (iface.family === 'IPv4' && !iface.internal) {
                results.push({ name, address: iface.address });
            }
        }
    }
    return results;
}

function startSyncServer() {
    if (syncServer) return; // already running

    syncServer = http.createServer((req, res) => {
        // CORS — needed so the Android WebView can reach us
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sync-Token');
        res.setHeader('Content-Type', 'application/json');

        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

        // Optional auth token
        const token = getSetting('syncToken', '');
        if (token && req.headers['x-sync-token'] !== token) {
            res.writeHead(401);
            res.end(JSON.stringify({ error: 'Unauthorized — wrong sync token' }));
            return;
        }

        // ── GET /sync — Android pulls all syncable data ──────────────────────
        if (req.method === 'GET' && req.url === '/sync') {
            try {
                const payload = {
                    bookmarks: queryAll('SELECT * FROM bookmarks ORDER BY ts DESC')
                                    .map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') })),
                    logs:      queryAll('SELECT * FROM logs ORDER BY ts DESC')
                                    .map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') })),
                    body_notes: queryAll('SELECT * FROM body_notes ORDER BY ts DESC')
                                    .map(r => ({ ...r, tags: JSON.parse(r.tags || '[]'), coords: JSON.parse(r.coords || '[]') })),
                    settings: {
                        cmdr:   getSetting('cmdr'),
                        ship:   getSetting('ship'),
                        system: getSetting('system'),
                    },
                    deleted_items: getTombstones(),
                    ts: Date.now(),
                    schema_version: 2,   // v2 uses lat/lon instead of x/y
                };
                res.writeHead(200);
                res.end(JSON.stringify(payload));
            } catch (e) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: e.message }));
            }

        // ── GET /sync/status — lightweight health + metadata for Android ─────
        } else if (req.method === 'GET' && req.url === '/sync/status') {
            try {
                const bmCount  = queryGet('SELECT COUNT(*) as n FROM bookmarks')?.n ?? 0;
                const logCount = queryGet('SELECT COUNT(*) as n FROM logs')?.n ?? 0;
                const bnCount  = queryGet('SELECT COUNT(*) as n FROM body_notes')?.n ?? 0;
                res.writeHead(200);
                res.end(JSON.stringify({
                    ok: true, app: 'CMDRSYS', schema_version: 2,
                    ts: Date.now(),
                    counts: { bookmarks: bmCount, logs: logCount, body_notes: bnCount },
                    cmdr: getSetting('cmdr'), system: getSetting('system'),
                }));
            } catch (e) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: e.message }));
            }

        // ── POST /sync — Android pushes its local changes ────────────────────
        } else if (req.method === 'POST' && req.url === '/sync') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    let changed = false;

                    // Apply tombstones FIRST — removes items deleted on Android
                    // before we merge live data so they don't get resurrected
                    if (applyTombstones(data.deleted_items)) changed = true;

                    // Merge bookmarks — last ts wins per id
                    // Accept both legacy {x,y} and new {lat,lon} field names from Android
                    if (Array.isArray(data.bookmarks)) {
                        data.bookmarks.forEach(b => {
                            const tombstone = queryGet('SELECT id FROM deleted_items WHERE id = ? AND type = ?', [b.id, 'bookmark']);
                            if (tombstone) return; // deleted — don't resurrect
                            const existing = queryGet('SELECT ts FROM bookmarks WHERE id = ?', [b.id]);
                            if (!existing || existing.ts < b.ts) {
                                const lat = b.lat ?? b.x ?? null;
                                const lon = b.lon ?? b.y ?? null;
                                db.run(
                                    `INSERT OR REPLACE INTO bookmarks
                                     (id,ts,system,type,lat,lon,z,notes,tags)
                                     VALUES (?,?,?,?,?,?,?,?,?)`,
                                    [b.id, b.ts, b.system, b.type || 'POI',
                                     lat, lon, b.z ?? null,
                                     b.notes || '', JSON.stringify(b.tags || [])]
                                );
                                changed = true;
                            }
                        });
                    }

                    // Merge logs — last ts wins per id
                    if (Array.isArray(data.logs)) {
                        data.logs.forEach(l => {
                            const tombstone = queryGet('SELECT id FROM deleted_items WHERE id = ? AND type = ?', [l.id, 'log']);
                            if (tombstone) return; // deleted — don't resurrect
                            const existing = queryGet('SELECT ts FROM logs WHERE id = ?', [l.id]);
                            if (!existing || existing.ts < l.ts) {
                                db.run(
                                    `INSERT OR REPLACE INTO logs
                                     (id,ts,title,system,body,content,tags)
                                     VALUES (?,?,?,?,?,?,?)`,
                                    [l.id, l.ts, l.title, l.system || '',
                                     l.body || '', l.content, JSON.stringify(l.tags || [])]
                                );
                                changed = true;
                            }
                        });
                    }

                    // Merge body_notes — last ts wins per id
                    if (Array.isArray(data.body_notes)) {
                        data.body_notes.forEach(n => {
                            const tombstone = queryGet('SELECT id FROM deleted_items WHERE id = ? AND type = ?', [n.id, 'body_note']);
                            if (tombstone) return; // deleted — don't resurrect
                            const existing = queryGet('SELECT ts FROM body_notes WHERE id = ?', [n.id]);
                            if (!existing || existing.ts < n.ts) {
                                db.run(
                                    `INSERT OR REPLACE INTO body_notes
                                     (id,ts,system,body_name,body_type,star_class,atmo_type,gravity,
                                      landable,bio_signals,geo_signals,terraform,distance_ls,value,notes,tags,coords)
                                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                                    [n.id, n.ts, n.system, n.body_name, n.body_type || null,
                                     n.star_class || null, n.atmo_type || null, n.gravity ?? null,
                                     n.landable ? 1 : 0, n.bio_signals ?? 0, n.geo_signals ?? 0,
                                     n.terraform || null, n.distance_ls ?? null, n.value ?? 0,
                                     n.notes || '', JSON.stringify(n.tags || []), JSON.stringify(n.coords || [])]
                                );
                                changed = true;
                            }
                        });
                    }

                    if (changed) {
                        saveDB();
                        // Notify renderer to refresh its in-memory data
                        if (win && !win.isDestroyed()) {
                            win.webContents.send('sync:dataUpdated');
                        }
                    }

                    res.writeHead(200);
                    res.end(JSON.stringify({ ok: true, changed }));
                } catch (e) {
                    console.error('Sync POST error:', e);
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: e.message }));
                }
            });

        // ── GET /ping — health check so Android can test connectivity ─────────
        } else if (req.method === 'GET' && req.url === '/ping') {
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true, app: 'CMDRSYS', ts: Date.now() }));

        // ── DELETE /sync/bookmark/:id — Android deletes a bookmark ───────────
        } else if (req.method === 'DELETE' && req.url.startsWith('/sync/bookmark/')) {
            const id = decodeURIComponent(req.url.slice('/sync/bookmark/'.length));
            try {
                db.run('DELETE FROM bookmarks WHERE id = ?', [id]);
                recordTombstone(id, 'bookmark');
                saveDB();
                if (win && !win.isDestroyed()) win.webContents.send('sync:dataUpdated');
                res.writeHead(200);
                res.end(JSON.stringify({ ok: true, deleted: id }));
            } catch (e) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: e.message }));
            }

        // ── DELETE /sync/log/:id — Android deletes a log entry ───────────────
        } else if (req.method === 'DELETE' && req.url.startsWith('/sync/log/')) {
            const id = decodeURIComponent(req.url.slice('/sync/log/'.length));
            try {
                db.run('DELETE FROM logs WHERE id = ?', [id]);
                recordTombstone(id, 'log');
                saveDB();
                if (win && !win.isDestroyed()) win.webContents.send('sync:dataUpdated');
                res.writeHead(200);
                res.end(JSON.stringify({ ok: true, deleted: id }));
            } catch (e) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: e.message }));
            }

        // ── DELETE /sync/body-note/:id — Android deletes a body note ─────────
        } else if (req.method === 'DELETE' && req.url.startsWith('/sync/body-note/')) {
            const id = decodeURIComponent(req.url.slice('/sync/body-note/'.length));
            try {
                db.run('DELETE FROM body_notes WHERE id = ?', [id]);
                recordTombstone(id, 'body_note');
                saveDB();
                if (win && !win.isDestroyed()) win.webContents.send('sync:dataUpdated');
                res.writeHead(200);
                res.end(JSON.stringify({ ok: true, deleted: id }));
            } catch (e) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: e.message }));
            }

        } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
        }
    });

    syncServer.on('error', (e) => {
        console.error('Sync server error:', e.message);
    });

    syncServer.listen(SYNC_PORT, '0.0.0.0', () => {
        const ip = getLocalIP();
        console.log(`CMDRSYS sync server running at http://${ip}:${SYNC_PORT}`);
        setSetting('syncServerPort', String(SYNC_PORT));
        // Only auto-set IP if user hasn't chosen one yet
        if (!getSetting('syncServerIP', '')) setSetting('syncServerIP', ip);
        saveDB();
        if (win && !win.isDestroyed()) {
            win.webContents.send('sync:serverStarted', {
                ip:         getSetting('syncServerIP', ip),
                port:       SYNC_PORT,
                interfaces: getAllNetworkInterfaces(),
            });
        }
    });
}

function stopSyncServer() {
    if (syncServer) {
        syncServer.close();
        syncServer = null;
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
    createWindow();
    startSyncServer();   // ← start sync server alongside the app
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
    if (journalWatcher) journalWatcher.close();
    stopSyncServer();
    if (process.platform !== 'darwin') app.quit();
});

// ─── Window Controls ──────────────────────────────────────────────────────────
ipcMain.on('window:minimize', () => win.minimize());
ipcMain.on('window:maximize', () => win.isMaximized() ? win.unmaximize() : win.maximize());
ipcMain.on('window:close',    () => win.close());
ipcMain.handle('shell:openExternal', (_, url) => shell.openExternal(url));

// ─── renderer:ready — triggered by renderer on mount ─────────────────────────
ipcMain.handle('renderer:ready', () => {
    const savedDir   = getSetting('journal_dir', '');
    const journalDir = savedDir || getDefaultJournalDir();

    if (!journalDir || !fs.existsSync(journalDir)) {
        return { autoLoaded: false, reason: 'No journal directory found' };
    }

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
    recordTombstone(id, 'log');
    saveDB(); return true;
});

// ─── Bookmarks IPC ────────────────────────────────────────────────────────────
ipcMain.handle('bookmarks:getAll', () =>
    queryAll('SELECT * FROM bookmarks ORDER BY ts DESC')
        .map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') }))
);
ipcMain.handle('bookmarks:save', (_, b) => {
    db.run(`INSERT OR REPLACE INTO bookmarks (id,ts,system,type,lat,lon,z,notes,tags) VALUES (?,?,?,?,?,?,?,?,?)`,
        [b.id, b.ts, b.system, b.type||'POI', b.lat??null, b.lon??null, b.z??null, b.notes||'', JSON.stringify(b.tags||[])]);
    saveDB(); return true;
});
ipcMain.handle('bookmarks:delete', (_, id) => {
    db.run('DELETE FROM bookmarks WHERE id = ?', [id]);
    recordTombstone(id, 'bookmark');
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

// ─── Sync IPC ─────────────────────────────────────────────────────────────────
ipcMain.handle('sync:getInfo', () => {
    const ip         = getSetting('syncServerIP',   getLocalIP());
    const port       = getSetting('syncServerPort', String(SYNC_PORT));
    const token      = getSetting('syncToken', '');
    const interfaces = getAllNetworkInterfaces();
    return { ip, port: Number(port), token, running: !!syncServer, interfaces };
});

ipcMain.handle('sync:setIP', (_, ip) => {
    setSetting('syncServerIP', ip);
    saveDB();
    // Notify renderer immediately so the address box updates
    if (win && !win.isDestroyed()) {
        win.webContents.send('sync:ipChanged', { ip, port: SYNC_PORT });
    }
    return true;
});

ipcMain.handle('sync:setToken', (_, token) => {
    setSetting('syncToken', token);
    saveDB();
    return true;
});

ipcMain.handle('sync:restart', () => {
    stopSyncServer();
    startSyncServer();
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
        if (data.logs)      data.logs.forEach(r => {
            // Normalise missing/null fields so NOT-NULL columns never receive undefined
            const content = r.content ?? r.body ?? '';
            const body    = r.body    ?? '';
            const system  = r.system  || '';
            const tags    = typeof r.tags === 'string' ? r.tags : JSON.stringify(r.tags || []);
            db.run(
                'INSERT OR REPLACE INTO logs (id,ts,title,system,body,content,tags) VALUES (?,?,?,?,?,?,?)',
                [r.id, r.ts, r.title, system, body, content, tags]
            );
        });
        if (data.bookmarks) data.bookmarks.forEach(r  => {
            // Accept both legacy x/y and new lat/lon field names
            const lat  = r.lat ?? r.x ?? null;
            const lon  = r.lon ?? r.y ?? null;
            const tags = typeof r.tags === 'string' ? r.tags : JSON.stringify(r.tags || []);
            db.run(
                'INSERT OR REPLACE INTO bookmarks (id,ts,system,type,lat,lon,z,notes,tags) VALUES (?,?,?,?,?,?,?,?,?)',
                [r.id, r.ts, r.system, r.type || 'POI', lat, lon, r.z ?? null, r.notes || '', tags]
            );
        });
        if (data.visited)   data.visited.forEach(r    => db.run('INSERT OR IGNORE INTO visited (name,ts) VALUES (?,?)', [r.name, r.ts]));
        flushDB();
        return { ok: true };
    } catch (e) {
        console.error('Import error:', e);
        return { ok: false, error: e.message };
    }
});

// ── Body / Planet Notes ───────────────────────────────────────────────────────
ipcMain.handle('bodynotes:getAll', () =>
    queryAll('SELECT * FROM body_notes ORDER BY ts DESC')
        .map(r => ({ ...r, tags: JSON.parse(r.tags || '[]'), coords: JSON.parse(r.coords || '[]'), landable: !!r.landable }))
);

ipcMain.handle('bodynotes:save', (_, n) => {
    const tags   = JSON.stringify(n.tags   || []);
    const coords = JSON.stringify(n.coords || []);
    db.run(
        `INSERT OR REPLACE INTO body_notes
         (id,ts,system,body_name,body_type,star_class,atmo_type,gravity,landable,bio_signals,geo_signals,terraform,distance_ls,value,notes,tags,coords)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [n.id, n.ts, n.system, n.body_name, n.body_type||'', n.star_class||'', n.atmo_type||'',
         n.gravity||null, n.landable?1:0, n.bio_signals||0, n.geo_signals||0,
         n.terraform||'', n.distance_ls||null, n.value||0, n.notes||'', tags, coords]
    );
    saveDB();
    return true;
});

ipcMain.handle('bodynotes:delete', (_, id) => {
    db.run('DELETE FROM body_notes WHERE id=?', [id]);
    recordTombstone(id, 'body_note');
    saveDB();
    return true;
});
