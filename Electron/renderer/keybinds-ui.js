// keybinds-ui.js  (renderer)
//
// Builds the Settings → Keybinds panel inside <div id="keybinds-root">.
// Self-contained: only needs window.api.{getKeybinds,setKeybind,resetKeybind,keybindCapture}.
// If the main process or preload is older than this file, the panel still
// appears and says which one needs a restart, instead of silently vanishing.
(function () {
    'use strict';

    const root = document.getElementById('keybinds-root');
    if (!root) return;

    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const pretty = a => String(a || '').replace(/CommandOrControl/g, 'Ctrl').replace(/Super/g, 'Win');
    const say = m => { try { if (typeof toast === 'function') toast(m); } catch {} };

    const KEYS = {
        ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Space: 'Space', Tab: 'Tab',
        Enter: 'Enter', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End',
        PageUp: 'PageUp', PageDown: 'PageDown', Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/',
        Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Backquote: '`',
    };

    // KeyboardEvent -> Electron accelerator ("CommandOrControl+Alt+O"), or null while only modifiers are down.
    function comboFrom(e) {
        const c = e.code;
        let key = null;
        if (/^Key[A-Z]$/.test(c))                       key = c.slice(3);
        else if (/^Digit[0-9]$/.test(c))                key = c.slice(5);
        else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(c))    key = c;
        else                                            key = KEYS[c] || null;
        if (!key) return null;
        const mods = [];
        if (e.ctrlKey)  mods.push('CommandOrControl');
        if (e.altKey)   mods.push('Alt');
        if (e.shiftKey) mods.push('Shift');
        if (e.metaKey)  mods.push('Super');
        return [...mods, key].join('+');
    }

    let listening = null;          // { id, onKey } while waiting for a key press

    function stopListening() {
        if (!listening) return;
        document.removeEventListener('keydown', listening.onKey, true);
        listening = null;
        try { window.api.keybindCapture(false); } catch {}
    }

    function paintShell(inner) {
        root.innerHTML =
            `<div class="panel">
                <div class="panel-title">Keybinds</div>
                <div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);line-height:2;margin-bottom:12px">
                    Global hotkeys — they work while Elite is in front. Click <span style="color:var(--ed-cyan)">REBIND</span>,
                    then press the new combination (<span style="color:var(--ed-cyan)">Esc</span> cancels).
                    Avoid combinations Elite itself uses.
                </div>
                ${inner}
            </div>`;
    }

    function paintProblem(msg) {
        paintShell(`<div style="font-family:var(--font-mono);font-size:11px;color:var(--ed-orange);line-height:1.8">✖ ${esc(msg)}</div>`);
    }

    function paint(list) {
        paintShell('<div id="kb-rows"></div>');
        const box = root.querySelector('#kb-rows');
        list.forEach(k => {
            const isDefault = k.accel.toLowerCase() === k.def.toLowerCase();
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--border-o)';
            row.innerHTML =
                `<div style="flex:1;min-width:0">
                    <div style="font-family:var(--font-hud);font-size:11px;letter-spacing:2px;color:var(--text)">${esc(k.label.toUpperCase())}</div>
                    <div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);line-height:1.6">${esc(k.desc)}</div>
                    <div data-msg style="font-family:var(--font-mono);font-size:9px;color:var(--ed-orange);min-height:12px">${k.ok ? '' : '✖ ' + esc(k.error || 'Could not register this combination')}</div>
                </div>
                <div style="font-family:var(--font-mono);font-size:12px;white-space:nowrap;padding:4px 10px;border:1px solid var(--border-o);color:${k.ok ? 'var(--ed-cyan)' : 'var(--ed-orange)'}">${esc(pretty(k.accel))}</div>
                <button class="btn btn-c btn-sm" data-act="bind">REBIND</button>
                <button class="btn btn-sm" data-act="reset" ${isDefault ? 'disabled style="opacity:.35"' : ''}>RESET</button>`;
            row.querySelector('[data-act=bind]').onclick  = () => listen(k.id, row);
            row.querySelector('[data-act=reset]').onclick = () => reset(k.id, row);
            box.appendChild(row);
            // keep the "Toggle in-game with …" hints elsewhere on the page in sync
            document.querySelectorAll(`[data-kb="${k.id}"]`).forEach(el => { el.textContent = pretty(k.accel); });
        });
    }

    const showError = (row, m) => { const el = row.querySelector('[data-msg]'); if (el) el.textContent = '✖ ' + m; };

    async function applyResult(r, row, okMsg) {
        paint(r.list);
        if (r.ok) { say(okMsg); return; }
        // repaint made new rows; find ours again by label and show the reason there
        const idx = r.list.findIndex(x => x.id === row.__id);
        const fresh = root.querySelectorAll('#kb-rows > div')[idx];
        if (fresh) showError(fresh, r.error);
    }

    function listen(id, row) {
        stopListening();
        row.__id = id;
        const btn = row.querySelector('[data-act=bind]');
        btn.textContent = 'PRESS KEYS…';
        const onKey = async (e) => {
            e.preventDefault(); e.stopPropagation();
            if (e.key === 'Escape') { stopListening(); load(); return; }
            const combo = comboFrom(e);
            if (!combo) return;                          // still holding only Ctrl / Alt / Shift
            stopListening();
            try { await applyResult(await window.api.setKeybind(id, combo), row, '⌨ ' + pretty(combo) + ' bound'); }
            catch (err) { paintProblem('Could not save keybind: ' + err.message); }
        };
        listening = { id, onKey };
        // hotkeys must be released *before* we start listening
        Promise.resolve(window.api.keybindCapture(true)).then(() => {
            if (listening && listening.id === id) document.addEventListener('keydown', onKey, true);
        });
    }

    async function reset(id, row) {
        stopListening();
        row.__id = id;
        try { await applyResult(await window.api.resetKeybind(id), row, '⌨ Reset to default'); }
        catch (err) { paintProblem('Could not reset keybind: ' + err.message); }
    }

    async function load() {
        if (!window.api || typeof window.api.getKeybinds !== 'function')
            return paintProblem('This window is running an older preload.js. Fully quit CMDRSYS and start it again (a reload is not enough).');
        try {
            const r = await window.api.getKeybinds();
            paint(r.list);
        } catch (err) {
            paintProblem('The main process has no keybind support yet (' + err.message.split('\n')[0] + '). Replace main.js and keybinds.js, then fully quit and restart CMDRSYS.');
        }
    }

    window.addEventListener('beforeunload', stopListening);
    load();
})();
