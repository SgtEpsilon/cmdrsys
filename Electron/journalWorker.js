// journalWorker.js
//
// Reads and parses every Elite Dangerous journal file in a directory.
// Runs on a worker thread (see main.js: startJournalLoad) so this
// disk I/O + JSON parsing — which can mean years of journal files —
// never blocks the main process. The main process stays free to handle
// note/log/bookmark IPC and DB writes the whole time this runs.

const fs   = require('fs');
const path = require('path');
const { parentPort, workerData } = require('worker_threads');

function parseLine(line) {
    try { return JSON.parse(line.trim()); } catch { return null; }
}

function getAllJournalFiles(dir) {
    if (!dir || !fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter(f => /^Journal\.\d{4}-\d{2}-\d{2}T\d{6}\.\d{2}\.log$/.test(f))
        .sort()                          // lexicographic == chronological for this format
        .map(f => path.join(dir, f));
}

function run(journalDir) {
    const files = getAllJournalFiles(journalDir);
    if (files.length === 0) {
        parentPort.postMessage({ type: 'error', reason: 'No journal files found in ' + journalDir });
        return;
    }

    const events = [];
    // Dedupe visited systems here (keep earliest ts) so we only ship the
    // main thread the rows it actually needs to INSERT OR IGNORE.
    const visitedMap = new Map();
    let cmdr = '', ship = '', system = '';

    files.forEach((file, idx) => {
        let text;
        try {
            text = fs.readFileSync(file, 'utf8');
        } catch (e) {
            parentPort.postMessage({ type: 'warn', message: `Cannot read ${file}: ${e.message}` });
            return;
        }

        const lines = text.split('\n');
        for (const line of lines) {
            const ev = parseLine(line);
            if (!ev) continue;
            events.push(ev);

            if (ev.event === 'Commander' && ev.Name) cmdr = ev.Name;
            if (ev.event === 'LoadGame'  && ev.Ship) ship = (ev.Ship_Localised || ev.Ship).toUpperCase();
            if (['FSDJump', 'CarrierJump', 'Location'].includes(ev.event) && ev.StarSystem) {
                system = ev.StarSystem;
                const ts = ev.timestamp ? new Date(ev.timestamp).getTime() : Date.now();
                if (!visitedMap.has(ev.StarSystem)) visitedMap.set(ev.StarSystem, ts);
            }
        }

        parentPort.postMessage({
            type:  'progress',
            file:  path.basename(file),
            done:  idx + 1,
            total: files.length,
        });
    });

    parentPort.postMessage({
        type: 'done',
        events,
        visited: Array.from(visitedMap, ([name, ts]) => ({ name, ts })),
        cmdr, ship, system,
        fileCount:  files.length,
        latestFile: files[files.length - 1],
    });
}

run(workerData.journalDir);
