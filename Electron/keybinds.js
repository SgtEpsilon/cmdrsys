// keybinds.js  (main process)
//
// User-rebindable global hotkeys. Self-contained: main.js hands it the list of
// actions and the settings helpers, and it owns registration + the IPC the
// Settings page talks to.
//
//   const keybinds = require('./keybinds');
//   keybinds.init({ globalShortcut, ipcMain, getSetting, setSetting, saveDB, binds });
//   keybinds.registerAll();        // once the app is ready
//
// A bind is { id, label, desc, def, run }. The chosen combo is stored in the
// settings table as `keybind_<id>` (empty / missing = use `def`).

const VERSION = 2;

const MODS = new Set(['commandorcontrol', 'control', 'ctrl', 'command', 'cmd',
                      'alt', 'option', 'altgr', 'shift', 'super', 'meta']);
const KEY  = /^([A-Z0-9]|F([1-9]|1[0-9]|2[0-4])|Up|Down|Left|Right|Space|Tab|Enter|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Plus|Minus|[=,.\/;'\[\]\\`-])$/;
const ORDER = ['CommandOrControl', 'Alt', 'Shift', 'Super'];

// Any accelerator string -> canonical "CommandOrControl+Alt+O" form, or null if
// it can't be used as a global hotkey.
function normalise(str) {
    const parts = String(str || '').split('+').map(p => p.trim()).filter(Boolean);
    if (!parts.length) return null;
    const rawKey = parts[parts.length - 1];
    const key    = rawKey.length === 1 ? rawKey.toUpperCase() : rawKey;
    const mods   = parts.slice(0, -1);
    if (!KEY.test(key)) return null;
    if (!mods.every(m => MODS.has(m.toLowerCase()))) return null;
    // A bare letter as a *global* hotkey would hijack typing in every app.
    if (!mods.length && !/^F\d+$/.test(key)) return null;
    const canon = m => {
        m = m.toLowerCase();
        if (['commandorcontrol', 'control', 'ctrl', 'command', 'cmd'].includes(m)) return 'CommandOrControl';
        if (['alt', 'option', 'altgr'].includes(m)) return 'Alt';
        if (m === 'shift') return 'Shift';
        return 'Super';
    };
    const uniq = [...new Set(mods.map(canon))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    return [...uniq, key].join('+');
}

let deps = null;
const status = {};                       // id -> { ok, error }

const settingKey = b => 'keybind_' + b.id;
const current    = b => normalise(deps.getSetting(settingKey(b), '')) || b.def;
const same       = (a, b) => a.toLowerCase() === b.toLowerCase();

function registerAll() {
    try { deps.globalShortcut.unregisterAll(); } catch {}
    for (const b of deps.binds) {
        const accel = current(b);
        try {
            const ok = deps.globalShortcut.register(accel, () => {
                try { b.run(); } catch (e) { console.error('[keybinds]', b.id, 'handler failed:', e); }
            });
            status[b.id] = ok ? { ok: true } : { ok: false, error: 'Already in use by another application' };
        } catch (e) {
            status[b.id] = { ok: false, error: e.message };
        }
        console.log(`[keybinds] ${b.id} = ${accel} ${status[b.id].ok ? 'OK' : 'FAILED: ' + status[b.id].error}`);
    }
}

function list() {
    return deps.binds.map(b => ({
        id: b.id, label: b.label, desc: b.desc, def: b.def,
        accel: current(b),
        ok:    !status[b.id] || status[b.id].ok,
        error: (status[b.id] && status[b.id].error) || null,
    }));
}

const result = (ok, error) => ({ ok, error: error || null, list: list() });

function set(id, input) {
    const b = deps.binds.find(x => x.id === id);
    if (!b) return result(false, 'Unknown keybind');

    const accel = normalise(input);
    if (!accel) return result(false, 'Needs a modifier (Ctrl / Alt / Shift) plus a key');

    const clash = deps.binds.find(x => x.id !== id && same(current(x), accel));
    if (clash) { registerAll(); return result(false, `Already used by “${clash.label}”`); }

    const before = deps.getSetting(settingKey(b), '');
    deps.setSetting(settingKey(b), accel);
    registerAll();
    if (!status[id].ok) {                              // the OS refused it: roll back
        const err = status[id].error;
        deps.setSetting(settingKey(b), before);
        registerAll();
        return result(false, err);
    }
    deps.saveDB();
    return result(true);
}

function reset(id) {
    const b = deps.binds.find(x => x.id === id);
    if (!b) return result(false, 'Unknown keybind');
    const clash = deps.binds.find(x => x.id !== id && same(current(x), b.def));
    if (clash) return result(false, `Default is in use by “${clash.label}” — rebind that one first`);
    deps.setSetting(settingKey(b), '');
    registerAll();
    deps.saveDB();
    return result(true);
}

function init(d) {
    deps = d;
    d.ipcMain.handle('keybinds:getAll',  ()        => ({ version: VERSION, list: list() }));
    d.ipcMain.handle('keybinds:set',     (_, id, a) => set(id, a));
    d.ipcMain.handle('keybinds:reset',   (_, id)    => reset(id));
    // While the page is listening for a key press the hotkeys are released, so
    // pressing an existing combo reaches the page instead of firing its action.
    d.ipcMain.handle('keybinds:capture', (_, on) => {
        if (on) { try { d.globalShortcut.unregisterAll(); } catch {} }
        else registerAll();
        return true;
    });
}

module.exports = { init, registerAll, list, normalise, VERSION };
