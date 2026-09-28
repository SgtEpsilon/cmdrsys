// journalWorker.js
//
// Reads and parses every Elite Dangerous journal file in a directory.
// Runs on a worker thread (see main.js: startJournalLoad) so this
// disk I/O + JSON parsing — which can mean years of journal files —
// never blocks the main process. The main process stays free to handle
// note/log/bookmark IPC and DB writes the whole time this runs.
//
// IMPORTANT: we do NOT ship the full raw event list back to the main
// process. A veteran commander's journal history can be hundreds of
// thousands (even millions) of events, and postMessage()/IPC both use
// the structured clone algorithm, which serializes/deserializes
// synchronously on whichever thread receives the message. Handing over
// a huge raw array used to stall the main process (and, via the later
// journal:getEvents IPC call, the renderer's UI thread too) for a long
// time right after "reading journal files" finished — which is exactly
// what looked like the app hanging on first start. Instead we reduce
// down to only what the UI actually uses: a capped, pre-filtered feed
// of "interesting" events, a total count, and the couple of specific
// latest-event lookups the Route Planner needs.

const fs   = require('fs');
const path = require('path');
const { parentPort, workerData } = require('worker_threads');

// Same set the renderer's journal feed cares about (see buildJFeedFiltered
// in renderer/index.html) — kept in sync manually since this worker has no
// module system shared with the renderer.
const INTERESTING = new Set(['FSDJump','CarrierJump','Scan','Docked','Undocked',
    'Location','Screenshot','MissionAccepted','MissionCompleted','Died',
    'Resurrection','SupercruiseExit','LoadGame']);

// However long someone's career is, the feed only ever needs to show the
// most recent handful of thousand entries — older ones are still fully
// reflected in Visited Systems / stats, just not the scrolling feed.
const FEED_CAP = 10000;

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

    // Only "interesting" events are kept in full — everything else is
    // counted but discarded once scanned, so memory stays proportional to
    // the feed, not to the entire journal history.
    const feedEvents = [];
    let eventCount = 0;
    let latestLoadout  = null;   // most recent Loadout event with MaxJumpRange
    let latestFSDJump  = null;   // most recent FSDJump event with JumpDist

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
            eventCount++;

            if (ev.event === 'Commander' && ev.Name) cmdr = ev.Name;
            if (ev.event === 'LoadGame'  && ev.Ship) ship = (ev.Ship_Localised || ev.Ship).toUpperCase();
            if (['FSDJump', 'CarrierJump', 'Location'].includes(ev.event) && ev.StarSystem) {
                system = ev.StarSystem;
                const ts = ev.timestamp ? new Date(ev.timestamp).getTime() : Date.now();
                if (!visitedMap.has(ev.StarSystem)) visitedMap.set(ev.StarSystem, ts);
            }

            if (ev.event === 'Loadout' && ev.MaxJumpRange) latestLoadout = ev;
            if (ev.event === 'FSDJump' && ev.JumpDist)     latestFSDJump = ev;

            if (INTERESTING.has(ev.event)) feedEvents.push(ev);
        }

        parentPort.postMessage({
            type:  'progress',
            file:  path.basename(file),
            done:  idx + 1,
            total: files.length,
        });
    });

    // Newest-first, capped — matches what the feed displays.
    feedEvents.reverse();
    if (feedEvents.length > FEED_CAP) feedEvents.length = FEED_CAP;

    parentPort.postMessage({
        type: 'done',
        feedEvents,
        eventCount,
        latestLoadout,
        latestFSDJump,
        visited: Array.from(visitedMap, ([name, ts]) => ({ name, ts })),
        cmdr, ship, system,
        fileCount:  files.length,
        latestFile: files[files.length - 1],
    });
}

run(workerData.journalDir);
