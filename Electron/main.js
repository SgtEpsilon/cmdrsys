const { app, BrowserWindow, ipcMain, dialog, shell, screen, globalShortcut } = require('electron');
const overlayMath = require('./overlayMath');
const { Worker } = require('worker_threads');
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

// 'Saved Games' is a Windows "known folder" (FOLDERID_SavedGames). Most
// installs keep it at %USERPROFILE%\Saved Games, but a user can relocate it
// (Properties > Location, same as Documents/Downloads), and OneDrive "PC
// folder backup" can move it too. When that happens the hardcoded path is
// wrong even though it "looks right". Resolve the real location from the
// registry first, and only fall back to the hardcoded guess if that fails.
function getWindowsSavedGamesDir() {
    const { execFileSync } = require('child_process');
    const GUID = '{4C5C32FF-BB9D-43b0-B5B4-2D72E54EAAA4}'; // FOLDERID_SavedGames
    try {
        const out = execFileSync('reg', [
            'query',
            'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders',
            '/v', GUID,
        ], { encoding: 'utf8' });
        // Example line: "    {4C5C32FF-...}    REG_EXPAND_SZ    %USERPROFILE%\Saved Games"
        const match = out.match(/REG_(?:EXPAND_)?SZ\s+(.+)\r?$/m);
        if (match) {
            const expanded = match[1].trim().replace(/%([^%]+)%/g, (_, name) => process.env[name] || '');
            if (expanded && fs.existsSync(expanded)) return expanded;
        }
    } catch (e) {
        console.warn('Could not read Saved Games location from registry, falling back:', e.message);
    }
    return null;
}

function getDefaultJournalDir() {
    if (process.platform === 'win32') {
        const savedGames = getWindowsSavedGamesDir()
            || path.join(process.env.USERPROFILE || os.homedir(), 'Saved Games');
        const dir = path.join(savedGames, 'Frontier Developments', 'Elite Dangerous');
        console.log('[journal] resolved default journal directory:', dir, fs.existsSync(dir) ? '(exists)' : '(does not exist)');
        return dir;
    }
    // Wine/Proton on Linux
    const proton = path.join(os.homedir(), '.steam', 'steam', 'steamapps', 'compatdata',
        '359320', 'pfx', 'drive_c', 'users', 'steamuser',
        'Saved Games', 'Frontier Developments', 'Elite Dangerous');
    return fs.existsSync(proton) ? proton : null;
}

// (Journal file discovery now lives in journalWorker.js, alongside the rest
// of the parsing — see startJournalLoad below.)

// ─── Journal loading — runs in a background worker thread ────────────────────
// Journal files can span years of play and many MB, so reading + parsing them
// happens off the main thread (see journalWorker.js). This keeps the main
// process free the whole time to handle note/log/bookmark saves and other IPC
// — the app stays fully usable while journals load in the background.
let journalWatcher    = null;
let journalPath       = null;
let lastFileSize      = 0;
let journalLoadWorker = null;   // the in-flight background load, if any

// In-memory journal feed state — NOT stored in SQLite (avoids huge DB
// writes). We re-parse from files on each startup; only visited/meta is
// persisted.
//
// We deliberately do NOT keep the full raw event history in memory here.
// A long-running commander's journal can be hundreds of thousands of
// events, and shipping that whole array across a worker postMessage and
// then again across the journal:getEvents IPC call — both of which use
// the structured clone algorithm and block whichever thread is doing the
// (de)serializing — used to stall the app for a long time right after
// startup, which looked like a hang. So journalWorker.js reduces the raw
// history down to just what the UI actually needs, and that's all we
// hold onto: a capped, pre-filtered feed, a total count, and the two
// specific "latest event of this type" lookups the Route Planner needs.
let memFeedEvents    = [];   // interesting events only, newest-first, capped
let memEventCount    = 0;    // true total across all journal files
let memLatestLoadout = null; // most recent Loadout event with MaxJumpRange
let memLatestFSDJump = null; // most recent FSDJump event with JumpDist

// Same "interesting" set journalWorker.js uses, needed here too so live
// journal-watcher chunks (which arrive raw, a few lines at a time) can be
// folded into memFeedEvents the same way the bulk load's results are.
const JFEED_INTERESTING = new Set(['FSDJump','CarrierJump','Scan','Docked','Undocked',
    'Location','Screenshot','MissionAccepted','MissionCompleted','Died',
    'Resurrection','SupercruiseExit','LoadGame']);
const JFEED_CAP = 10000;

// Starts a background load of every journal file in `journalDir`. Resolves
// once parsing is done AND the resulting visited/settings rows have been
// written to the DB. Progress is streamed to the renderer via
// 'journal:progress' as each file finishes, so UI code should not await this
// before letting the user interact with the rest of the app — see
// 'renderer:ready' and 'journal:open' below. Cancels any load already in
// flight before starting a new one.
function startJournalLoad(journalDir) {
    if (journalLoadWorker) {
        journalLoadWorker.terminate();
        journalLoadWorker = null;
    }

    return new Promise((resolve, reject) => {
        // In a packaged build, __dirname points inside app.asar. worker_threads
        // can't load a script from inside that virtual archive, so this file is
        // marked "asarUnpack" in package.json and actually lives alongside
        // app.asar.unpacked instead. Rewriting the path here covers both the
        // packaged case and plain `electron .` dev runs (where __dirname never
        // contains "app.asar" and the .replace is a no-op).
        const workerPath = path.join(__dirname, 'journalWorker.js').replace('app.asar', 'app.asar.unpacked');
        if (!fs.existsSync(workerPath)) {
            reject(new Error(`journalWorker.js not found at ${workerPath} — check the "files"/"asarUnpack" entries in package.json`));
            return;
        }
        const worker = new Worker(workerPath, {
            workerData: { journalDir },
        });
        journalLoadWorker = worker;

        worker.on('message', async (msg) => {
            if (msg.type === 'progress') {
                if (win && !win.isDestroyed()) win.webContents.send('journal:progress', msg);
                return;
            }
            if (msg.type === 'warn') {
                console.warn(msg.message);
                return;
            }
            if (msg.type === 'error') {
                journalLoadWorker = null;
                worker.terminate();
                reject(new Error(msg.reason));
                return;
            }
            if (msg.type === 'done') {
                // Apply results on the main thread, in small batches — even
                // though this is just fast in-memory DB inserts (no more file
                // I/O), we yield periodically so a very long visited-systems
                // list still can't itself hold up other IPC for long.
                const visitStmt = db.prepare('INSERT OR IGNORE INTO visited (name, ts) VALUES (?, ?)');
                for (let i = 0; i < msg.visited.length; i++) {
                    visitStmt.run([msg.visited[i].name, msg.visited[i].ts]);
                    if (i % 200 === 199) await new Promise(r => setImmediate(r));
                }
                visitStmt.free();

                if (msg.cmdr)   setSetting('cmdr',   msg.cmdr);
                if (msg.ship)   setSetting('ship',   msg.ship);
                if (msg.system) setSetting('system', msg.system);
                flushDB();

                memFeedEvents    = msg.feedEvents;
                memEventCount    = msg.eventCount;
                memLatestLoadout = msg.latestLoadout;
                memLatestFSDJump = msg.latestFSDJump;
                startWatcher(msg.latestFile);

                journalLoadWorker = null;
                worker.terminate();
                resolve({
                    ok:         true,
                    fileCount:  msg.fileCount,
                    latestFile: path.basename(msg.latestFile),
                    count:      memEventCount,
                    cmdr:       msg.cmdr,
                    ship:       msg.ship,
                    system:     msg.system,
                });
            }
        });

        worker.on('error', (e) => {
            journalLoadWorker = null;
            reject(e);
        });
    });
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

    // Live chunks are always small (just the lines appended since the last
    // watch tick), so unlike the bulk startup load there's no perf concern
    // scanning them fully — fold them into the same capped feed state.
    memEventCount += events.length;
    const interesting = events.filter(ev => JFEED_INTERESTING.has(ev.event));
    if (interesting.length) {
        memFeedEvents = interesting.slice().reverse().concat(memFeedEvents);
        if (memFeedEvents.length > JFEED_CAP) memFeedEvents.length = JFEED_CAP;
    }
    // Chunk is chronological ascending, so the LAST matching entry (if any)
    // is the newest.
    const newLoadout = [...events].reverse().find(ev => ev.event === 'Loadout' && ev.MaxJumpRange);
    if (newLoadout) memLatestLoadout = newLoadout;
    const newFSD = [...events].reverse().find(ev => ev.event === 'FSDJump' && ev.JumpDist);
    if (newFSD) memLatestFSDJump = newFSD;

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
                    // Journal-derived visited systems — kept in sync too, so Android
                    // reflects what the desktop's journal reading has found without
                    // any manual file copying.
                    visited:   queryAll('SELECT * FROM visited ORDER BY ts DESC'),
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
                const visCount = queryGet('SELECT COUNT(*) as n FROM visited')?.n ?? 0;
                res.writeHead(200);
                res.end(JSON.stringify({
                    ok: true, app: 'CMDRSYS', schema_version: 2,
                    ts: Date.now(),
                    counts: { bookmarks: bmCount, logs: logCount, body_notes: bnCount, visited: visCount },
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

                    // Merge visited systems — EARLIEST ts wins per name (ts is
                    // first-visit time, unlike the other collections above where
                    // latest edit wins). Covers systems Android learned about via
                    // its manual journal-file import that the desktop hasn't seen.
                    if (Array.isArray(data.visited)) {
                        data.visited.forEach(v => {
                            if (!v || !v.name) return;
                            const existing = queryGet('SELECT ts FROM visited WHERE name = ?', [v.name]);
                            if (!existing) {
                                db.run('INSERT INTO visited (name, ts) VALUES (?, ?)', [v.name, v.ts]);
                                changed = true;
                            } else if (v.ts < existing.ts) {
                                db.run('UPDATE visited SET ts = ? WHERE name = ?', [v.ts, v.name]);
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

// ─── In-game overlay: surface markers ────────────────────────────────────────
// A second, transparent, click-through, always-on-top window that shows the
// direction + distance to every surface coordinate saved on the Body Note of
// the planet you're approaching. Data source is Elite's Status.json (rewritten
// by the game several times a second), which carries BodyName, Latitude,
// Longitude, Heading, Altitude and PlanetRadius whenever you're close enough
// to a planet for surface navigation. Elite must run Borderless or Windowed —
// overlays can't draw over exclusive fullscreen.
//
//  settings keys: overlay_enabled ('1'/'0'), overlay_pos, overlay_scale,
//                 overlay_opacity, overlay_max
const OVERLAY_W = 340, OVERLAY_H = 900, OVERLAY_MARGIN = 24;
const OVERLAY_POLL_MS = 500;
const OVERLAY_HOTKEY  = 'CommandOrControl+Alt+O';
const OVERLAY_CYCLE_HOTKEY = 'CommandOrControl+Alt+T';   // cycle glide target
let overlayWin = null;
let overlayTimer = null;
let overlayLastRaw = '';
let overlayLastActive = false;
let overlayPreviewTimer = null;
let overlayPreviewUntil = 0;
let overlayNotesCache = { ts: 0, notes: [] };
let overlayLastPayload = null;   // re-sent once the overlay page finishes loading
let overlaySamples = [];         // recent { t, alt, lat, lon } for measuring the flown path
let overlayTargetKey = null;     // marker the glide guidance is aimed at (null = nearest)
let overlayLastBody = '';
let overlayOrder = [];           // marker keys nearest-first, from the last payload

function getOverlaySettings() {
    return {
        enabled: getSetting('overlay_enabled', '0') === '1',
        pos:     getSetting('overlay_pos', 'top-right'),
        scale:   parseFloat(getSetting('overlay_scale', '1'))    || 1,
        opacity: parseFloat(getSetting('overlay_opacity', '0.9')) || 0.9,
        max:     parseInt(getSetting('overlay_max', '6'), 10)     || 6,
        glide:   getSetting('overlay_glide', '1') === '1',
        exitAlt: parseFloat(getSetting('overlay_exit_alt', '5000')) || 5000,
    };
}

function getJournalDirForStatus() {
    const saved = getSetting('journal_dir', '');
    return saved || getDefaultJournalDir();
}

// Body notes change rarely; re-read at most every 2s so notes edited (or
// synced from the phone) while you're parked at a body still show up.
function getOverlayNotes() {
    const now = Date.now();
    if (now - overlayNotesCache.ts > 2000) {
        overlayNotesCache = {
            ts: now,
            notes: queryAll('SELECT id, system, body_name, coords FROM body_notes').map(r => {
                let coords = [];
                try { coords = JSON.parse(r.coords || '[]'); } catch {}
                return { ...r, coords };
            }),
        };
    }
    return overlayNotesCache.notes;
}

function overlayPosition(pos, scale) {
    const b = screen.getPrimaryDisplay().bounds;
    const w = Math.round(OVERLAY_W * scale);
    const h = Math.min(Math.round(OVERLAY_H * scale), b.height - 2 * OVERLAY_MARGIN);
    const [v, hz] = pos.split('-');
    const x = hz === 'left' ? b.x + OVERLAY_MARGIN : b.x + b.width - w - OVERLAY_MARGIN;
    const y = v === 'top'    ? b.y + OVERLAY_MARGIN
            : v === 'bottom' ? b.y + b.height - h - OVERLAY_MARGIN
            :                  b.y + Math.round((b.height - h) / 2);
    return { x, y, width: w, height: h };
}

function ensureOverlayWindow() {
    if (overlayWin && !overlayWin.isDestroyed()) return overlayWin;
    const s = getOverlaySettings();
    overlayWin = new BrowserWindow({
        ...overlayPosition(s.pos, s.scale),
        transparent: true,
        frame: false,
        resizable: false,
        movable: false,
        focusable: false,        // never steal focus from the game
        skipTaskbar: true,
        alwaysOnTop: true,
        hasShadow: false,
        show: false,
        fullscreenable: false,
        backgroundColor: '#00000000',
        webPreferences: {
            preload: path.join(__dirname, 'overlayPreload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    overlayWin.setIgnoreMouseEvents(true);          // click-through
    overlayWin.setAlwaysOnTop(true, 'screen-saver');
    try { overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch {}
    overlayWin.webContents.setZoomFactor(s.scale);
    overlayWin.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
    overlayWin.webContents.on('did-finish-load', () => {
        if (overlayLastPayload && overlayWin && !overlayWin.isDestroyed())
            overlayWin.webContents.send('overlay:update', overlayLastPayload);
    });
    overlayWin.on('closed', () => { overlayWin = null; });
    return overlayWin;
}

function overlayPush(payload) {
    const s = getOverlaySettings();
    const active = !!(payload && payload.active);
    if (active) {
        const w = ensureOverlayWindow();
        payload.layout = { pos: s.pos, opacity: s.opacity };
        overlayLastPayload = payload;
        if (!w.isVisible()) w.showInactive();
        w.webContents.send('overlay:update', payload);
    } else if (overlayWin && !overlayWin.isDestroyed()) {
        overlayLastPayload = null;
        overlayWin.webContents.send('overlay:update', { active: false });
        if (overlayWin.isVisible()) overlayWin.hide();
    }
    overlayLastActive = active;
}

function overlayTick() {
    if (Date.now() < overlayPreviewUntil) return;      // preview owns the window
    const dir = getJournalDirForStatus();
    if (!dir) return;
    const file = path.join(dir, 'Status.json');
    fs.readFile(file, 'utf8', (err, raw) => {
        if (err || !raw) { if (overlayLastActive) overlayPush(null); overlayLastRaw = ''; return; }
        if (raw === overlayLastRaw) return;             // nothing changed since last tick
        let st;
        try { st = JSON.parse(raw); } catch { return; } // caught the game mid-write; next tick
        overlayLastRaw = raw;
        // File mtime has millisecond precision (the in-file timestamp only has seconds),
        // which matters for measuring speed between samples.
        fs.stat(file, (e2, stt) => overlayProcess(st, e2 ? Date.now() : stt.mtimeMs));
    });
}

function overlayProcess(st, sampleTime) {
    let payload = null;
    if (st.BodyName && typeof st.Latitude === 'number') {
        const s = getOverlaySettings();

        // Keep ~10 s of position/altitude samples so the glide guidance can measure
        // the path actually being flown. Reset when the body changes or after a gap.
        if (st.BodyName !== overlayLastBody) {
            overlaySamples = []; overlayTargetKey = null; overlayLastBody = st.BodyName;
        }
        const last = overlaySamples[overlaySamples.length - 1];
        if (last && sampleTime - last.t > 5000) overlaySamples = [];
        if (!last || sampleTime > last.t) {
            overlaySamples.push({ t: sampleTime, alt: Number(st.Altitude) || 0, lat: st.Latitude, lon: st.Longitude });
            while (overlaySamples.length && sampleTime - overlaySamples[0].t > 10000) overlaySamples.shift();
        }

        const markers = overlayMath.collectMarkers(getOverlayNotes(), st.BodyName);
        payload = overlayMath.buildPayload(st, markers, s.max, 100, {
            enabled: s.glide, exitAlt: s.exitAlt, samples: overlaySamples, targetKey: overlayTargetKey,
        });
        overlayOrder = payload ? payload.order : [];
    } else {
        overlaySamples = []; overlayLastBody = '';
    }
    if (payload) overlayPush(payload);
    else if (overlayLastActive) overlayPush(null);
}

// Ctrl+Alt+T — aim the glide guidance at the next marker (nearest → farthest → nearest…)
function cycleOverlayTarget() {
    if (!overlayOrder.length) return;
    const cur = overlayTargetKey && overlayOrder.includes(overlayTargetKey)
        ? overlayOrder.indexOf(overlayTargetKey)
        : (overlayLastPayload && overlayLastPayload.targetKey ? overlayOrder.indexOf(overlayLastPayload.targetKey) : -1);
    overlayTargetKey = overlayOrder[(cur + 1) % overlayOrder.length];
    overlayLastRaw = '';        // force the next tick to re-evaluate with the new target
    overlayTick();
}

// Demo data so placement/size/opacity can be checked without flying anywhere.
function overlayPreview() {
    const w = ensureOverlayWindow();
    const t0 = Date.now();
    overlayPreviewUntil = t0 + 10000;
    clearInterval(overlayPreviewTimer);
    const demo = [
        { key: 'a', label: 'Guardian beacon',    bearing:  40, dist: 240000 },
        { key: 'b', label: 'Biological cluster', bearing: 175, dist: 180000 },
        { key: 'd', label: 'Abandoned camp',     bearing: 120, dist: 1850 },
        { key: 'c', label: 'Crashed ship',       bearing: 290, dist: 64 },
    ];
    const tick = () => {
        if (Date.now() >= overlayPreviewUntil) {
            clearInterval(overlayPreviewTimer);
            overlayPreviewUntil = 0;
            overlayLastRaw = '';
            overlayPush(null);
            return;
        }
        const el  = (Date.now() - t0) / 1000;
        const hdg = (el * 25) % 360;
        const req = 12.4;
        const actual = req + 7 * Math.sin(el * 0.9);          // wander either side of the ideal path
        const delta  = actual - req;
        overlayPush({
            active: true, preview: true, body: 'HIP 36601 C 5 a',
            heading: hdg, altitude: 42000, lat: 0, lon: 0, hidden: 0,
            targetKey: 'b',
            markers: demo.map(d => ({
                key: d.key, label: d.label, dist: d.dist, bearing: d.bearing, target: d.key === 'b',
                rel: overlayMath.wrap180(d.bearing - hdg), onSite: d.dist <= 100,
            })),
            glide: getOverlaySettings().glide ? {
                label: 'Biological cluster', exitAlt: getOverlaySettings().exitAlt,
                required: req, actual, delta, groundM: 180000,
                state: delta > 1.5 ? 'steep' : delta < -1.5 ? 'shallow' : 'ok',
                missM: delta * 4000, noReach: false, etaS: 38, speed: 2500, window: 'ok',
            } : null,
        });
    };
    tick();
    overlayPreviewTimer = setInterval(tick, 100);
}

function applyOverlaySettings() {
    const s = getOverlaySettings();
    overlayLastRaw = '';
    overlayNotesCache.ts = 0;

    if (!s.enabled) {
        clearInterval(overlayTimer); overlayTimer = null;
        if (overlayWin && !overlayWin.isDestroyed() && !overlayPreviewUntil) {
            overlayWin.destroy(); overlayWin = null;
        }
        overlayLastActive = false;
        return;
    }
    if (overlayWin && !overlayWin.isDestroyed()) {
        overlayWin.setBounds(overlayPosition(s.pos, s.scale));
        overlayWin.webContents.setZoomFactor(s.scale);
    }
    if (!overlayTimer) overlayTimer = setInterval(overlayTick, OVERLAY_POLL_MS);
    overlayTick();
}

function toggleOverlayHotkey() {
    const now = getSetting('overlay_enabled', '0') === '1';
    setSetting('overlay_enabled', now ? '0' : '1');
    saveDB();
    applyOverlaySettings();
    if (win && !win.isDestroyed()) win.webContents.send('overlay:enabledChanged', !now);
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
    win.on('closed', () => {
        clearInterval(overlayTimer); overlayTimer = null;
        clearInterval(overlayPreviewTimer);
        if (overlayWin && !overlayWin.isDestroyed()) overlayWin.destroy();
        overlayWin = null;
    });
    // win.webContents.openDevTools();
}

// Window opens FIRST, then journals load in response to renderer:ready
app.whenReady().then(async () => {
    await initDB();
    createWindow();
    startSyncServer();   // ← start sync server alongside the app
    applyOverlaySettings();
    try { globalShortcut.register(OVERLAY_HOTKEY, toggleOverlayHotkey); }
    catch (e) { console.warn('Overlay hotkey unavailable:', e.message); }
    try { globalShortcut.register(OVERLAY_CYCLE_HOTKEY, cycleOverlayTarget); }
    catch (e) { console.warn('Overlay target hotkey unavailable:', e.message); }
    app.on('activate', () => { if (!win || win.isDestroyed()) createWindow(); });
});

app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch {} });

app.on('window-all-closed', () => {
    if (journalWatcher) journalWatcher.close();
    if (journalLoadWorker) journalLoadWorker.terminate();
    stopSyncServer();
    if (process.platform !== 'darwin') app.quit();
});

// ─── Window Controls ──────────────────────────────────────────────────────────
ipcMain.on('window:minimize', () => win.minimize());
ipcMain.on('window:maximize', () => win.isMaximized() ? win.unmaximize() : win.maximize());
ipcMain.on('window:close',    () => win.close());
ipcMain.handle('shell:openExternal', (_, url) => shell.openExternal(url));

// ─── App info ─────────────────────────────────────────────────────────────────
// app.getVersion() returns the "version" field from package.json (the one
// electron-builder also stamps into the packaged build), so this can never
// drift from what's actually shipped — no separate version string to keep
// in sync by hand.
ipcMain.handle('app:getVersion', () => app.getVersion());

// ─── renderer:ready — triggered by renderer on mount ─────────────────────────
// Returns immediately — journal loading runs in the background (see
// startJournalLoad) and reports progress/completion via 'journal:progress'
// and 'journal:autoLoadComplete', so the renderer never has to sit on a
// loading screen: it can mount the real UI and let the user read/edit their
// own notes right away while journals load behind the scenes.
ipcMain.handle('renderer:ready', () => {
    const savedDir   = getSetting('journal_dir', '');
    const journalDir = savedDir || getDefaultJournalDir();

    if (!journalDir || !fs.existsSync(journalDir)) {
        return { autoLoaded: false, reason: 'No journal directory found' };
    }

    startJournalLoad(journalDir)
        .then(result => {
            if (win && !win.isDestroyed()) win.webContents.send('journal:autoLoadComplete', { ok: true, ...result });
        })
        .catch(e => {
            console.error('Auto-load failed:', e);
            if (win && !win.isDestroyed()) win.webContents.send('journal:autoLoadComplete', { ok: false, reason: e.message });
        });

    return { autoLoaded: true, pending: true };
});

// ─── Settings IPC ─────────────────────────────────────────────────────────────
ipcMain.handle('settings:get',    (_, key, def) => getSetting(key, def));
ipcMain.handle('settings:set',    (_, key, val) => {
    setSetting(key, val); saveDB();
    if (String(key).startsWith('overlay_')) applyOverlaySettings();
    return true;
});
ipcMain.handle('overlay:preview', () => { overlayPreview(); return true; });
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
// Returns the capped, pre-filtered feed (newest-first) — not the raw
// journal history. See the memFeedEvents comment above for why.
ipcMain.handle('journal:getEvents', () => memFeedEvents);
ipcMain.handle('journal:getMeta', () => ({
    eventCount:    memEventCount,
    latestLoadout: memLatestLoadout,
    latestFSDJump: memLatestFSDJump,
}));
ipcMain.handle('journal:clearEvents', () => {
    memFeedEvents = []; memEventCount = 0;
    memLatestLoadout = null; memLatestFSDJump = null;
    return true;
});

// ─── journal:open — user manually picks a journal file/folder ─────────────────
// Same background-loading approach as renderer:ready: return as soon as the
// directory is chosen, then let startJournalLoad report back via
// 'journal:autoLoadComplete' once it's actually done. The rest of the app
// (notes, bookmarks, logs) stays fully usable while it loads.
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

    startJournalLoad(chosenDir)
        .then(result => {
            if (win && !win.isDestroyed()) win.webContents.send('journal:autoLoadComplete', { ok: true, ...result });
        })
        .catch(e => {
            if (win && !win.isDestroyed()) win.webContents.send('journal:autoLoadComplete', { ok: false, reason: e.message });
        });

    return { ok: true, pending: true };
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
        version:      '1.0',
        exported:     new Date().toISOString(),
        settings:     queryAll('SELECT * FROM settings'),
        logs:         queryAll('SELECT * FROM logs'),
        bookmarks:    queryAll('SELECT * FROM bookmarks'),
        visited:      queryAll('SELECT * FROM visited'),
        // Previously omitted — a "backup" silently lost body notes and any
        // pending deletion tombstones (which stop deleted items reappearing
        // via sync) on restore.
        bodyNotes:    queryAll('SELECT * FROM body_notes'),
        deletedItems: queryAll('SELECT * FROM deleted_items'),
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
        if (data.visited)      data.visited.forEach(r => db.run('INSERT OR IGNORE INTO visited (name,ts) VALUES (?,?)', [r.name, r.ts]));
        if (data.bodyNotes)    data.bodyNotes.forEach(r => {
            const tags   = typeof r.tags   === 'string' ? r.tags   : JSON.stringify(r.tags   || []);
            const coords = typeof r.coords === 'string' ? r.coords : JSON.stringify(r.coords || []);
            db.run(
                `INSERT OR REPLACE INTO body_notes
                 (id,ts,system,body_name,body_type,star_class,atmo_type,gravity,landable,bio_signals,geo_signals,terraform,distance_ls,value,notes,tags,coords)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [r.id, r.ts, r.system, r.body_name, r.body_type||'', r.star_class||'', r.atmo_type||'',
                 r.gravity||null, r.landable?1:0, r.bio_signals||0, r.geo_signals||0,
                 r.terraform||'', r.distance_ls||null, r.value||0, r.notes||'', tags, coords]
            );
        });
        if (data.deletedItems) data.deletedItems.forEach(r => db.run(
            'INSERT OR REPLACE INTO deleted_items (id,type,deleted_at) VALUES (?,?,?)',
            [r.id, r.type, r.deleted_at]
        ));
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
