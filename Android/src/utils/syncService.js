/**
 * syncService.js — LAN sync with the CMDRSYS Electron desktop app.
 *
 * The Electron app runs an HTTP server on port 45678.
 * Both devices must be on the same WiFi network.
 *
 * Endpoints:
 *   GET  /ping  — health check
 *   GET  /sync  — pull all bookmarks + logs + settings from desktop
 *   POST /sync  — push local bookmarks + logs to desktop (merge, last-ts-wins)
 */

const SYNC_URL_KEY   = 'cmdrsys_syncUrl';
const SYNC_TOKEN_KEY = 'cmdrsys_syncToken';
const FETCH_TIMEOUT  = 8000; // ms

// ── Config helpers ────────────────────────────────────────────────────────────

export function getSyncConfig() {
  return {
    url:   localStorage.getItem(SYNC_URL_KEY)   || '',
    token: localStorage.getItem(SYNC_TOKEN_KEY) || '',
  };
}

export function setSyncConfig({ url, token }) {
  if (url   !== undefined) localStorage.setItem(SYNC_URL_KEY,   url.trim());
  if (token !== undefined) localStorage.setItem(SYNC_TOKEN_KEY, token.trim());
}

// ── Fetch wrapper with timeout ────────────────────────────────────────────────

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

function authHeaders(token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h['X-Sync-Token'] = token;
  return h;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Ping the desktop sync server.
 * Returns { ok: true } on success or throws on failure.
 */
export async function pingDesktop() {
  const { url, token } = getSyncConfig();
  if (!url) throw new Error('No sync URL configured');
  const res = await fetchWithTimeout(`${url}/ping`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  return res.json();
}

/**
 * Pull all data from the desktop.
 * Returns { bookmarks, logs, settings, ts } or throws.
 */
export async function pullFromDesktop() {
  const { url, token } = getSyncConfig();
  if (!url) throw new Error('No sync URL configured');
  const res = await fetchWithTimeout(`${url}/sync`, { headers: authHeaders(token) });
  if (res.status === 401) throw new Error('Sync token mismatch — check token in settings');
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  return res.json();
}

/**
 * Push local bookmarks and logs to the desktop.
 * Desktop merges by id, newest ts wins.
 */
export async function pushToDesktop(bookmarks, logs) {
  const { url, token } = getSyncConfig();
  if (!url) throw new Error('No sync URL configured');
  const res = await fetchWithTimeout(`${url}/sync`, {
    method:  'POST',
    headers: authHeaders(token),
    body:    JSON.stringify({ bookmarks, logs }),
  });
  if (res.status === 401) throw new Error('Sync token mismatch — check token in settings');
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  return res.json();
}

/**
 * Full bidirectional sync:
 *  1. Pull from desktop
 *  2. Merge pulled data into local arrays (newest ts wins per id)
 *  3. Push merged local data back to desktop
 *
 * Returns { bookmarks, logs, settingsFromDesktop } — the merged local state
 * that the caller should persist and set in the store.
 */
export async function fullSync(localBookmarks, localLogs) {
  // 1. Pull
  const remote = await pullFromDesktop();

  // 2. Merge bookmarks
  const bmMap = new Map(localBookmarks.map(b => [b.id, b]));
  for (const rb of (remote.bookmarks || [])) {
    const local = bmMap.get(rb.id);
    if (!local || local.ts < rb.ts) bmMap.set(rb.id, rb);
  }
  const mergedBookmarks = [...bmMap.values()].sort((a, b) => b.ts - a.ts);

  // 3. Merge logs
  const logMap = new Map(localLogs.map(l => [l.id, l]));
  for (const rl of (remote.logs || [])) {
    const local = logMap.get(rl.id);
    if (!local || local.ts < rl.ts) logMap.set(rl.id, rl);
  }
  const mergedLogs = [...logMap.values()].sort((a, b) => b.ts - a.ts);

  // 4. Push merged set back
  await pushToDesktop(mergedBookmarks, mergedLogs);

  return {
    bookmarks:          mergedBookmarks,
    logs:               mergedLogs,
    settingsFromDesktop: remote.settings || {},
  };
}
